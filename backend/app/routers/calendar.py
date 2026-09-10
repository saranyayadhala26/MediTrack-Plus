"""Medication Calendar and Adherence Streaks Router (Phase 8).

Endpoints:
- GET /api/v1/medication-calendar: Retrieve scheduled medication occurrences and day-level statuses
- GET /api/v1/medication-calendar/streaks: Compute real adherence streaks based on actual scheduled doses

Enforces:
- Strict patient isolation and safe cross-patient privacy
- Active caregiver read-only permissions
- Explicit timezone consistency via clientDate query param
- Multi-dose and multi-medicine aggregate status per day
- Clinically sound, non-fabricated streaks with neutral rest-day handling
"""

import calendar
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from bson import ObjectId
import pymongo

from app.core.dependencies import get_current_user
from app.db.mongodb import (
    get_activities_collection,
    get_caregivers_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.schemas.calendar import (
    CalendarOccurrence,
    CalendarResponse,
    CalendarStatus,
    DayAggregateStatus,
    DaySummary,
    StreakResponse,
)
from app.schemas.user import UserRole
from app.utils.mongo import is_valid_object_id, to_object_id

logger = logging.getLogger("meditrack.calendar")
router = APIRouter(tags=["Medication Calendar & Streaks"])

from app.services.occurrence_engine import (
    DATE_REGEX,
    date_to_schema_day,
    get_occurrence_dates_for_schedule,
    get_reference_today,
    is_schedule_occurrence,
    parse_date,
    python_weekday_to_schema_day,
    schema_day_to_python_weekday,
)

# Backward-compatible aliases
_DATE_REGEX = DATE_REGEX
_parse_date = parse_date
_get_reference_today = get_reference_today
_is_schedule_occurrence = is_schedule_occurrence


async def _resolve_target_patient(
    current_user: Dict[str, Any],
    patient_id_param: Optional[str],
) -> ObjectId:
    """
    Resolve and authorize the target patient ObjectId.

    Rules:
    - Patient users:
      - Always derive identity from JWT (current_user["id"]).
      - If patient_id_param is supplied and does NOT match caller:
        Raise safe 404 (consistent with MediTrack+ resource isolation).
    - Caregiver users:
      - patient_id_param is mandatory.
      - Check active caregiver assignment in 'caregivers' collection.
      - Unassigned / inactive caregivers receive 403 Forbidden.
    """
    user_role = current_user.get("role")
    caller_id_str = current_user.get("id")

    if user_role == UserRole.PATIENT.value or user_role == UserRole.PATIENT:
        # Patient caller
        if patient_id_param and patient_id_param != caller_id_str:
            logger.warning(
                "Cross-patient calendar access attempt: caller %s requested patient %s",
                caller_id_str,
                patient_id_param,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient records not found.",
            )
        return to_object_id(caller_id_str)

    if user_role == UserRole.CAREGIVER.value or user_role == UserRole.CAREGIVER:
        # Caregiver caller
        if not patient_id_param:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patientId query parameter is required for caregiver access.",
            )
        if not is_valid_object_id(patient_id_param):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient records not found.",
            )

        target_patient_oid = to_object_id(patient_id_param)
        caregivers_coll = get_caregivers_collection()
        assignment = await caregivers_coll.find_one({
            "caregiverEmail": current_user.get("email", "").strip().lower(),
            "patientId": target_patient_oid,
            "status": "active",
        })

        if not assignment:
            logger.warning(
                "Caregiver %s denied access to patient %s (no active assignment)",
                current_user.get("email"),
                patient_id_param,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: Active caregiver assignment required.",
            )

        return target_patient_oid

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access forbidden: Invalid user role.",
    )


