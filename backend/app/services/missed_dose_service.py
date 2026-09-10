"""Missed-Dose Classification Service (Phase 9.2.2).

Classifies individual scheduled medication occurrences according to
MediTrack+ approved business rules:
- Valid active scheduled occurrences established via shared OccurrenceEngine
- 60-minute post-scheduled grace window (scheduled + 60m)
- Terminal Taken/Skipped actions (never missed, excluded from missed thresholds)
- 10-minute active snooze window (interim SNOOZED_ACTIVE, no arbitrary extra buffer)
- Expiration of snooze resumes evaluation against original scheduled deadline
- Multiple activity resolution adhering to Phase 7 activity state transitions
- Pure business service: decoupled from FastAPI Request, HTTP status, and RBAC
- Uses PyMongo Async collection getters (no Motor dependency)
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union
from bson import ObjectId

from app.db.mongodb import (
    get_activities_collection,
    get_medicines_collection,
    get_schedules_collection,
)
from app.models.collections import now_utc
from app.services.occurrence_engine import is_schedule_occurrence
from app.utils.mongo import to_object_id

# Canonical Timing Constants
GRACE_PERIOD_MINUTES = 60
GRACE_PERIOD_DELTA = timedelta(minutes=GRACE_PERIOD_MINUTES)
SNOOZE_DURATION_MINUTES = 10
SNOOZE_DURATION_DELTA = timedelta(minutes=SNOOZE_DURATION_MINUTES)


class OccurrenceClassification(str, Enum):
    """Domain classification states for an individual dose occurrence."""
    PENDING = "PENDING"
    TAKEN = "TAKEN"
    SKIPPED = "SKIPPED"
    SNOOZED_ACTIVE = "SNOOZED_ACTIVE"
    MISSED = "MISSED"


@dataclass
class ClassifiedOccurrence:
    """Evaluated occurrence record with domain status and activity metadata."""
    patient_id: ObjectId
    medicine_id: ObjectId
    medicine_name: str
    dosage: str
    dosage_unit: str
    schedule_id: ObjectId
    frequency_type: str
    scheduled_date: str
    scheduled_time: str
    scheduled_datetime: datetime
    status: OccurrenceClassification
    is_missed: bool
    activity_id: Optional[ObjectId] = None
    action: Optional[str] = None
    action_time: Optional[datetime] = None
    was_snoozed: bool = False
    snooze_count: int = 0
    skip_reason: Optional[str] = None


def resolve_effective_activity(
    activities: Union[Dict[str, Any], List[Dict[str, Any]], None]
) -> Optional[Dict[str, Any]]:
    """
    Deterministically resolve the effective medication activity record
    for an occurrence adhering to Phase 7 transition semantics:
    Taken (terminal, highest priority) > Skipped (terminal) > Snoozed (interim).
    """
    if not activities:
        return None
    if isinstance(activities, dict):
        return activities

    act_list = list(activities)
    if not act_list:
        return None
    if len(act_list) == 1:
        return act_list[0]

    # Priority 1: Any Taken activity (once taken, cannot regress)
    taken_acts = [a for a in act_list if a.get("action") == "Taken"]
    if taken_acts:
        return max(
            taken_acts,
            key=lambda a: a.get("actionTime") or a.get("createdAt") or datetime.min.replace(tzinfo=timezone.utc),
        )

    # Priority 2: Any Skipped activity (if not Taken)
    skipped_acts = [a for a in act_list if a.get("action") == "Skipped"]
    if skipped_acts:
        return max(
            skipped_acts,
            key=lambda a: a.get("actionTime") or a.get("createdAt") or datetime.min.replace(tzinfo=timezone.utc),
        )

    # Priority 3: Snoozed activity (take most recent)
    snoozed_acts = [a for a in act_list if a.get("action") == "Snoozed"]
    if snoozed_acts:
        return max(
            snoozed_acts,
            key=lambda a: a.get("actionTime") or a.get("createdAt") or datetime.min.replace(tzinfo=timezone.utc),
        )

    # Fallback to latest record
    return act_list[-1]


def classify_occurrence(
    sched: Dict[str, Any],
    med: Dict[str, Any],
    curr_date: date,
    curr_str: Optional[str] = None,
    activities: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
    reference_time: Optional[datetime] = None,
) -> Optional[ClassifiedOccurrence]:
    """
    Classify a single medication occurrence for (schedule, medicine, curr_date).

    Returns:
    - ClassifiedOccurrence if (schedule, medicine) is active on curr_date
    - None if not a valid active scheduled occurrence (e.g. disabled schedule,
      outside course boundaries, or non-matching weekly/custom date).
    """
    if curr_str is None:
        curr_str = curr_date.isoformat()

    # 1. Establish valid active occurrence using shared OccurrenceEngine
    if not is_schedule_occurrence(sched, med, curr_date, curr_str):
        return None

    # 2. Parse scheduled time & build timezone-aware UTC datetime
    sched_time = str(sched.get("time", "08:00")).strip()
    try:
        scheduled_dt = datetime.fromisoformat(f"{curr_str}T{sched_time}:00")
    except ValueError:
        scheduled_dt = datetime.combine(curr_date, datetime.min.time())

    if scheduled_dt.tzinfo is None:
        scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)

    # 3. Establish timezone-aware reference_time (default: current UTC)
    if reference_time is None:
        ref_time = now_utc()
    else:
        ref_time = reference_time
        if ref_time.tzinfo is None:
            ref_time = ref_time.replace(tzinfo=timezone.utc)

    # 4. Resolve effective activity
    eff_act = resolve_effective_activity(activities)

    # 5. Determine occurrence status
    status = OccurrenceClassification.PENDING
    activity_id: Optional[ObjectId] = None
    act_action: Optional[str] = None
    act_time: Optional[datetime] = None
    was_snoozed: bool = False
    snooze_count: int = 0
    skip_reason: Optional[str] = None

    if eff_act:
        activity_id = eff_act.get("_id")
        if isinstance(activity_id, str):
            activity_id = to_object_id(activity_id)
        act_action = eff_act.get("action")
        act_time = eff_act.get("actionTime") or eff_act.get("createdAt")
        if isinstance(act_time, datetime) and act_time.tzinfo is None:
            act_time = act_time.replace(tzinfo=timezone.utc)
        was_snoozed = bool(eff_act.get("wasSnoozed", False)) or (act_action == "Snoozed")
        snooze_count = int(eff_act.get("snoozeCount", 1 if act_action == "Snoozed" else 0))
        skip_reason = eff_act.get("skipReason")

        if act_action == "Taken":
            status = OccurrenceClassification.TAKEN
        elif act_action == "Skipped":
            status = OccurrenceClassification.SKIPPED
        elif act_action == "Snoozed":
            # Snooze is interim: exactly 10 minutes
            snooze_anchor = act_time or scheduled_dt
            snooze_expiry = snooze_anchor + SNOOZE_DURATION_DELTA
            if ref_time < snooze_expiry:
                status = OccurrenceClassification.SNOOZED_ACTIVE
            else:
                # Snooze expired: evaluation resumes against original scheduled deadline
                if ref_time >= scheduled_dt + GRACE_PERIOD_DELTA:
                    status = OccurrenceClassification.MISSED
                else:
                    status = OccurrenceClassification.PENDING
        else:
            # Unrecognized/other interim state
            if ref_time >= scheduled_dt + GRACE_PERIOD_DELTA:
                status = OccurrenceClassification.MISSED
            else:
                status = OccurrenceClassification.PENDING
    else:
        # No activity recorded
        if ref_time >= scheduled_dt + GRACE_PERIOD_DELTA:
            status = OccurrenceClassification.MISSED
        else:
            status = OccurrenceClassification.PENDING

    is_missed = (status == OccurrenceClassification.MISSED)

    return ClassifiedOccurrence(
        patient_id=to_object_id(sched.get("userId")),
        medicine_id=to_object_id(sched.get("medicineId")),
        medicine_name=med.get("name", "Unknown Medicine"),
        dosage=str(med.get("dosage", "1")),
        dosage_unit=str(med.get("dosageUnit", "tablet")),
        schedule_id=to_object_id(sched.get("_id")),
        frequency_type=str(sched.get("frequencyType", "daily")),
        scheduled_date=curr_str,
        scheduled_time=sched_time,
        scheduled_datetime=scheduled_dt,
        status=status,
        is_missed=is_missed,
        activity_id=activity_id,
        action=act_action,
        action_time=act_time,
        was_snoozed=was_snoozed,
        snooze_count=snooze_count,
        skip_reason=skip_reason,
    )


class MissedDoseService:
    """
    Pure business service evaluating patient medication occurrences.
    Uses PyMongo Async database collections.
    """

    def __init__(
        self,
        schedules_coll: Optional[Any] = None,
        medicines_coll: Optional[Any] = None,
        activities_coll: Optional[Any] = None,
    ):
        self._schedules_coll = schedules_coll
        self._medicines_coll = medicines_coll
        self._activities_coll = activities_coll

    @property
    def schedules_coll(self) -> Any:
        return self._schedules_coll if self._schedules_coll is not None else get_schedules_collection()

    @property
    def medicines_coll(self) -> Any:
        return self._medicines_coll if self._medicines_coll is not None else get_medicines_collection()

    @property
    def activities_coll(self) -> Any:
        return self._activities_coll if self._activities_coll is not None else get_activities_collection()

    async def get_classified_occurrences_for_patient(
        self,
        patient_id: Union[str, ObjectId],
        start_date: date,
        end_date: date,
        reference_time: Optional[datetime] = None,
    ) -> List[ClassifiedOccurrence]:
        """
        Query patient's schedules, medicines, and activities using PyMongo Async,
        and classify every valid occurrence in [start_date, end_date].
        """
        patient_oid = to_object_id(patient_id)
        if reference_time is None:
            ref_time = now_utc()
        else:
            ref_time = reference_time
            if ref_time.tzinfo is None:
                ref_time = ref_time.replace(tzinfo=timezone.utc)

        # 1. Fetch medicines for this patient
        med_docs = await self.medicines_coll.find({"userId": patient_oid}).to_list(length=1000)
        if not med_docs:
            return []
        med_map = {str(m["_id"]): m for m in med_docs}

        # 2. Fetch enabled schedules for this patient
        sched_docs = await self.schedules_coll.find({"userId": patient_oid, "enabled": True}).to_list(length=1000)
        if not sched_docs:
            return []

        # 3. Fetch recorded activities in requested date range
        start_str = start_date.isoformat()
        end_str = end_date.isoformat()
        act_docs = await self.activities_coll.find({
            "userId": patient_oid,
            "scheduledDate": {"$gte": start_str, "$lte": end_str},
        }).to_list(length=3000)

        # Map activities by (scheduleId_str, scheduledDate, scheduledTime)
        act_map: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = {}
        for act in act_docs:
            key = (str(act.get("scheduleId")), str(act.get("scheduledDate")), str(act.get("scheduledTime")))
            if key not in act_map:
                act_map[key] = []
            act_map[key].append(act)

        # 4. Generate & classify occurrences day by day
        classified: List[ClassifiedOccurrence] = []
        curr_d = start_date
        day_step = timedelta(days=1)

        while curr_d <= end_date:
            curr_str = curr_d.isoformat()
            for sched in sched_docs:
                med_id_str = str(sched.get("medicineId"))
                med = med_map.get(med_id_str)
                if not med:
                    continue

                sched_id_str = str(sched["_id"])
                sched_time = str(sched.get("time", "08:00")).strip()
                key = (sched_id_str, curr_str, sched_time)
                acts = act_map.get(key, [])

                occ = classify_occurrence(
                    sched=sched,
                    med=med,
                    curr_date=curr_d,
                    curr_str=curr_str,
                    activities=acts,
                    reference_time=ref_time,
                )
                if occ:
                    classified.append(occ)

            curr_d += day_step

        # Sort chronologically by (scheduled_datetime, medicine_name)
        classified.sort(key=lambda x: (x.scheduled_datetime, x.medicine_name))
        return classified

    async def get_classified_occurrences_for_date(
        self,
        patient_id: Union[str, ObjectId],
        target_date: date,
        reference_time: Optional[datetime] = None,
    ) -> List[ClassifiedOccurrence]:
        """Convenience method evaluating occurrences for a single calendar date."""
        return await self.get_classified_occurrences_for_patient(
            patient_id=patient_id,
            start_date=target_date,
            end_date=target_date,
            reference_time=reference_time,
        )

    async def get_missed_occurrences_for_patient(
        self,
        patient_id: Union[str, ObjectId],
        start_date: date,
        end_date: date,
        reference_time: Optional[datetime] = None,
    ) -> List[ClassifiedOccurrence]:
        """Convenience method returning only occurrences classified as MISSED."""
        occurrences = await self.get_classified_occurrences_for_patient(
            patient_id=patient_id,
            start_date=start_date,
            end_date=end_date,
            reference_time=reference_time,
        )
        return [occ for occ in occurrences if occ.is_missed]
