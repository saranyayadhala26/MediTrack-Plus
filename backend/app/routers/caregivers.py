"""Caregiver Management Router for MediTrack+ (Phase 9.1).

Supports caregiver relationship CRUD for authenticated patients:
- POST /api/v1/caregivers: Link a registered caregiver account (with email normalization,
  rejection of self-linking, patient-role accounts, non-existent accounts, duplicate active
  links, and in-place reactivation of revoked links).
- GET /api/v1/caregivers: Retrieve caregiver relationships scoped strictly to caller's patientId,
  with optional status filtering.
- DELETE /api/v1/caregivers/{caregiver_id}: Soft-revoke a caregiver link (sets status="revoked"),
  scoped to caller's patientId with safe 404 behavior for isolation.

Enforces:
- Strict patient isolation and safe cross-patient privacy.
- Caregiver access blocked on patient-management endpoints (HTTP 403 Forbidden).
- No sensitive authentication credentials returned.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
import pymongo

from app.core.dependencies import get_current_patient
from app.db.mongodb import get_caregivers_collection, get_users_collection
from app.models.collections import create_caregiver_document, now_utc
from app.schemas.caregiver import (
    CaregiverCreate,
    CaregiverResponse,
    CaregiverStatus,
)
from app.schemas.user import UserRole
from app.utils.mongo import document_to_dict, is_valid_object_id, to_object_id

logger = logging.getLogger("meditrack.caregivers")
router = APIRouter(tags=["Caregiver Management"])


@router.post("", response_model=CaregiverResponse, status_code=status.HTTP_201_CREATED)
async def create_or_reactivate_caregiver(
    caregiver_in: CaregiverCreate,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Link a caregiver to the authenticated patient or reactivate a previously revoked link.

    Rules:
    1. Caller must be an authenticated patient (derived from JWT).
    2. Caregiver email is trimmed and normalized to lowercase.
    3. Self-linking is rejected (HTTP 400 Bad Request).
    4. Target email must belong to an existing registered user (HTTP 404 Not Found if missing).
    5. Target user must have role == CAREGIVER (HTTP 400 Bad Request if registered as PATIENT).
    6. If an active relationship already exists -> HTTP 409 Conflict.
    7. If a revoked relationship exists -> reactivate the SAME document (status="active", updated fields).
    8. If no relationship exists -> create a new active relationship document.
    """
    patient_oid = to_object_id(current_user["id"])
    patient_email = current_user.get("email", "").strip().lower()
    normalized_email = caregiver_in.caregiverEmail.strip().lower()

    # Rule 3: Reject self-linking
    if normalized_email == patient_email:
        logger.warning("Patient %s attempted self-linking as caregiver", current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patients cannot link themselves as their own caregiver.",
        )

    # Rule 4: Search users collection for registered caregiver
    users_coll = get_users_collection()
    caregiver_user = await users_coll.find_one({"email": normalized_email})
    if not caregiver_user:
        logger.info("Caregiver linking failed: no user found for email %s", normalized_email)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered MediTrack+ user found with this email address. The caregiver must register an account first.",
        )

    # Rule 5: Verify target user has role == CAREGIVER
    target_role = caregiver_user.get("role")
    if target_role != UserRole.CAREGIVER.value and target_role != UserRole.CAREGIVER:
        logger.warning(
            "Caregiver linking failed: user %s has role %s (expected caregiver)",
            normalized_email,
            target_role,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The specified user account is registered as a patient, not a caregiver. Only caregiver accounts can be linked.",
        )

    # Rule 6-8: Check existing relationship in caregivers collection
    caregivers_coll = get_caregivers_collection()
    existing_link = await caregivers_coll.find_one({
        "patientId": patient_oid,
        "caregiverEmail": normalized_email,
    })

    if existing_link:
        existing_status = existing_link.get("status")
        if existing_status == CaregiverStatus.ACTIVE.value or existing_status == "active":
            logger.warning(
                "Duplicate active caregiver link attempt: patient %s and caregiver %s",
                current_user["id"],
                normalized_email,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An active caregiver relationship already exists with this caregiver.",
            )

        # Reactivate revoked relationship in-place
        now = now_utc()
        update_fields = {
            "caregiverName": caregiver_in.caregiverName.strip(),
            "caregiverPhone": caregiver_in.caregiverPhone.strip(),
            "relationship": caregiver_in.relationship.strip(),
            "status": CaregiverStatus.ACTIVE.value,
            "updatedAt": now,
        }
        await caregivers_coll.update_one(
            {"_id": existing_link["_id"]},
            {"$set": update_fields},
        )
        existing_link.update(update_fields)
        logger.info(
            "Reactivated revoked caregiver link %s for patient %s (Caregiver: %s)",
            existing_link["_id"],
            patient_oid,
            normalized_email,
        )
        response.status_code = status.HTTP_200_OK
        return document_to_dict(existing_link)

    # Create new active relationship
    doc = create_caregiver_document(
        patient_id=patient_oid,
        caregiver_name=caregiver_in.caregiverName,
        caregiver_email=normalized_email,
        caregiver_phone=caregiver_in.caregiverPhone,
        relationship=caregiver_in.relationship,
        status=CaregiverStatus.ACTIVE.value,
    )
    try:
        result = await caregivers_coll.insert_one(doc)
        doc["_id"] = result.inserted_id
    except pymongo.errors.DuplicateKeyError:
        logger.warning(
            "Concurrent duplicate insert race detected for patient %s and caregiver %s",
            patient_oid,
            normalized_email,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active caregiver relationship already exists with this caregiver.",
        )

    logger.info(
        "Created new active caregiver link %s for patient %s (Caregiver: %s)",
        doc["_id"],
        patient_oid,
        normalized_email,
    )
    response.status_code = status.HTTP_201_CREATED
    return document_to_dict(doc)


