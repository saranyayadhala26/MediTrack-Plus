"""Medication Scheduling Router for MediTrack+ (Phase 5).

Provides CRUD operations and enable/disable toggling for medication reminders:
- Supports daily, weekly, and custom schedule frequencies
- Validates 24-hour HH:MM time formats
- Validates day of week representations and custom date lists
- Validates schedule bounds against associated medicine duration
- Enforces strict patient data isolation and safe 404 error responses
- Restricts access to authenticated patients (blocking caregivers and unauthenticated callers)
- Embeds authoritative medical safety disclaimers
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
import pymongo

from app.core.dependencies import get_current_patient
from app.db.mongodb import get_medicines_collection, get_schedules_collection
from app.models.collections import create_schedule_document, now_utc
from app.schemas.schedule import (
    ScheduleCreate,
    ScheduleDeleteResponse,
    ScheduleListResponse,
    ScheduleResponse,
    ScheduleUpdate,
)
from app.utils.mongo import document_to_dict, is_valid_object_id, to_object_id

logger = logging.getLogger("meditrack.schedules")
router = APIRouter(tags=["Medication Scheduling"])


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    schedule_in: ScheduleCreate,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Create a new medication reminder schedule for an owned medicine.

    - Authenticated patient only.
    - Resolves and verifies that the referenced medicine exists and belongs to the caller.
    - Verifies schedule time format (HH:MM) and frequency rules.
    - Validates that schedule dates fall within the medicine's duration (if defined).
    - Returns full schedule details with resolved medicine metadata and medical disclaimer.
    """
    user_oid = to_object_id(current_user["id"])

    # Verify referenced medicine
    if not is_valid_object_id(schedule_in.medicineId):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    med_oid = to_object_id(schedule_in.medicineId)
    meds_coll = get_medicines_collection()
    medicine_doc = await meds_coll.find_one({"_id": med_oid, "userId": user_oid})

    if medicine_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found.",
        )

    # Validate schedule dates against medicine date bounds
    med_start = medicine_doc.get("startDate")
    med_end = medicine_doc.get("endDate")

    if med_start:
        if schedule_in.startDate and schedule_in.startDate < med_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Schedule startDate ({schedule_in.startDate}) cannot be earlier than medicine startDate ({med_start}).",
            )
        if schedule_in.dates:
            for d in schedule_in.dates:
                if d < med_start:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f"Custom schedule date '{d}' cannot be earlier than medicine startDate ({med_start}).",
                    )

    if med_end:
        if schedule_in.endDate and schedule_in.endDate > med_end:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Schedule endDate ({schedule_in.endDate}) cannot be later than medicine endDate ({med_end}).",
            )
        if schedule_in.dates:
            for d in schedule_in.dates:
                if d > med_end:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f"Custom schedule date '{d}' cannot be later than medicine endDate ({med_end}).",
                    )

    # Fallback startDate if not explicitly passed
    effective_start_date = schedule_in.startDate or med_start or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    doc = create_schedule_document(
        user_id=user_oid,
        medicine_id=med_oid,
        time=schedule_in.time,
        frequency_type=schedule_in.frequencyType.value,
        days_of_week=schedule_in.daysOfWeek,
        start_date=effective_start_date,
        end_date=schedule_in.endDate or med_end,
        dates=schedule_in.dates,
        enabled=schedule_in.enabled,
    )

    sched_coll = get_schedules_collection()
    result = await sched_coll.insert_one(doc)
    doc["_id"] = result.inserted_id

    res_dict = document_to_dict(doc)
    res_dict["medicineName"] = medicine_doc.get("name")
    res_dict["dosage"] = medicine_doc.get("dosage")
    res_dict["dosageUnit"] = medicine_doc.get("dosageUnit")

    logger.info("Schedule %s created for medicine %s by user %s", doc["_id"], med_oid, user_oid)
    return res_dict