@router.get(
    "",
    response_model=CalendarResponse,
    summary="Retrieve medication calendar occurrences and day statuses",
)
async def get_medication_calendar(
    startDate: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    endDate: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    clientDate: Optional[str] = Query(None, description="Client reference today (YYYY-MM-DD)"),
    patientId: Optional[str] = Query(None, description="Target patient ID (caregivers only)"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> CalendarResponse:
    """
    Retrieve all scheduled medication occurrences and aggregate daily adherence
    statuses for a requested date range.
    """
    patient_oid = await _resolve_target_patient(current_user, patientId)
    today = _get_reference_today(clientDate)

    # Establish date range (default to full current month of reference today)
    if startDate:
        start_d = _parse_date(startDate, "startDate")
    else:
        start_d = date(today.year, today.month, 1)

    if endDate:
        end_d = _parse_date(endDate, "endDate")
    else:
        _, last_day = calendar.monthrange(today.year, today.month)
        end_d = date(today.year, today.month, last_day)

    if start_d > end_d:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="startDate cannot be after endDate.",
        )

    return await build_calendar_response(patient_oid, start_d, end_d, today)


async def build_calendar_response(
    patient_oid: ObjectId,
    start_d: date,
    end_d: date,
    today: date,
) -> CalendarResponse:
    """Core reusable calculation of medication calendar for a patient across a date range."""
    # 1. Fetch patient's medicines
    medicines_coll = get_medicines_collection()
    medicines = await medicines_coll.find({"userId": patient_oid}).to_list(length=1000)
    med_map = {str(m["_id"]): m for m in medicines}

    # 2. Fetch enabled schedules for this patient
    schedules_coll = get_schedules_collection()
    schedules = await schedules_coll.find({"userId": patient_oid, "enabled": True}).to_list(length=1000)

    # 3. Fetch recorded activities in the date range
    activities_coll = get_activities_collection()
    start_str = start_d.isoformat()
    end_str = end_d.isoformat()

    activities = await activities_coll.find({
        "userId": patient_oid,
        "scheduledDate": {"$gte": start_str, "$lte": end_str},
    }).to_list(length=2000)

    # Map activity by (scheduleId_str, scheduledDate, scheduledTime)
    act_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for act in activities:
        key = (str(act.get("scheduleId")), str(act.get("scheduledDate")), str(act.get("scheduledTime")))
        act_map[key] = act

    # 4. Generate occurrences day by day
    occurrences: List[CalendarOccurrence] = []
    days_summary: List[DaySummary] = []

    curr_d = start_d
    day_step = timedelta(days=1)

    while curr_d <= end_d:
        curr_str = curr_d.isoformat()
        day_occs: List[CalendarOccurrence] = []

        for sched in schedules:
            sched_med_id = str(sched.get("medicineId"))
            med = med_map.get(sched_med_id)
            if not med:
                continue

            is_occ = _is_schedule_occurrence(sched, med, curr_d, curr_str)
            sched_id_str = str(sched["_id"])
            sched_time = str(sched.get("time", "08:00"))

            # Check if an activity was recorded for this specific occurrence
            act = act_map.get((sched_id_str, curr_str, sched_time))

            if not is_occ and not act:
                continue

            if act:
                act_action = act.get("action")
                if act_action == "Taken":
                    occ_status = CalendarStatus.TAKEN
                elif act_action == "Skipped":
                    occ_status = CalendarStatus.SKIPPED
                elif act_action == "Snoozed":
                    occ_status = CalendarStatus.SNOOZED
                else:
                    occ_status = CalendarStatus.PENDING

                occ = CalendarOccurrence(
                    date=curr_str,
                    scheduledTime=sched_time,
                    medicineId=sched_med_id,
                    medicineName=med.get("name", "Unknown Medicine"),
                    dosage=med.get("dosage", "1"),
                    dosageUnit=med.get("dosageUnit", "tablet"),
                    scheduleId=sched_id_str,
                    frequencyType=sched.get("frequencyType", "daily"),
                    status=occ_status,
                    activityId=str(act["_id"]),
                    actionTime=act.get("actionTime"),
                    skipReason=act.get("skipReason"),
                    wasSnoozed=bool(act.get("wasSnoozed", False)),
                    snoozeCount=int(act.get("snoozeCount", 0)),
                )
            else:
                occ = CalendarOccurrence(
                    date=curr_str,
                    scheduledTime=sched_time,
                    medicineId=sched_med_id,
                    medicineName=med.get("name", "Unknown Medicine"),
                    dosage=med.get("dosage", "1"),
                    dosageUnit=med.get("dosageUnit", "tablet"),
                    scheduleId=sched_id_str,
                    frequencyType=sched.get("frequencyType", "daily"),
                    status=CalendarStatus.PENDING,
                    activityId=None,
                    actionTime=None,
                    skipReason=None,
                    wasSnoozed=False,
                    snoozeCount=0,
                )

            day_occs.append(occ)

        # Sort day occurrences chronologically by scheduled time
        day_occs.sort(key=lambda x: (x.scheduledTime, x.medicineName))
        occurrences.extend(day_occs)

        # Calculate day-level aggregate status (Correction 4)
        total_d = len(day_occs)
        taken_c = sum(1 for o in day_occs if o.status == CalendarStatus.TAKEN)
        skipped_c = sum(1 for o in day_occs if o.status == CalendarStatus.SKIPPED)
        snoozed_c = sum(1 for o in day_occs if o.status == CalendarStatus.SNOOZED)
        pending_c = sum(1 for o in day_occs if o.status == CalendarStatus.PENDING)

        if total_d == 0:
            agg_status = DayAggregateStatus.NONE
        elif skipped_c > 0:
            # Any skip marks day as Skipped
            agg_status = DayAggregateStatus.SKIPPED
        elif taken_c == total_d:
            # All scheduled occurrences Taken
            agg_status = DayAggregateStatus.ADHERENT
        elif snoozed_c > 0 and (taken_c + snoozed_c == total_d):
            # Unresolved snoozed doses without skip
            agg_status = DayAggregateStatus.SNOOZED
        else:
            # Scheduled but not all completed (all pending or mixed taken + pending)
            agg_status = DayAggregateStatus.PENDING

        days_summary.append(DaySummary(
            date=curr_str,
            status=agg_status,
            totalDoses=total_d,
            takenCount=taken_c,
            skippedCount=skipped_c,
            snoozedCount=snoozed_c,
            pendingCount=pending_c,
        ))

        curr_d += day_step

    total_taken = sum(1 for o in occurrences if o.status == CalendarStatus.TAKEN)
    total_skipped = sum(1 for o in occurrences if o.status == CalendarStatus.SKIPPED)
    total_snoozed = sum(1 for o in occurrences if o.status == CalendarStatus.SNOOZED)
    total_pending = sum(1 for o in occurrences if o.status == CalendarStatus.PENDING)

    return CalendarResponse(
        startDate=start_str,
        endDate=end_str,
        occurrences=occurrences,
        days=days_summary,
        daysSummary=days_summary,
        totalOccurrences=len(occurrences),
        takenCount=total_taken,
        skippedCount=total_skipped,
        snoozedCount=total_snoozed,
        pendingCount=total_pending,
    )


@router.get(
    "/streaks",
    response_model=StreakResponse,
    summary="Calculate actual medication adherence streak",
)
async def get_adherence_streaks(
    clientDate: Optional[str] = Query(None, description="Client reference today (YYYY-MM-DD)"),
    patientId: Optional[str] = Query(None, description="Target patient ID (caregivers only)"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> StreakResponse:
    """
    Compute real, non-fabricated medication adherence streaks based on scheduled doses.

    Rules:
    - Only historical days up to clientDate (today) are evaluated. Future dates are excluded.
    - Days with no doses scheduled are neutral (do not break streak, do not increment streak).
    - An adherent day requires ALL scheduled doses for that day to be Taken.
    - If today has pending doses and no skipped doses, it is in-progress (streak evaluated from yesterday).
    - If today has a skipped dose, the streak is broken (currentStreak = 0).
    """
    patient_oid = await _resolve_target_patient(current_user, patientId)
    today = _get_reference_today(clientDate)
    return await build_streak_response(patient_oid, today)


async def build_streak_response(
    patient_oid: ObjectId,
    today: date,
) -> StreakResponse:
    """Core reusable calculation of medication adherence streaks for a patient."""
    today_str = today.isoformat()

    # 1. Fetch medicines
    medicines_coll = get_medicines_collection()
    medicines = await medicines_coll.find({"userId": patient_oid}).to_list(length=1000)
    if not medicines:
        return StreakResponse(
            currentStreak=0,
            longestStreak=0,
            totalAdherentDays=0,
            totalTrackedDays=0,
            lastAdherentDate=None,
            evaluatedDate=today_str,
        )
    med_map = {str(m["_id"]): m for m in medicines}

    # 2. Fetch enabled schedules
    schedules_coll = get_schedules_collection()
    schedules = await schedules_coll.find({"userId": patient_oid, "enabled": True}).to_list(length=1000)
    if not schedules:
        return StreakResponse(
            currentStreak=0,
            longestStreak=0,
            totalAdherentDays=0,
            totalTrackedDays=0,
            lastAdherentDate=None,
            evaluatedDate=today_str,
        )

    # 3. Determine earliest evaluation date (earliest start date or creation date, max 180 days back)
    candidate_dates: List[date] = []
    for m in medicines:
        m_start = m.get("startDate")
        if m_start:
            try:
                candidate_dates.append(date.fromisoformat(m_start))
            except ValueError:
                pass
        m_created = m.get("createdAt")
        if isinstance(m_created, datetime):
            candidate_dates.append(m_created.date())

    for s in schedules:
        s_start = s.get("startDate")
        if s_start:
            try:
                candidate_dates.append(date.fromisoformat(s_start))
            except ValueError:
                pass
        s_created = s.get("createdAt")
        if isinstance(s_created, datetime):
            candidate_dates.append(s_created.date())

    activities_coll = get_activities_collection()
    earliest_act = await activities_coll.find_one(
        {"userId": patient_oid},
        sort=[("scheduledDate", pymongo.ASCENDING)]
    )
    if earliest_act and earliest_act.get("scheduledDate"):
        try:
            candidate_dates.append(date.fromisoformat(earliest_act["scheduledDate"]))
        except ValueError:
            pass

    min_history_date = today - timedelta(days=180)
    if candidate_dates:
        earliest_date = max(min(candidate_dates), min_history_date)
    else:
        earliest_date = today - timedelta(days=30)

    if earliest_date > today:
        earliest_date = today

    earliest_str = earliest_date.isoformat()

    # 4. Fetch all activities from earliest date to today
    activities_coll = get_activities_collection()
    activities = await activities_coll.find({
        "userId": patient_oid,
        "scheduledDate": {"$gte": earliest_str, "$lte": today_str},
    }).to_list(length=3000)

    act_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for act in activities:
        key = (str(act.get("scheduleId")), str(act.get("scheduledDate")), str(act.get("scheduledTime")))
        act_map[key] = act

    # 5. Evaluate each day chronologically from earliest_date to today
    # Map: curr_date -> {"is_scheduled": bool, "adherent": bool, "has_skip": bool, "has_pending": bool}
    day_evals: Dict[str, Dict[str, Any]] = {}

    curr_d = earliest_date
    day_step = timedelta(days=1)

    while curr_d <= today:
        curr_str = curr_d.isoformat()
        expected_doses = 0
        taken_doses = 0
        skipped_doses = 0
        pending_doses = 0

        for sched in schedules:
            med = med_map.get(str(sched.get("medicineId")))
            if not med:
                continue

            is_occ = _is_schedule_occurrence(sched, med, curr_d, curr_str)
            sched_id_str = str(sched["_id"])
            sched_time = str(sched.get("time", "08:00"))

            act = act_map.get((sched_id_str, curr_str, sched_time))
            if not is_occ and not act:
                continue

            expected_doses += 1
            if act:
                act_action = act.get("action")
                if act_action == "Taken":
                    taken_doses += 1
                elif act_action == "Skipped":
                    skipped_doses += 1
                else:
                    pending_doses += 1
            else:
                pending_doses += 1

        is_scheduled = expected_doses > 0
        adherent = is_scheduled and (taken_doses == expected_doses)
        has_skip = skipped_doses > 0
        has_pending = pending_doses > 0

        day_evals[curr_str] = {
            "date": curr_d,
            "date_str": curr_str,
            "is_scheduled": is_scheduled,
            "expected_doses": expected_doses,
            "taken_doses": taken_doses,
            "adherent": adherent,
            "has_skip": has_skip,
            "has_pending": has_pending,
        }

        curr_d += day_step

    # 6. Calculate streak statistics
    total_tracked = sum(1 for d in day_evals.values() if d["is_scheduled"])
    total_adherent = sum(1 for d in day_evals.values() if d["adherent"])

    last_adherent_str = None
    # Find most recent adherent date
    for curr_str in sorted(day_evals.keys(), reverse=True):
        if day_evals[curr_str]["adherent"]:
            last_adherent_str = curr_str
            break

    # Calculate longest streak across entire evaluated history
    longest_streak = 0
    running_streak = 0
    for curr_str in sorted(day_evals.keys()):
        d_info = day_evals[curr_str]
        if not d_info["is_scheduled"]:
            # Neutral day: does not break streak, does not increment
            continue
        if d_info["adherent"]:
            running_streak += 1
            longest_streak = max(longest_streak, running_streak)
        else:
            running_streak = 0

    # Calculate current streak:
    # Check today's state
    today_info = day_evals.get(today_str)
    current_streak = 0

    if total_tracked == 0:
        return StreakResponse(
            currentStreak=0,
            longestStreak=0,
            totalAdherentDays=0,
            totalTrackedDays=0,
            lastAdherentDate=None,
            evaluatedDate=today_str,
        )

    # Determine start point for current streak
    eval_back_date: Optional[date] = None

    if today_info and today_info["is_scheduled"]:
        if today_info["adherent"]:
            # All doses today taken: today counts towards current streak!
            current_streak += 1
            eval_back_date = today - timedelta(days=1)
        elif today_info["has_skip"]:
            # A dose today was skipped: streak is broken!
            current_streak = 0
            eval_back_date = None
        else:
            # Doses today are pending (in-progress): evaluate from yesterday backwards
            eval_back_date = today - timedelta(days=1)
    else:
        # Today is not scheduled: evaluate from yesterday backwards
        eval_back_date = today - timedelta(days=1)

    if eval_back_date:
        back_d = eval_back_date
        while back_d >= earliest_date:
            b_str = back_d.isoformat()
            d_info = day_evals.get(b_str)
            if not d_info or not d_info["is_scheduled"]:
                # Neutral non-scheduled day: continue backwards
                back_d -= timedelta(days=1)
                continue

            if d_info["adherent"]:
                current_streak += 1
                back_d -= timedelta(days=1)
            else:
                # First non-adherent day encountered: stop streak
                break

    return StreakResponse(
        currentStreak=current_streak,
        longestStreak=longest_streak,
        totalAdherentDays=total_adherent,
        totalTrackedDays=total_tracked,
        lastAdherentDate=last_adherent_str,
        evaluatedDate=today_str,
    )
