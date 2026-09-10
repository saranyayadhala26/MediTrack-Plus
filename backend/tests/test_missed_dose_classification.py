"""Unit and integration tests for Missed-Dose Classification Service (Phase 9.2.2).

Covers:
1. Daily schedule before +60 minutes => PENDING
2. Daily schedule exactly at +60:00 => MISSED
3. Daily schedule after +60 minutes => MISSED
4. Exact boundary test: +59:59 => PENDING, +60:00 => MISSED
5. Taken before +60 minutes => TAKEN
6. Taken after +60 minutes => TAKEN (never missed)
7. Skipped before +60 minutes => SKIPPED
8. Skipped after +60 minutes => SKIPPED (never missed)
9. Active snooze (within 10 minutes) => SNOOZED_ACTIVE (not missed)
10. Active snooze near expiry (+9:59) => SNOOZED_ACTIVE
11. Late snooze active past original deadline => SNOOZED_ACTIVE
12. Snooze expires, evaluation resumes (within grace window) => PENDING
13. Snooze expires without terminal action (after grace window) => MISSED
14. Taken after snooze => TAKEN (not missed, wasSnoozed=True)
15. Skipped after snooze => SKIPPED (not missed, wasSnoozed=True)
16. Weekly occurrence classification (matching vs non-matching)
17. Custom-date occurrence classification (matching vs non-matching)
18. Disabled schedule is excluded (never treated as missed)
19. Medicine & schedule course boundaries are respected
20. Multiple schedules/times remain strictly independent
21. Multiple activity records resolution adheres to Phase 7 semantics
22. Service async database evaluation with patient isolation
23. Service get_missed_occurrences convenience helper
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List
import pytest
from bson import ObjectId

from app.services.missed_dose_service import (
    ClassifiedOccurrence,
    MissedDoseService,
    OccurrenceClassification,
    classify_occurrence,
    resolve_effective_activity,
    GRACE_PERIOD_MINUTES,
    SNOOZE_DURATION_MINUTES,
)


def _make_med(
    med_id: str = "6aa258000000000000000001",
    user_id: str = "6aa258000000000000000000",
    name: str = "Metformin 500mg",
    **kwargs,
) -> Dict[str, Any]:
    doc = {
        "_id": ObjectId(med_id),
        "userId": ObjectId(user_id),
        "name": name,
        "dosage": "500",
        "dosageUnit": "mg",
        "frequency": "daily",
        "inventory": 30,
    }
    doc.update(kwargs)
    return doc


def _make_sched(
    sched_id: str = "6aa258000000000000000002",
    user_id: str = "6aa258000000000000000000",
    med_id: str = "6aa258000000000000000001",
    time_str: str = "08:00",
    freq: str = "daily",
    enabled: bool = True,
    **kwargs,
) -> Dict[str, Any]:
    doc = {
        "_id": ObjectId(sched_id),
        "userId": ObjectId(user_id),
        "medicineId": ObjectId(med_id),
        "time": time_str,
        "frequencyType": freq,
        "enabled": enabled,
    }
    doc.update(kwargs)
    return doc


# ============================================================================
# 1-4. Daily Schedule & Boundary Tests (+59:59 vs +60:00 vs +60+)
# ============================================================================

def test_daily_schedule_before_60_minutes_is_pending():
    """Verify daily occurrence before scheduled + 60m is PENDING."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    # 08:30 is 30 minutes after scheduled time (before +60m grace)
    ref_time = datetime(2026, 9, 10, 8, 30, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.PENDING
    assert occ.is_missed is False


def test_daily_schedule_exact_boundary_59_59_not_missed():
    """Verify exact second-level boundary: scheduled + 59m 59s is PENDING (not missed)."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    # 08:00 + 59m 59s = 08:59:59
    ref_time = datetime(2026, 9, 10, 8, 59, 59, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.PENDING
    assert occ.is_missed is False


def test_daily_schedule_exact_boundary_60_00_is_missed():
    """Verify exact boundary: scheduled + 60m 00s is MISSED."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    # 08:00 + 60m 00s = 09:00:00
    ref_time = datetime(2026, 9, 10, 9, 0, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.MISSED
    assert occ.is_missed is True


def test_daily_schedule_after_60_minutes_is_missed():
    """Verify occurrence well after 60-minute grace period is MISSED."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    ref_time = datetime(2026, 9, 10, 11, 0, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.MISSED
    assert occ.is_missed is True


# ============================================================================
# 5-8. Terminal Actions: Taken & Skipped (Never Missed)
# ============================================================================

def test_taken_before_60_minutes_is_taken():
    """Verify dose recorded as Taken before grace period is TAKEN."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Taken",
        "actionTime": datetime(2026, 9, 10, 8, 15, 0, tzinfo=timezone.utc),
    }
    ref_time = datetime(2026, 9, 10, 8, 45, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.TAKEN
    assert occ.is_missed is False
    assert occ.action == "Taken"


def test_taken_after_60_minutes_is_taken_never_missed():
    """Verify dose recorded as Taken after grace period is TAKEN and never missed."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Taken",
        "actionTime": datetime(2026, 9, 10, 8, 30, 0, tzinfo=timezone.utc),
    }
    # Evaluated hours later (e.g. 14:00)
    ref_time = datetime(2026, 9, 10, 14, 0, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.TAKEN
    assert occ.is_missed is False


def test_skipped_before_60_minutes_is_skipped():
    """Verify dose recorded as Skipped before grace period is SKIPPED."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Skipped",
        "actionTime": datetime(2026, 9, 10, 8, 10, 0, tzinfo=timezone.utc),
        "skipReason": "Fasting for blood test",
    }
    ref_time = datetime(2026, 9, 10, 8, 30, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.SKIPPED
    assert occ.is_missed is False
    assert occ.skip_reason == "Fasting for blood test"


def test_skipped_after_60_minutes_is_skipped_never_missed():
    """Verify dose recorded as Skipped is excluded from missed thresholds even after +60m."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Skipped",
        "actionTime": datetime(2026, 9, 10, 8, 10, 0, tzinfo=timezone.utc),
    }
    ref_time = datetime(2026, 9, 10, 15, 0, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.SKIPPED
    assert occ.is_missed is False


# ============================================================================
# 9-15. Snooze Semantics (10-minute window, expiry, terminal actions)
# ============================================================================

def test_active_snooze_is_snoozed_active_non_missed():
    """Verify active 10-minute snooze window produces SNOOZED_ACTIVE (not missed)."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    # Snooze pressed at 08:20
    act = {
        "_id": ObjectId(),
        "action": "Snoozed",
        "actionTime": datetime(2026, 9, 10, 8, 20, 0, tzinfo=timezone.utc),
        "snoozeCount": 1,
    }
    # Evaluated at 08:25 (5 minutes into 10-minute snooze)
    ref_time = datetime(2026, 9, 10, 8, 25, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.SNOOZED_ACTIVE
    assert occ.is_missed is False
    assert occ.was_snoozed is True


def test_active_snooze_near_boundary_9_59():
    """Verify snooze at +9m 59s is still SNOOZED_ACTIVE."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Snoozed",
        "actionTime": datetime(2026, 9, 10, 8, 20, 0, tzinfo=timezone.utc),
    }
    # 08:20 + 9m 59s = 08:29:59
    ref_time = datetime(2026, 9, 10, 8, 29, 59, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.SNOOZED_ACTIVE
    assert occ.is_missed is False


def test_late_snooze_active_past_original_deadline():
    """
    Verify snooze initiated near the deadline (e.g. 08:55 for 08:00 dose)
    protects the occurrence during its active 10m window even past 09:00.
    """
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    # Snoozed at 08:55 (window: 08:55 - 09:05)
    act = {
        "_id": ObjectId(),
        "action": "Snoozed",
        "actionTime": datetime(2026, 9, 10, 8, 55, 0, tzinfo=timezone.utc),
    }
    # At 09:02: past 08:00+60m, BUT active snooze window is active!
    ref_time = datetime(2026, 9, 10, 9, 2, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.SNOOZED_ACTIVE
    assert occ.is_missed is False

    # At 09:06: snooze window expired (09:05) AND scheduled +60m elapsed.
    # Becomes MISSED immediately (no extra 30-minute buffer).
    ref_time_expired = datetime(2026, 9, 10, 9, 6, 0, tzinfo=timezone.utc)
    occ_exp = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time_expired)
    assert occ_exp is not None
    assert occ_exp.status == OccurrenceClassification.MISSED
    assert occ_exp.is_missed is True


def test_snooze_expires_evaluation_resumes_within_grace_window():
    """
    Verify early snooze (e.g. at 08:05, expires at 08:15) resumes evaluation;
    at 08:25 (within 60m grace), occurrence is PENDING.
    """
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Snoozed",
        "actionTime": datetime(2026, 9, 10, 8, 5, 0, tzinfo=timezone.utc),
    }
    # At 08:20: snooze expired at 08:15, but scheduled +60m is 09:00.
    ref_time = datetime(2026, 9, 10, 8, 20, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.PENDING
    assert occ.is_missed is False


def test_snooze_expires_without_terminal_action_is_missed():
    """Verify expired snooze past 60m grace period without terminal action is MISSED."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Snoozed",
        "actionTime": datetime(2026, 9, 10, 8, 15, 0, tzinfo=timezone.utc),
    }
    # Evaluated at 09:15 (past 08:25 snooze expiry AND past 09:00 scheduled grace)
    ref_time = datetime(2026, 9, 10, 9, 15, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.MISSED
    assert occ.is_missed is True


def test_taken_after_snooze_is_taken_not_missed():
    """Verify dose snoozed and subsequently marked Taken is TAKEN (wasSnoozed=True)."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Taken",
        "actionTime": datetime(2026, 9, 10, 8, 25, 0, tzinfo=timezone.utc),
        "wasSnoozed": True,
        "snoozeCount": 1,
    }
    ref_time = datetime(2026, 9, 10, 12, 0, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.TAKEN
    assert occ.is_missed is False
    assert occ.was_snoozed is True
    assert occ.snooze_count == 1


def test_skipped_after_snooze_is_skipped_not_missed():
    """Verify dose snoozed and subsequently marked Skipped is SKIPPED (wasSnoozed=True)."""
    med = _make_med()
    sched = _make_sched(time_str="08:00")
    curr_d = date(2026, 9, 10)
    act = {
        "_id": ObjectId(),
        "action": "Skipped",
        "actionTime": datetime(2026, 9, 10, 8, 22, 0, tzinfo=timezone.utc),
        "wasSnoozed": True,
        "snoozeCount": 1,
    }
    ref_time = datetime(2026, 9, 10, 12, 0, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, activities=act, reference_time=ref_time)
    assert occ is not None
    assert occ.status == OccurrenceClassification.SKIPPED
    assert occ.is_missed is False
    assert occ.was_snoozed is True


# ============================================================================
# 16-19. Weekly, Custom, Disabled, and Boundaries
# ============================================================================

def test_weekly_occurrence_classification():
    """Verify weekly schedule classifies matching days and returns None on non-matching days."""
    med = _make_med()
    # Weekly on Thursday (day 4)
    sched = _make_sched(freq="weekly", daysOfWeek=[4], time_str="08:00")

    thursday = date(2026, 9, 10)  # Thursday
    friday = date(2026, 9, 11)    # Friday

    ref_time = datetime(2026, 9, 10, 10, 0, 0, tzinfo=timezone.utc)

    # Thursday matches -> classified as MISSED (past 09:00 with no activity)
    occ_thu = classify_occurrence(sched, med, thursday, reference_time=ref_time)
    assert occ_thu is not None
    assert occ_thu.status == OccurrenceClassification.MISSED

    # Friday does not match -> returns None (not an active occurrence)
    occ_fri = classify_occurrence(sched, med, friday, reference_time=ref_time)
    assert occ_fri is None


def test_custom_date_occurrence_classification():
    """Verify custom schedule classifies matching dates and returns None otherwise."""
    med = _make_med()
    sched = _make_sched(freq="custom", dates=["2026-09-10"], time_str="14:00")

    match_d = date(2026, 9, 10)
    non_match_d = date(2026, 9, 11)

    ref_time = datetime(2026, 9, 10, 16, 0, 0, tzinfo=timezone.utc)

    occ_match = classify_occurrence(sched, med, match_d, reference_time=ref_time)
    assert occ_match is not None
    assert occ_match.status == OccurrenceClassification.MISSED

    occ_non = classify_occurrence(sched, med, non_match_d, reference_time=ref_time)
    assert occ_non is None


def test_disabled_schedule_is_not_treated_as_valid_missed_occurrence():
    """Verify disabled schedule returns None and is never treated as a missed occurrence."""
    med = _make_med()
    sched = _make_sched(enabled=False, time_str="08:00")
    curr_d = date(2026, 9, 10)
    ref_time = datetime(2026, 9, 10, 14, 0, 0, tzinfo=timezone.utc)

    occ = classify_occurrence(sched, med, curr_d, reference_time=ref_time)
    assert occ is None


def test_medicine_and_schedule_date_boundaries_respected():
    """Verify dates outside medicine/schedule startDate and endDate return None."""
    med = _make_med(startDate="2026-09-10", endDate="2026-09-15")
    sched = _make_sched(time_str="08:00")
    ref_time = datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)

    # Date before medicine startDate -> None
    assert classify_occurrence(sched, med, date(2026, 9, 9), reference_time=ref_time) is None
    # Date within course -> Valid occurrence
    assert classify_occurrence(sched, med, date(2026, 9, 12), reference_time=ref_time) is not None
    # Date after medicine endDate -> None
    assert classify_occurrence(sched, med, date(2026, 9, 16), reference_time=ref_time) is None


def test_multiple_schedules_and_times_remain_independent():
    """Verify morning and evening schedules for the same medicine evaluate independently."""
    med = _make_med()
    sched_morning = _make_sched(sched_id="6aa258000000000000000011", time_str="08:00")
    sched_evening = _make_sched(sched_id="6aa258000000000000000012", time_str="20:00")
    curr_d = date(2026, 9, 10)

    # Evaluated at 10:00 (morning is past 60m grace; evening is in the future)
    ref_time = datetime(2026, 9, 10, 10, 0, 0, tzinfo=timezone.utc)

    occ_m = classify_occurrence(sched_morning, med, curr_d, reference_time=ref_time)
    occ_e = classify_occurrence(sched_evening, med, curr_d, reference_time=ref_time)

    assert occ_m is not None and occ_m.status == OccurrenceClassification.MISSED
    assert occ_m.is_missed is True

    assert occ_e is not None and occ_e.status == OccurrenceClassification.PENDING
    assert occ_e.is_missed is False


# ============================================================================
# 20. Activity Resolution Semantics (Phase 7 Priority)
# ============================================================================

def test_activity_resolution_prioritizes_taken():
    """Verify resolution gives highest priority to Taken over Skipped or Snoozed."""
    act_snoozed = {
        "_id": ObjectId(),
        "action": "Snoozed",
        "actionTime": datetime(2026, 9, 10, 8, 10, 0, tzinfo=timezone.utc),
    }
    act_taken = {
        "_id": ObjectId(),
        "action": "Taken",
        "actionTime": datetime(2026, 9, 10, 8, 20, 0, tzinfo=timezone.utc),
    }
    resolved = resolve_effective_activity([act_snoozed, act_taken])
    assert resolved is not None
    assert resolved["action"] == "Taken"


def test_activity_resolution_prioritizes_skipped_over_snoozed():
    """Verify resolution gives priority to Skipped over Snoozed."""
    act_snoozed = {
        "_id": ObjectId(),
        "action": "Snoozed",
        "actionTime": datetime(2026, 9, 10, 8, 10, 0, tzinfo=timezone.utc),
    }
    act_skipped = {
        "_id": ObjectId(),
        "action": "Skipped",
        "actionTime": datetime(2026, 9, 10, 8, 15, 0, tzinfo=timezone.utc),
    }
    resolved = resolve_effective_activity([act_snoozed, act_skipped])
    assert resolved is not None
    assert resolved["action"] == "Skipped"


# ============================================================================
# 21-23. Service Async Evaluation, Patient Isolation & Helpers
# ============================================================================

class MockAsyncCollection:
    """Mock PyMongo Async collection for fast, deterministic integration tests."""
    def __init__(self, documents: List[Dict[str, Any]]):
        self.docs = documents

    def find(self, query: Dict[str, Any]):
        filtered = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if k == "userId" and d.get("userId") != v:
                    match = False
                elif k == "enabled" and d.get("enabled") != v:
                    match = False
                elif k == "scheduledDate":
                    val = d.get("scheduledDate")
                    if isinstance(v, dict):
                        gte = v.get("$gte")
                        lte = v.get("$lte")
                        if gte and val < gte:
                            match = False
                        if lte and val > lte:
                            match = False
                    elif val != v:
                        match = False
            if match:
                filtered.append(d)

        class Cursor:
            def __init__(self, items):
                self.items = items
            async def to_list(self, length=None):
                return self.items

        return Cursor(filtered)


@pytest.mark.asyncio
async def test_service_patient_isolation():
    """Verify MissedDoseService strictly isolates patient data in multi-patient database."""
    patient_a = ObjectId("6aa2580000000000000000aa")
    patient_b = ObjectId("6aa2580000000000000000bb")

    meds = [
        _make_med(med_id="6aa258000000000000000101", user_id=str(patient_a), name="Patient A Med"),
        _make_med(med_id="6aa258000000000000000102", user_id=str(patient_b), name="Patient B Med"),
    ]
    scheds = [
        _make_sched(sched_id="6aa258000000000000000201", user_id=str(patient_a), med_id="6aa258000000000000000101", time_str="08:00"),
        _make_sched(sched_id="6aa258000000000000000202", user_id=str(patient_b), med_id="6aa258000000000000000102", time_str="08:00"),
    ]
    activities = []

    service = MissedDoseService(
        schedules_coll=MockAsyncCollection(scheds),
        medicines_coll=MockAsyncCollection(meds),
        activities_coll=MockAsyncCollection(activities),
    )

    ref_time = datetime(2026, 9, 10, 10, 0, 0, tzinfo=timezone.utc)
    eval_d = date(2026, 9, 10)

    # Evaluate Patient A
    occs_a = await service.get_classified_occurrences_for_patient(patient_a, eval_d, eval_d, ref_time)
    assert len(occs_a) == 1
    assert occs_a[0].patient_id == patient_a
    assert occs_a[0].medicine_name == "Patient A Med"
    assert occs_a[0].status == OccurrenceClassification.MISSED
    assert occs_a[0].is_missed is True

    # Evaluate Patient B
    occs_b = await service.get_classified_occurrences_for_patient(patient_b, eval_d, eval_d, ref_time)
    assert len(occs_b) == 1
    assert occs_b[0].patient_id == patient_b
    assert occs_b[0].medicine_name == "Patient B Med"


@pytest.mark.asyncio
async def test_service_get_missed_occurrences_helper():
    """Verify get_missed_occurrences_for_patient helper filters only missed occurrences."""
    patient_id = ObjectId("6aa2580000000000000000cc")
    med = _make_med(med_id="6aa258000000000000000301", user_id=str(patient_id), name="Daily Duo")
    sched_m = _make_sched(sched_id="6aa258000000000000000401", user_id=str(patient_id), med_id=str(med["_id"]), time_str="08:00")
    sched_e = _make_sched(sched_id="6aa258000000000000000402", user_id=str(patient_id), med_id=str(med["_id"]), time_str="20:00")

    # 08:00 dose was Taken
    act_taken = {
        "_id": ObjectId(),
        "userId": patient_id,
        "scheduleId": sched_m["_id"],
        "scheduledDate": "2026-09-10",
        "scheduledTime": "08:00",
        "action": "Taken",
        "actionTime": datetime(2026, 9, 10, 8, 15, 0, tzinfo=timezone.utc),
    }

    service = MissedDoseService(
        schedules_coll=MockAsyncCollection([sched_m, sched_e]),
        medicines_coll=MockAsyncCollection([med]),
        activities_coll=MockAsyncCollection([act_taken]),
    )

    # Reference time: 22:00 (both morning and evening are past +60m)
    # Morning was Taken -> not missed
    # Evening had no action -> MISSED
    ref_time = datetime(2026, 9, 10, 22, 0, 0, tzinfo=timezone.utc)
    eval_d = date(2026, 9, 10)

    all_occs = await service.get_classified_occurrences_for_patient(patient_id, eval_d, eval_d, ref_time)
    assert len(all_occs) == 2

    missed_only = await service.get_missed_occurrences_for_patient(patient_id, eval_d, eval_d, ref_time)
    assert len(missed_only) == 1
    assert missed_only[0].scheduled_time == "20:00"
    assert missed_only[0].status == OccurrenceClassification.MISSED
    assert missed_only[0].is_missed is True