@router.get("", response_model=ScheduleListResponse)
async def list_schedules(
    medicine_id: Optional[str] = Query(None, description="Optional filter by medicine ID"),
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    List all medication schedules belonging to the authenticated patient.

    - Supports optional filtering by `medicine_id`.
    - Strict patient isolation (caller sees only their own schedules).
    - Sorts chronologically by intake time and creation date.
    - Resolves medicine names for convenient UI presentation.
    """
    user_oid = to_object_id(current_user["id"])
    query: Dict[str, Any] = {"userId": user_oid}

    if medicine_id:
        if not is_valid_object_id(medicine_id):
            return {"items": [], "total": 0}
        query["medicineId"] = to_object_id(medicine_id)

    sched_coll = get_schedules_collection()
    cursor = sched_coll.find(query).sort([("time", pymongo.ASCENDING), ("createdAt", pymongo.DESCENDING)])

    raw_schedules = []
    med_ids = set()
    async for doc in cursor:
        raw_schedules.append(doc)
        med_ids.add(doc["medicineId"])

    # Batch resolve medicines to avoid N+1 queries
    meds_coll = get_medicines_collection()
    medicine_map: Dict[str, Dict[str, Any]] = {}
    if med_ids:
        med_cursor = meds_coll.find({"_id": {"$in": list(med_ids)}})
        async for m in med_cursor:
            medicine_map[str(m["_id"])] = m

    items = []
    for sched in raw_schedules:
        s_dict = document_to_dict(sched)
        m = medicine_map.get(s_dict.get("medicineId", ""))
        if m:
            s_dict["medicineName"] = m.get("name")
            s_dict["dosage"] = m.get("dosage")
            s_dict["dosageUnit"] = m.get("dosageUnit")
        items.append(s_dict)

    return {
        "items": items,
        "total": len(items),
    }


@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(
    schedule_id: str,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Retrieve details of a specific schedule by ID.

    - Verifies patient ownership.
    - Returns HTTP 404 if not found or owned by another patient (safe 404).
    """
    if not is_valid_object_id(schedule_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found.",
        )

    user_oid = to_object_id(current_user["id"])
    sched_oid = to_object_id(schedule_id)
    sched_coll = get_schedules_collection()

    doc = await sched_coll.find_one({"_id": sched_oid, "userId": user_oid})
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found.",
        )

    res_dict = document_to_dict(doc)

    # Resolve medicine name
    meds_coll = get_medicines_collection()
    medicine_doc = await meds_coll.find_one({"_id": doc["medicineId"]})
    if medicine_doc:
        res_dict["medicineName"] = medicine_doc.get("name")
        res_dict["dosage"] = medicine_doc.get("dosage")
        res_dict["dosageUnit"] = medicine_doc.get("dosageUnit")

    return res_dict


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: str,
    schedule_update: ScheduleUpdate,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Partially update a schedule's time, frequency, dates, or active status (enabled/disabled).

    - Verifies patient ownership.
    - Disabling does NOT delete the schedule.
    - Re-validates frequency consistency and medicine duration bounds.
    - Protects immutable ownership fields.
    - Updates 'updatedAt' timestamp.
    """
    if not is_valid_object_id(schedule_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found.",
        )

    user_oid = to_object_id(current_user["id"])
    sched_oid = to_object_id(schedule_id)
    sched_coll = get_schedules_collection()

    existing_doc = await sched_coll.find_one({"_id": sched_oid, "userId": user_oid})
    if existing_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found.",
        )

    # Verify associated medicine
    meds_coll = get_medicines_collection()
    med_doc = await meds_coll.find_one({"_id": existing_doc["medicineId"], "userId": user_oid})
    if med_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated medicine not found.",
        )

    # Check effective frequency & day/date requirements
    effective_freq = (
        schedule_update.frequencyType.value
        if schedule_update.frequencyType
        else existing_doc.get("frequencyType")
    )
    effective_days = (
        schedule_update.daysOfWeek
        if schedule_update.daysOfWeek is not None
        else existing_doc.get("daysOfWeek")
    )
    effective_dates = (
        schedule_update.dates
        if schedule_update.dates is not None
        else existing_doc.get("dates")
    )
    effective_start = (
        schedule_update.startDate
        if schedule_update.startDate is not None
        else existing_doc.get("startDate")
    )
    effective_end = (
        schedule_update.endDate
        if schedule_update.endDate is not None
        else existing_doc.get("endDate")
    )

    if effective_freq == "weekly" and not effective_days:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="daysOfWeek is required and cannot be empty for weekly frequency.",
        )

    if effective_freq == "custom" and not effective_dates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Specific dates list is required and cannot be empty for custom frequency.",
        )

    if effective_start and effective_end and effective_end < effective_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Schedule endDate cannot be earlier than startDate.",
        )

    # Validate against medicine duration bounds
    med_start = med_doc.get("startDate")
    med_end = med_doc.get("endDate")
    if med_start:
        if effective_start and effective_start < med_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Schedule startDate cannot be earlier than medicine startDate ({med_start}).",
            )
        if effective_dates and any(d < med_start for d in effective_dates):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Custom schedule dates cannot be earlier than medicine startDate ({med_start}).",
            )

    if med_end:
        if effective_end and effective_end > med_end:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Schedule endDate cannot be later than medicine endDate ({med_end}).",
            )
        if effective_dates and any(d > med_end for d in effective_dates):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Custom schedule dates cannot be later than medicine endDate ({med_end}).",
            )

    update_dict = schedule_update.model_dump(exclude_unset=True)
    if not update_dict:
        res_dict = document_to_dict(existing_doc)
        res_dict["medicineName"] = med_doc.get("name")
        res_dict["dosage"] = med_doc.get("dosage")
        res_dict["dosageUnit"] = med_doc.get("dosageUnit")
        return res_dict

    if "frequencyType" in update_dict and update_dict["frequencyType"] is not None:
        update_dict["frequencyType"] = (
            update_dict["frequencyType"].value
            if hasattr(update_dict["frequencyType"], "value")
            else str(update_dict["frequencyType"])
        )

    update_dict["updatedAt"] = now_utc()

    updated_doc = await sched_coll.find_one_and_update(
        {"_id": sched_oid, "userId": user_oid},
        {"$set": update_dict},
        return_document=pymongo.ReturnDocument.AFTER,
    )

    res_dict = document_to_dict(updated_doc)
    res_dict["medicineName"] = med_doc.get("name")
    res_dict["dosage"] = med_doc.get("dosage")
    res_dict["dosageUnit"] = med_doc.get("dosageUnit")

    logger.info("Schedule %s updated by user %s", schedule_id, user_oid)
    return res_dict


@router.delete("/{schedule_id}", response_model=ScheduleDeleteResponse)
async def delete_schedule(
    schedule_id: str,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Dict[str, Any]:
    """
    Permanently delete a medication schedule.

    - Authenticated patient only.
    - Verifies caller ownership.
    - Safe 404 behavior for unauthorized or non-existent schedules.
    """
    if not is_valid_object_id(schedule_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found.",
        )

    user_oid = to_object_id(current_user["id"])
    sched_oid = to_object_id(schedule_id)
    sched_coll = get_schedules_collection()

    result = await sched_coll.delete_one({"_id": sched_oid, "userId": user_oid})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found.",
        )

    logger.info("Schedule %s deleted by user %s", schedule_id, user_oid)
    return {
        "message": "Schedule deleted successfully",
        "id": schedule_id,
    }
