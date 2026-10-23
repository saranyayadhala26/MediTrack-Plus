"""Medication Activity and Dose Tracking REST API Endpoints (Phase 7)."""

from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
import pymongo

from app.core.dependencies import get_current_patient, get_current_user
from app.db.mongodb import (
    get_activities_collection,
    get_medicines_collection,
    get_schedules_collection,
)
from app.models.collections import (
    create_activity_document,
    now_utc,
)
from app.schemas.activity import (
    ActionType,
    ActivityCreate,
    ActivityResponse,
)
from app.services.adherence_service import calculate_adherence_summary
from app.utils.mongo import document_to_dict, to_object_id

logger = logging.getLogger("meditrack.activities")
router = APIRouter(tags=["Medication Activities & Dose Tracking"])


async def _enrich_activity(
    doc: Dict[str, Any], medicines_cache: Optional[Dict[str, Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Helper to convert ObjectId fields and populate medicine display metadata."""
    data = document_to_dict(doc)
    med_id_str = data.get("medicineId")
    if not med_id_str:
        return data

    if medicines_cache is not None and med_id_str in medicines_cache:
        med = medicines_cache[med_id_str]
    else:
        med_coll = get_medicines_collection()
        med_oid = to_object_id(med_id_str)
        med_doc = await med_coll.find_one({"_id": med_oid})
        med = document_to_dict(med_doc) if med_doc else None
        if medicines_cache is not None and med:
            medicines_cache[med_id_str] = med

    if med:
        data["medicineName"] = med.get("name")
        data["dosage"] = med.get("dosage")
        data["dosageUnit"] = med.get("dosageUnit")

    return data


@router.post(
    "",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a patient medication dose activity (Taken, Skipped, or Snoozed)",
)
async def record_activity(
    payload: ActivityCreate,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> ActivityResponse:
    """
    Record an intake action for a scheduled medication occurrence.
    
    Security & Validation Rules:
    - Only authenticated patients can record activities (Caregivers receive 403).
    - Verified ownership of medicine and schedule.
    - Idempotent duplicate protection: Repeated taps return the existing record (200 OK).
    - State transition: Snoozed -> Taken/Skipped updates the occurrence while preserving snooze history.
    - Conflict protection: Taken -> Skipped/Snoozed returns 409 Conflict.
    - When action is Skipped, a non-empty skipReason is required.
    """
    user_oid = to_object_id(current_user["id"])
    medicine_oid = to_object_id(payload.medicineId)
    schedule_oid = to_object_id(payload.scheduleId)

    medicines_coll = get_medicines_collection()
    schedules_coll = get_schedules_collection()
    activities_coll = get_activities_collection()

    # 1. Validate medicine existence and ownership
    medicine_doc = await medicines_coll.find_one({"_id": medicine_oid, "userId": user_oid})
    if not medicine_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found or access denied.",
        )

    # 2. Validate schedule existence, ownership, and link to medicine
    schedule_doc = await schedules_coll.find_one(
        {"_id": schedule_oid, "userId": user_oid, "medicineId": medicine_oid}
    )
    if not schedule_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medication schedule not found or does not match this medicine.",
        )

    # 3. Check for existing activity record for this occurrence (duplicate / state protection)
    query_occurrence = {
        "userId": user_oid,
        "scheduleId": schedule_oid,
        "scheduledDate": payload.scheduledDate,
        "scheduledTime": payload.scheduledTime,
    }
    existing_activity = await activities_coll.find_one(query_occurrence)

    if existing_activity:
        existing_action = existing_activity.get("action")

        # Case A: Identical repeated action (e.g. rapid double-tap on Taken)
        if existing_action == payload.action.value:
            logger.info(
                "Idempotent activity request for existing %s action on %s %s (User: %s)",
                existing_action,
                payload.scheduledDate,
                payload.scheduledTime,
                current_user["id"],
            )
            response.status_code = status.HTTP_200_OK
            enriched = await _enrich_activity(existing_activity)
            return ActivityResponse(**enriched)

        # Case B: Transition from interim Snoozed -> terminal Taken or Skipped
        if existing_action == ActionType.SNOOZED.value and payload.action in [
            ActionType.TAKEN,
            ActionType.SKIPPED,
        ]:
            snooze_count = existing_activity.get("snoozeCount", 1)
            update_fields: Dict[str, Any] = {
                "action": payload.action.value,
                "actionTime": payload.actionTime or now_utc(),
                "wasSnoozed": True,
                "snoozeCount": snooze_count,
                "skipReason": payload.skipReason.strip() if payload.skipReason else None,
                "updatedAt": now_utc(),
            }
            await activities_coll.update_one({"_id": existing_activity["_id"]}, {"$set": update_fields})
            logger.info(
                "Transitioned dose activity from Snoozed to %s for occurrence %s %s (User: %s)",
                payload.action.value,
                payload.scheduledDate,
                payload.scheduledTime,
                current_user["id"],
            )

            # Decrement inventory if Taken and inventory tracking is active
            if payload.action == ActionType.TAKEN:
                curr_inv = medicine_doc.get("inventory")
                if curr_inv is not None and curr_inv > 0:
                    await medicines_coll.update_one({"_id": medicine_oid}, {"$inc": {"inventory": -1}})

            response.status_code = status.HTTP_200_OK
            updated_doc = await activities_coll.find_one({"_id": existing_activity["_id"]})
            enriched = await _enrich_activity(updated_doc)
            return ActivityResponse(**enriched)

        # Case C: Attempting to mark an already-Taken dose as Skipped or Snoozed
        if existing_action == ActionType.TAKEN.value and payload.action in [
            ActionType.SKIPPED,
            ActionType.SNOOZED,
        ]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This medication dose occurrence has already been recorded as Taken.",
            )

        # Case D: Transition from Skipped -> Taken (patient decided to take after skipping)
        if existing_action == ActionType.SKIPPED.value and payload.action == ActionType.TAKEN:
            update_fields = {
                "action": ActionType.TAKEN.value,
                "actionTime": payload.actionTime or now_utc(),
                "skipReason": None,
                "updatedAt": now_utc(),
            }
            await activities_coll.update_one({"_id": existing_activity["_id"]}, {"$set": update_fields})
            curr_inv = medicine_doc.get("inventory")
            if curr_inv is not None and curr_inv > 0:
                await medicines_coll.update_one({"_id": medicine_oid}, {"$inc": {"inventory": -1}})

            updated_doc = await activities_coll.find_one({"_id": existing_activity["_id"]})
            response.status_code = status.HTTP_200_OK
            enriched = await _enrich_activity(updated_doc)
            return ActivityResponse(**enriched)

        # Case E: Attempting to Snooze an already Skipped dose
        if existing_action == ActionType.SKIPPED.value and payload.action == ActionType.SNOOZED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This medication dose occurrence has already been recorded as Skipped.",
            )

        # Catch-all: If an existing activity record exists, reject any other invalid state transitions
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This medication dose occurrence is already recorded as {existing_action}.",
        )

    # 4. No previous record: Create new persistent activity document
    new_doc = create_activity_document(
        user_id=user_oid,
        medicine_id=medicine_oid,
        schedule_id=schedule_oid,
        scheduled_date=payload.scheduledDate,
        scheduled_time=payload.scheduledTime,
        action=payload.action.value,
        action_time=payload.actionTime or now_utc(),
        skip_reason=payload.skipReason,
        was_snoozed=False,
        snooze_count=0,
    )
    await activities_coll.insert_one(new_doc)
    logger.info(
        "Recorded new medication activity '%s' for user %s, medicine %s (%s %s)",
        payload.action.value,
        current_user["id"],
        payload.medicineId,
        payload.scheduledDate,
        payload.scheduledTime,
    )

    # Decrement inventory if Taken and inventory tracking is active
    if payload.action == ActionType.TAKEN:
        curr_inv = medicine_doc.get("inventory")
        if curr_inv is not None and curr_inv > 0:
            await medicines_coll.update_one({"_id": medicine_oid}, {"$inc": {"inventory": -1}})

    # Auto-evaluate missed dose rules for caregiver alerts
    try:
        from app.services.caregiver_alert_service import CaregiverAlertService
        from app.services.missed_dose_rules import MissedDoseRuleEvaluator
        today_date = date.today()
        rule_evaluator = MissedDoseRuleEvaluator()
        eval_summary = await rule_evaluator.evaluate_patient_rules_for_date(user_oid, today_date)
        if eval_summary.has_qualifications:
            alert_service = CaregiverAlertService()
            await alert_service.persist_for_active_caregivers(user_oid, eval_summary)
    except Exception as exc:
        logger.warning("Error evaluating caregiver alerts on activity recording: %s", exc)

    enriched = await _enrich_activity(new_doc)
    return ActivityResponse(**enriched)


@router.get(
    "",
    response_model=List[ActivityResponse],
    summary="Retrieve medication activity logs and history",
)
async def get_activities(
    medicineId: Optional[str] = Query(None, description="Filter by Medicine ID"),
    scheduleId: Optional[str] = Query(None, description="Filter by Schedule ID"),
    startDate: Optional[str] = Query(None, description="Filter from YYYY-MM-DD"),
    endDate: Optional[str] = Query(None, description="Filter to YYYY-MM-DD"),
    action: Optional[ActionType] = Query(None, description="Filter by action type"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> List[ActivityResponse]:
    """
    Retrieve dose activity logs for the authenticated patient with optional filters.
    Sorted chronologically by actionTime descending.
    """
    user_oid = to_object_id(current_user["id"])
    activities_coll = get_activities_collection()

    filter_query: Dict[str, Any] = {"userId": user_oid}

    if medicineId:
        filter_query["medicineId"] = to_object_id(medicineId)
    if scheduleId:
        filter_query["scheduleId"] = to_object_id(scheduleId)
    if action:
        filter_query["action"] = action.value

    if startDate or endDate:
        date_filter: Dict[str, Any] = {}
        if startDate:
            date_filter["$gte"] = startDate
        if endDate:
            date_filter["$lte"] = endDate
        filter_query["scheduledDate"] = date_filter

    cursor = (
        activities_coll.find(filter_query)
        .sort([("actionTime", pymongo.DESCENDING), ("createdAt", pymongo.DESCENDING)])
        .skip(skip)
        .limit(limit)
    )

    docs = await cursor.to_list(length=limit)
    med_cache: Dict[str, Dict[str, Any]] = {}
    enriched_list = []
    for doc in docs:
        enriched = await _enrich_activity(doc, med_cache)
        enriched_list.append(ActivityResponse(**enriched))

    return enriched_list


@router.get(
    "/summary",
    summary="Calculate actual medication adherence based on real schedules and activities",
)
async def get_adherence_summary(
    startDate: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    endDate: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    clientDate: Optional[str] = Query(None, description="Optional client today date (YYYY-MM-DD)"),
    referenceTime: Optional[str] = Query(None, description="Optional ISO reference datetime for evaluation"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Compute patient adherence by matching expected schedule occurrences against
    recorded Taken/Skipped actions over the requested period.
    The denominator strictly reflects real scheduled events that are due.
    """
    user_oid = to_object_id(current_user["id"])
    today_str = clientDate or date.today().isoformat()

    start_str = startDate or today_str
    end_str = endDate or today_str

    try:
        start_d = date.fromisoformat(start_str)
        end_d = date.fromisoformat(end_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Dates must be in YYYY-MM-DD format.",
        )

    if start_d > end_d:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="startDate cannot be after endDate.",
        )

    ref_dt = None
    if referenceTime:
        try:
            ref_dt = datetime.fromisoformat(referenceTime)
        except ValueError:
            pass

    return await calculate_adherence_summary(
        patient_oid=user_oid,
        start_date=start_d,
        end_date=end_d,
        reference_time=ref_dt,
    )


@router.get(
    "/medicines/{medicine_id}",
    response_model=List[ActivityResponse],
    summary="Retrieve activity history for a specific medicine",
)
async def get_medicine_activities(
    medicine_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> List[ActivityResponse]:
    """Retrieve all dose logs recorded for a specific medicine belonging to the caller."""
    user_oid = to_object_id(current_user["id"])
    medicine_oid = to_object_id(medicine_id)

    medicines_coll = get_medicines_collection()
    med_doc = await medicines_coll.find_one({"_id": medicine_oid, "userId": user_oid})
    if not med_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medicine not found or access denied.",
        )

    activities_coll = get_activities_collection()
    cursor = activities_coll.find({"userId": user_oid, "medicineId": medicine_oid}).sort(
        "actionTime", pymongo.DESCENDING
    )
    docs = await cursor.to_list(length=100)

    med_dict = document_to_dict(med_doc)
    cache = {str(medicine_oid): med_dict}
    results = []
    for doc in docs:
        enriched = await _enrich_activity(doc, cache)
        results.append(ActivityResponse(**enriched))

    return results


@router.get(
    "/{activity_id}",
    response_model=ActivityResponse,
    summary="Retrieve a specific activity log by ID",
)
async def get_activity_by_id(
    activity_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> ActivityResponse:
    """Retrieve an activity log by ID with strict patient isolation."""
    user_oid = to_object_id(current_user["id"])
    act_oid = to_object_id(activity_id)

    activities_coll = get_activities_collection()
    doc = await activities_coll.find_one({"_id": act_oid, "userId": user_oid})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medication activity log not found or access denied.",
        )

    enriched = await _enrich_activity(doc)
    return ActivityResponse(**enriched)
