"""Medication Adherence & Calendar Calculation Service (Phase 11 Refactor).

Provides shared domain calculation functions for:
- Assembling scheduled medication occurrences across date ranges
- Aggregating day-level adherence statuses
- Calculating non-fabricated adherence streaks relative to any evaluated reference date

Extracted from routers/calendar.py to enforce clean architectural layering:
Routers -> Services -> Occurrence Engine / DB Collections.
Services never depend on Routers.
"""

import calendar
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
import pymongo

from app.db.mongodb import (
    get_activities_collection,
    get_medicines_collection,
    get_schedules_collection,
)
from app.schemas.calendar import (
    CalendarOccurrence,
    CalendarResponse,
    CalendarStatus,
    DayAggregateStatus,
    DaySummary,
    StreakResponse,
)
from app.services.occurrence_engine import is_schedule_occurrence

logger = logging.getLogger("meditrack.adherence_service")


async def build_calendar_response(
    patient_oid: ObjectId,
    start_d: date,
    end_d: date,
    today: date,
    medicines_coll: Optional[Any] = None,
    schedules_coll: Optional[Any] = None,
    activities_coll: Optional[Any] = None,
) -> CalendarResponse:
    """Core reusable calculation of medication calendar for a patient across a date range."""
    med_coll = medicines_coll if medicines_coll is not None else get_medicines_collection()
    sched_coll = schedules_coll if schedules_coll is not None else get_schedules_collection()
    act_coll = activities_coll if activities_coll is not None else get_activities_collection()

    # 1. Fetch patient's medicines
    medicines = await med_coll.find({"userId": patient_oid}).to_list(length=1000)
    med_map = {str(m["_id"]): m for m in medicines}

    # 2. Fetch enabled schedules for this patient
    schedules = await sched_coll.find({"userId": patient_oid, "enabled": True}).to_list(length=1000)

    # 3. Fetch recorded activities in the date range
    start_str = start_d.isoformat()
    end_str = end_d.isoformat()

    activities = await act_coll.find({
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

            is_occ = is_schedule_occurrence(sched, med, curr_d, curr_str)
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

        # Calculate day-level aggregate status
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


async def build_streak_response(
    patient_oid: ObjectId,
    today: date,
    medicines_coll: Optional[Any] = None,
    schedules_coll: Optional[Any] = None,
    activities_coll: Optional[Any] = None,
) -> StreakResponse:
    """Core reusable calculation of medication adherence streaks for a patient evaluated as of reference date."""
    today_str = today.isoformat()
    med_coll = medicines_coll if medicines_coll is not None else get_medicines_collection()
    sched_coll = schedules_coll if schedules_coll is not None else get_schedules_collection()
    act_coll = activities_coll if activities_coll is not None else get_activities_collection()

    # 1. Fetch medicines
    medicines = await med_coll.find({"userId": patient_oid}).to_list(length=1000)
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
    schedules = await sched_coll.find({"userId": patient_oid, "enabled": True}).to_list(length=1000)
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

    earliest_act = await act_coll.find_one(
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
    activities = await act_coll.find({
        "userId": patient_oid,
        "scheduledDate": {"$gte": earliest_str, "$lte": today_str},
    }).to_list(length=3000)

    act_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for act in activities:
        key = (str(act.get("scheduleId")), str(act.get("scheduledDate")), str(act.get("scheduledTime")))
        act_map[key] = act

    # 5. Evaluate each day chronologically from earliest_date to today
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

            is_occ = is_schedule_occurrence(sched, med, curr_d, curr_str)
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
            continue
        if d_info["adherent"]:
            running_streak += 1
            longest_streak = max(longest_streak, running_streak)
        else:
            running_streak = 0

    # Calculate current streak evaluated as of reference today
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

    eval_back_date: Optional[date] = None

    if today_info and today_info["is_scheduled"]:
        if today_info["adherent"]:
            current_streak += 1
            eval_back_date = today - timedelta(days=1)
        elif today_info["has_skip"]:
            current_streak = 0
            eval_back_date = None
        else:
            eval_back_date = today - timedelta(days=1)
    else:
        eval_back_date = today - timedelta(days=1)

    if eval_back_date:
        back_d = eval_back_date
        while back_d >= earliest_date:
            b_str = back_d.isoformat()
            d_info = day_evals.get(b_str)
            if not d_info or not d_info["is_scheduled"]:
                back_d -= timedelta(days=1)
                continue

            if d_info["adherent"]:
                current_streak += 1
                back_d -= timedelta(days=1)
            else:
                break

    return StreakResponse(
        currentStreak=current_streak,
        longestStreak=longest_streak,
        totalAdherentDays=total_adherent,
        totalTrackedDays=total_tracked,
        lastAdherentDate=last_adherent_str,
        evaluatedDate=today_str,
    )
