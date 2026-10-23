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

from app.core.dependencies import get_current_caregiver, get_current_patient
from app.db.mongodb import (
    get_caregivers_collection,
    get_notifications_collection,
    get_users_collection,
)
from app.models.collections import create_caregiver_document, now_utc
from app.schemas.caregiver import (
    CaregiverAlert,
    CaregiverCreate,
    CaregiverMonitoringSummary,
    CaregiverResponse,
    CaregiverStatus,
    LinkedPatientResponse,
)
from app.schemas.notification import (
    NotificationResponse,
    NotificationStatus,
    NotificationType,
)
from app.schemas.user import UserRole
from app.services.caregiver_alert_service import CaregiverAlertService
from app.services.missed_dose_rules import MissedDoseRuleEvaluator
from app.services.missed_dose_service import MissedDoseService
from app.services.occurrence_engine import get_reference_today, parse_date
from app.services.adherence_service import calculate_adherence_summary
from app.routers.calendar import build_calendar_response, build_streak_response
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

    # Resolve authoritative caregiver details (supports email-only linking from registered account data)
    final_name = (
        caregiver_in.caregiverName.strip()
        if caregiver_in.caregiverName and caregiver_in.caregiverName.strip()
        else caregiver_user.get("fullName") or "Caregiver"
    )
    final_phone = (
        caregiver_in.caregiverPhone.strip()
        if caregiver_in.caregiverPhone and caregiver_in.caregiverPhone.strip()
        else caregiver_user.get("phone") or ""
    )
    final_relationship = (
        caregiver_in.relationship.strip()
        if caregiver_in.relationship and caregiver_in.relationship.strip()
        else "Caregiver"
    )

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
            "caregiverName": final_name,
            "caregiverPhone": final_phone,
            "relationship": final_relationship,
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
        caregiver_name=final_name,
        caregiver_email=normalized_email,
        caregiver_phone=final_phone,
        relationship=final_relationship,
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


# ==============================================================================
# CAREGIVER MONITORING ENDPOINTS (Phase 9.2.5)
# ==============================================================================

