"""Medicine Management Router for MediTrack+ (Phase 4).

Supports full CRUD for authenticated patients with strict user isolation,
role enforcement (blocking caregivers and unauthenticated callers),
Pydantic validation, and embedded medical safety disclaimers.
"""

import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
import pymongo

from app.core.dependencies import get_current_patient
from app.db.mongodb import get_medicines_collection
from app.models.collections import create_medicine_document, now_utc
from app.schemas.medicine import (
    MedicineCreate,
    MedicineDeleteResponse,
    MedicineListResponse,
    MedicineResponse,
    MedicineUpdate,
)
from app.utils.mongo import document_to_dict, is_valid_object_id, to_object_id

logger = logging.getLogger("meditrack.medicines")
router = APIRouter(tags=["Medicine Management"])


@router.post("", response_model=MedicineResponse, status_code=status.HTTP_201_CREATED)
async def create_medicine(
    medicine_in: MedicineCreate,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Create a new prescribed medicine for the authenticated patient.

    - Only accessible by authenticated patients.
    - Owner userId is strictly enforced from the validated JWT token.
    - End date must be greater than or equal to start date (if provided).
    - Returns medicine record with the mandatory medical safety disclaimer.
    """
    user_id = to_object_id(current_user["id"])

    doc = create_medicine_document(
        user_id=user_id,
        name=medicine_in.name,
        dosage=medicine_in.dosage,
        dosage_unit=medicine_in.dosageUnit.value,
        frequency=medicine_in.frequency,
        instructions=medicine_in.instructions,
        start_date=medicine_in.startDate,
        end_date=medicine_in.endDate,
        inventory=medicine_in.inventory,
        refill_threshold=medicine_in.refillThreshold,
    )

    coll = get_medicines_collection()
    result = await coll.insert_one(doc)
    doc["_id"] = result.inserted_id

    logger.info("Medicine '%s' (id=%s) created for user %s", doc["name"], doc["_id"], user_id)
    return document_to_dict(doc)


@router.get("", response_model=MedicineListResponse)
async def list_medicines(
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    List all prescribed medicines belonging to the authenticated patient.

    - Only returns medicines owned by the caller (strict patient isolation).
    - Results sorted chronologically by creation date (newest first).
    - Includes total count and medical safety disclaimer.
    """
    user_id = to_object_id(current_user["id"])
    coll = get_medicines_collection()

    cursor = coll.find({"userId": user_id}).sort("createdAt", pymongo.DESCENDING)
    items = []
    async for doc in cursor:
        items.append(document_to_dict(doc))

    return {
        "items": items,
        "total": len(items),
    }


@router.get("/{medicine_id}", response_model=MedicineResponse)
async def get_medicine(
    medicine_id: str,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Retrieve details of a specific medicine by ID.

    - Verifies caller ownership.
    - Returns HTTP 404 if not found or if owned by another user (zero leakage).
    - Includes medical safety disclaimer.
    """
    if not is_valid_object_id(medicine_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    user_id = to_object_id(current_user["id"])
    med_oid = to_object_id(medicine_id)
    coll = get_medicines_collection()

    doc = await coll.find_one({"_id": med_oid, "userId": user_id})
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    return document_to_dict(doc)


@router.patch("/{medicine_id}", response_model=MedicineResponse)
async def update_medicine(
    medicine_id: str,
    medicine_update: MedicineUpdate,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Partially update medicine fields (name, dosage, frequency, inventory, etc.).

    - Validates caller ownership.
    - Returns HTTP 404 if not found or belongs to another user.
    - Cross-validates updated date bounds against existing document.
    - Updates 'updatedAt' timestamp.
    - Returns updated document with medical disclaimer.
    """
    if not is_valid_object_id(medicine_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    user_id = to_object_id(current_user["id"])
    med_oid = to_object_id(medicine_id)
    coll = get_medicines_collection()

    existing_doc = await coll.find_one({"_id": med_oid, "userId": user_id})
    if existing_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    # Cross-validate effective dates if partially updated
    effective_start = (
        medicine_update.startDate
        if medicine_update.startDate is not None
        else existing_doc.get("startDate")
    )
    effective_end = (
        medicine_update.endDate
        if medicine_update.endDate is not None
        else existing_doc.get("endDate")
    )
    if effective_start and effective_end and effective_end < effective_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="End date must be greater than or equal to start date.",
        )

    update_dict = medicine_update.model_dump(exclude_unset=True)
    if not update_dict:
        return document_to_dict(existing_doc)

    # Format enum values if present
    if "dosageUnit" in update_dict and update_dict["dosageUnit"] is not None:
        update_dict["dosageUnit"] = (
            update_dict["dosageUnit"].value
            if hasattr(update_dict["dosageUnit"], "value")
            else str(update_dict["dosageUnit"])
        )

    update_dict["updatedAt"] = now_utc()

    updated_doc = await coll.find_one_and_update(
        {"_id": med_oid, "userId": user_id},
        {"$set": update_dict},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    logger.info("Medicine %s updated by user %s", medicine_id, user_id)
    return document_to_dict(updated_doc)


@router.delete("/{medicine_id}", response_model=MedicineDeleteResponse)
async def delete_medicine(
    medicine_id: str,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Permanently delete a prescribed medicine.

    - Verifies caller ownership.
    - Returns HTTP 404 if not found or belongs to another user.
    - Returns confirmation response with medical disclaimer.
    """
    if not is_valid_object_id(medicine_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    user_id = to_object_id(current_user["id"])
    med_oid = to_object_id(medicine_id)
    coll = get_medicines_collection()

    result = await coll.delete_one({"_id": med_oid, "userId": user_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    logger.info("Medicine %s deleted by user %s", medicine_id, user_id)
    return {
        "message": "Medicine deleted successfully",
        "id": medicine_id,
    }