@router.get("", response_model=List[CaregiverResponse])
async def list_caregivers(
    status_filter: Optional[CaregiverStatus] = Query(
        None,
        alias="status",
        description="Filter by relationship status (active, revoked)",
    ),
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> List[Dict[str, Any]]:
    """
    Retrieve all caregiver relationships belonging to the authenticated patient.

    - Authenticated patient identity is authoritative.
    - Scoped strictly to caller's patientId (cross-patient isolation).
    - Optional status filter supported.
    """
    patient_oid = to_object_id(current_user["id"])
    query: Dict[str, Any] = {"patientId": patient_oid}

    if status_filter:
        query["status"] = status_filter.value

    caregivers_coll = get_caregivers_collection()
    cursor = caregivers_coll.find(query).sort("createdAt", pymongo.DESCENDING)
    docs = await cursor.to_list(length=100)
    return [document_to_dict(d) for d in docs]


@router.delete("/{caregiver_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_caregiver(
    caregiver_id: str,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> None:
    """
    Revoke a caregiver relationship for the authenticated patient.

    - Soft revocation: updates status to 'revoked' and sets updatedAt to now.
    - Does NOT physically delete the document, preserving audit history and unique index integrity.
    - Scoped strictly to caller's patientId.
    - Returns safe HTTP 404 if the relationship does not exist or belongs to another patient.
    """
    if not is_valid_object_id(caregiver_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caregiver relationship not found.",
        )

    patient_oid = to_object_id(current_user["id"])
    link_oid = to_object_id(caregiver_id)

    caregivers_coll = get_caregivers_collection()
    relationship = await caregivers_coll.find_one({
        "_id": link_oid,
        "patientId": patient_oid,
    })

    if not relationship:
        logger.warning(
            "Patient %s attempted to revoke non-existent or unowned caregiver link %s",
            patient_oid,
            caregiver_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caregiver relationship not found.",
        )

    await caregivers_coll.update_one(
        {"_id": link_oid},
        {
            "$set": {
                "status": CaregiverStatus.REVOKED.value,
                "updatedAt": now_utc(),
            }
        },
    )
    logger.info(
        "Caregiver link %s revoked by patient %s",
        link_oid,
        patient_oid,
    )
    return None