@router.get(
    "/patients",
    response_model=List[LinkedPatientResponse],
    summary="Retrieve active linked patients for the authenticated caregiver",
)
async def list_linked_patients(
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> List[Dict[str, Any]]:
    """
    Retrieve list of patients linked to the authenticated caregiver.

    Requirements:
    1. Authenticate using caregiver JWT.
    2. Query caregivers collection using caregiver email from JWT.
    3. Return ONLY active caregiver relationships (revoked links excluded).
    4. Fetch patient details (fullName, email, emergencyContact) from users collection.
    5. Zero sensitive auth fields exposed.
    6. Does not accept patientId query parameter.
    """
    cg_email = current_user.get("email", "").strip().lower()
    caregivers_coll = get_caregivers_collection()
    users_coll = get_users_collection()

    cursor = caregivers_coll.find({
        "caregiverEmail": cg_email,
        "status": CaregiverStatus.ACTIVE.value,
    }).sort("createdAt", pymongo.DESCENDING)

    links = await cursor.to_list(length=100)
    if not links:
        return []

    patients_list: List[Dict[str, Any]] = []
    for link in links:
        pt_oid = link.get("patientId")
        if not pt_oid:
            continue
        patient_user = await users_coll.find_one({"_id": pt_oid})
        if not patient_user:
            continue

        patients_list.append({
            "patientId": str(pt_oid),
            "fullName": patient_user.get("fullName", ""),
            "email": patient_user.get("email", ""),
            "emergencyContact": patient_user.get("emergencyContact"),
            "relationship": link.get("relationship", ""),
            "status": link.get("status", "active"),
            "linkedAt": link.get("createdAt", now_utc()),
        })

    return patients_list


@router.get(
    "/patients/{patientId}/summary",
    response_model=CaregiverMonitoringSummary,
    summary="Retrieve adherence monitoring summary for a linked patient",
)
async def get_patient_monitoring_summary(
    patientId: str,
    clientDate: Optional[str] = Query(None, description="Client reference today (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> CaregiverMonitoringSummary:
    """
    Retrieve read-only adherence monitoring summary for a linked patient.

    Requirements:
    1. Authenticate caregiver via JWT.
    2. Verify the caregiver has an ACTIVE relationship with the requested patient.
    3. If no active relationship exists -> 403 Forbidden without leaking patient existence.
    4. Safe 404 response for malformed patientId.
    5. Reuses Phase 8 calendar and streak calculations (no duplicate formula).
    6. Incorporates Phase 9.2.2 missed-dose evaluation for today.
    7. Exposes recent alerts for this caregiver and patient.
    8. Zero sensitive authentication fields.
    """
    if not is_valid_object_id(patientId):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient records not found.",
        )

    patient_oid = to_object_id(patientId)
    cg_email = current_user.get("email", "").strip().lower()

    caregivers_coll = get_caregivers_collection()
    assignment = await caregivers_coll.find_one({
        "caregiverEmail": cg_email,
        "patientId": patient_oid,
        "status": CaregiverStatus.ACTIVE.value,
    })

    if not assignment:
        logger.warning(
            "Caregiver %s denied monitoring summary for patient %s (no active assignment)",
            cg_email,
            patientId,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Active caregiver assignment required.",
        )

    users_coll = get_users_collection()
    patient_user = await users_coll.find_one({"_id": patient_oid})
    patient_name = patient_user.get("fullName", "Patient") if patient_user else "Patient"

    today = get_reference_today(clientDate)

    # 1. Reuse Phase 8 calendar logic for today
    cal_today = await build_calendar_response(patient_oid, start_d=today, end_d=today, today=today)
    total_scheduled = cal_today.totalOccurrences
    taken_today = cal_today.takenCount
    skipped_today = cal_today.skippedCount

    # 2. Reuse Phase 8 streak logic
    streak_res = await build_streak_response(patient_oid, today=today)

    # 3. Classify today's missed occurrences via MissedDoseService
    missed_service = MissedDoseService()
    today_classified = await missed_service.get_classified_occurrences_for_date(patient_oid, today)
    missed_today = sum(1 for o in today_classified if o.is_missed)

    # 4. Compute adherence percentage using shared canonical service
    adh_today = await calculate_adherence_summary(
        patient_oid=patient_oid,
        start_date=today,
        end_date=today,
    )
    if adh_today["totalScheduled"] > 0:
        adherence_pct = adh_today["adherencePercentage"]
        total_scheduled = adh_today["totalScheduled"]
        taken_today = adh_today["takenCount"]
        skipped_today = adh_today["skippedCount"]
        missed_today = adh_today["missedCount"]
    elif streak_res.totalTrackedDays > 0:
        adherence_pct = round((streak_res.totalAdherentDays / streak_res.totalTrackedDays) * 100.0, 1)
    else:
        adherence_pct = 100.0

    # 4b. Evaluate missed dose alert rules and persist deduplicated alerts for active caregivers
    try:
        rule_evaluator = MissedDoseRuleEvaluator()
        eval_summary = await rule_evaluator.evaluate_patient_rules_for_date(patient_oid, today)
        if eval_summary.has_qualifications:
            alert_service = CaregiverAlertService()
            await alert_service.persist_for_active_caregivers(patient_oid, eval_summary)
    except Exception as exc:
        logger.warning("Error evaluating caregiver alerts in monitoring summary for patient %s: %s", patient_oid, exc)

    # 5. Fetch recent alerts for this caregiver and patient
    notif_coll = get_notifications_collection()
    cg_user_oid = to_object_id(current_user["id"])
    cursor = notif_coll.find({
        "caregiverId": cg_user_oid,
        "patientId": patient_oid,
        "type": NotificationType.CAREGIVER_ALERT.value,
    }).sort("createdAt", pymongo.DESCENDING).limit(5)

    recent_alerts: List[CaregiverAlert] = []
    async for doc in cursor:
        meta = doc.get("metadata") or {}
        sched_times = [meta.get("scheduledTime")] if meta.get("scheduledTime") else []
        recent_alerts.append(CaregiverAlert(
            patientId=str(patient_oid),
            patientName=patient_name,
            medicineName=meta.get("medicineName", "Medication"),
            missedDosesCount=1,
            scheduledTimes=sched_times,
            alertMessage=doc.get("message", "Medication adherence alert"),
            timestamp=doc.get("createdAt", now_utc()),
        ))

    return CaregiverMonitoringSummary(
        patientId=str(patient_oid),
        patientName=patient_name,
        adherencePercentage=adherence_pct,
        totalScheduledToday=total_scheduled,
        takenToday=taken_today,
        skippedToday=skipped_today,
        missedToday=missed_today,
        recentAlerts=recent_alerts,
        currentStreak=streak_res.currentStreak,
        longestStreak=streak_res.longestStreak,
        permissionsNote="Read-only access. Prescription and schedule modifications are strictly prohibited.",
    )


@router.get(
    "/alerts",
    response_model=List[NotificationResponse],
    summary="Retrieve caregiver alert notifications for the authenticated caregiver",
)
async def list_caregiver_alerts(
    status_filter: Optional[NotificationStatus] = Query(None, alias="status", description="Filter by status (read/unread)"),
    patientId: Optional[str] = Query(None, description="Filter by linked patient ID"),
    limit: int = Query(50, ge=1, le=100, description="Max alerts to retrieve"),
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> List[Dict[str, Any]]:
    """
    Retrieve caregiver alerts belonging to the authenticated caregiver.

    Requirements:
    1. Authenticate caregiver.
    2. Query notifications collection where type=caregiver_alert and caregiverId=authenticated caregiver.
    3. Never return another caregiver's alerts.
    4. Support optional filtering by status and patientId.
    5. Return alert id, alert type, read state, createdAt, patientId, and relevant metadata.
    6. Zero sensitive auth fields exposed.
    """
    cg_user_oid = to_object_id(current_user["id"])
    query: Dict[str, Any] = {
        "caregiverId": cg_user_oid,
        "type": NotificationType.CAREGIVER_ALERT.value,
    }

    if status_filter:
        query["status"] = status_filter.value

    if patientId:
        if not is_valid_object_id(patientId):
            return []
        query["patientId"] = to_object_id(patientId)

    # Auto-evaluate missed dose alert qualifications for caregiver's active linked patient(s)
    try:
        caregivers_coll = get_caregivers_collection()
        link_query: Dict[str, Any] = {
            "caregiverEmail": current_user.get("email", "").strip().lower(),
            "status": "active",
        }
        if patientId and is_valid_object_id(patientId):
            link_query["patientId"] = to_object_id(patientId)

        rule_evaluator = MissedDoseRuleEvaluator()
        alert_service = CaregiverAlertService()
        today = date.today()
        async for link in caregivers_coll.find(link_query):
            pt_id = link.get("patientId")
            if pt_id:
                eval_summary = await rule_evaluator.evaluate_patient_rules_for_date(pt_id, today)
                if eval_summary.has_qualifications:
                    await alert_service.persist_for_active_caregivers(pt_id, eval_summary)
    except Exception as exc:
        logger.warning("Error auto-evaluating caregiver alerts in list_caregiver_alerts: %s", exc)

    notif_coll = get_notifications_collection()
    cursor = notif_coll.find(query).sort("createdAt", pymongo.DESCENDING).limit(limit)

    docs = await cursor.to_list(length=limit)
    return [document_to_dict(d) for d in docs]


@router.patch(
    "/alerts/{alert_id}/read",
    response_model=NotificationResponse,
    summary="Mark a caregiver alert as read",
)
async def mark_caregiver_alert_read(
    alert_id: str,
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> Dict[str, Any]:
    """
    Mark a caregiver alert as read.

    Requirements:
    1. Authenticate caregiver.
    2. Find notification by notification ID, caregiverId=caller, and type=caregiver_alert.
    3. Atomically mark it read using CaregiverAlertService.
    4. If alert belongs to another caregiver -> safe 404 (does not mutate).
    5. Reject patient and non-caregiver callers (403).
    """
    if not is_valid_object_id(alert_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found.",
        )

    cg_user_oid = to_object_id(current_user["id"])
    alert_oid = to_object_id(alert_id)

    # First verify it is indeed a caregiver_alert type and owned by this caregiver
    notif_coll = get_notifications_collection()
    existing = await notif_coll.find_one({
        "_id": alert_oid,
        "caregiverId": cg_user_oid,
        "type": NotificationType.CAREGIVER_ALERT.value,
    })
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found.",
        )

    alert_service = CaregiverAlertService(notifications_collection=notif_coll)
    updated = await alert_service.mark_alert_read(
        caregiver_id=cg_user_oid,
        notification_id=alert_oid,
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found.",
        )

    logger.info("Caregiver alert %s marked read by caregiver %s", alert_id, cg_user_oid)
    return document_to_dict(updated)

