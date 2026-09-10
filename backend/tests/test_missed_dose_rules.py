"""Unit and integration tests for Missed-Dose Rule Evaluator (Phase 9.2.3).

Covers all 30 test requirements:
- RULE A (volume in rolling 24h, midnight crossing, exclusions, boundaries)
- RULE B (consecutive missed occurrences of same medicine, intervening non-missed breaks)
- COMBINATION (Rule A + Rule B => RULE_A_B single qualification)
- BOUNDARY TESTING (23:59:59 inside, exactly 24:00:00 inside, 24:00:01 outside)
- PATIENT ISOLATION & DATA IDENTITY (5-tuple identity, cross-patient isolation)
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List
import pytest
from bson import ObjectId

from app.services.missed_dose_service import (
    ClassifiedOccurrence,
    OccurrenceClassification,
)
from app.services.missed_dose_rules import (
    MissedDoseRuleEvaluator,
    OccurrenceRuleEvaluation,
    PatientRuleEvaluationSummary,
    RuleQualificationType,
    evaluate_occurrence_sequence,
)


def make_occ(
    patient_id: str = "6aa258000000000000000001",
    med_id: str = "6aa258000000000000000010",
    med_name: str = "Metformin 500mg",
    sched_id: str = "6aa258000000000000000100",
    freq: str = "daily",
    dt_str: str = "2026-09-10T08:00:00",
    status: OccurrenceClassification = OccurrenceClassification.MISSED,
    **kwargs,
) -> ClassifiedOccurrence:
    """Factory creating a ClassifiedOccurrence fixture with UTC timestamp."""
    dt = datetime.fromisoformat(dt_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    date_str = dt.strftime("%Y-%m-%d")
    time_str = dt.strftime("%H:%M")
    is_missed = (status == OccurrenceClassification.MISSED)
    return ClassifiedOccurrence(
        patient_id=ObjectId(patient_id),
        medicine_id=ObjectId(med_id),
        medicine_name=med_name,
        dosage="500",
        dosage_unit="mg",
        schedule_id=ObjectId(sched_id),
        frequency_type=freq,
        scheduled_date=date_str,
        scheduled_time=time_str,
        scheduled_datetime=dt,
        status=status,
        is_missed=is_missed,
        **kwargs,
    )


# ============================================================================
# RULE A TESTS
# ============================================================================

def test_rule_a_zero_missed_returns_none():
    """1. 0 missed occurrences => NONE."""
    occs = [
        make_occ(dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.TAKEN),
        make_occ(dt_str="2026-09-10T12:00:00", status=OccurrenceClassification.SKIPPED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert len(evals) == 2
    assert all(e.qualification == RuleQualificationType.NONE for e in evals)
    assert all(not e.is_qualifying for e in evals)


def test_rule_a_single_missed_returns_none():
    """2. 1 missed occurrence alone => NONE (minimum threshold is 2 missed)."""
    occs = [
        make_occ(dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert len(evals) == 1
    assert evals[0].qualification == RuleQualificationType.NONE
    assert evals[0].rule_a_satisfied is False
    assert evals[0].rule_b_satisfied is False


def test_rule_a_two_missed_within_24h_qualifies():
    """3. 2 missed within 24h (different medicines) => RULE_A."""
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"
    occs = [
        make_occ(med_id=med1_id, med_name="Med A", dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med2_id, med_name="Med B", dt_str="2026-09-10T14:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert len(evals) == 2
    # First occurrence has only 1 missed so far
    assert evals[0].qualification == RuleQualificationType.NONE
    # Second occurrence has 2 missed within 24h => RULE_A
    assert evals[1].qualification == RuleQualificationType.RULE_A
    assert evals[1].rule_a_satisfied is True
    assert evals[1].rule_b_satisfied is False
    assert len(evals[1].rule_a_trigger_occurrences) == 2


def test_rule_a_three_missed_within_24h_qualifies():
    """4. 3 missed within 24h => RULE_A."""
    occs = [
        make_occ(med_id="6aa258000000000000000010", dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id="6aa258000000000000000020", dt_str="2026-09-10T12:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id="6aa258000000000000000030", dt_str="2026-09-10T18:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert len(evals) == 3
    assert evals[2].qualification == RuleQualificationType.RULE_A
    assert len(evals[2].rule_a_trigger_occurrences) == 3


def test_rule_a_two_missed_more_than_24h_apart_returns_none():
    """5. 2 missed more than 24h apart => NONE."""
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"
    occs = [
        make_occ(med_id=med1_id, dt_str="2026-09-08T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med2_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].qualification == RuleQualificationType.NONE
    assert evals[1].rule_a_satisfied is False


def test_rule_a_exact_24h_boundary():
    """
    6. Boundary:
    - 23:59:59 apart => inside (RULE_A)
    - exactly 24:00:00 apart => inside (RULE_A)
    - 24:00:01 apart => outside (NONE)
    """
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"

    # Case A: 23:59:59 apart
    occ_a1 = make_occ(med_id=med1_id, dt_str="2026-09-09T08:00:01", status=OccurrenceClassification.MISSED)
    occ_a2 = make_occ(med_id=med2_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED)
    evals_a = evaluate_occurrence_sequence([occ_a1, occ_a2])
    assert evals_a[1].rule_a_satisfied is True
    assert evals_a[1].qualification == RuleQualificationType.RULE_A

    # Case B: exactly 24:00:00 apart (inclusive boundary)
    occ_b1 = make_occ(med_id=med1_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.MISSED)
    occ_b2 = make_occ(med_id=med2_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED)
    evals_b = evaluate_occurrence_sequence([occ_b1, occ_b2])
    assert evals_b[1].rule_a_satisfied is True
    assert evals_b[1].qualification == RuleQualificationType.RULE_A

    # Case C: 24:00:01 apart (exclusive boundary)
    occ_c1 = make_occ(med_id=med1_id, dt_str="2026-09-09T07:59:59", status=OccurrenceClassification.MISSED)
    occ_c2 = make_occ(med_id=med2_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED)
    evals_c = evaluate_occurrence_sequence([occ_c1, occ_c2])
    assert evals_c[1].rule_a_satisfied is False
    assert evals_c[1].qualification == RuleQualificationType.NONE


def test_rule_a_rolling_24h_crossing_midnight():
    """7. Rolling 24h correctly crosses midnight boundary."""
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"
    # Occ 1: 09-Sep 23:30
    # Occ 2: 10-Sep 08:00 (8.5 hours later)
    occs = [
        make_occ(med_id=med1_id, dt_str="2026-09-09T23:30:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med2_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].qualification == RuleQualificationType.RULE_A
    assert evals[1].rule_a_satisfied is True


def test_rule_a_skipped_occurrences_excluded():
    """8. Skipped occurrences are deliberately excluded from Rule A thresholds."""
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"
    occs = [
        make_occ(med_id=med1_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.SKIPPED),
        make_occ(med_id=med2_id, dt_str="2026-09-10T12:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    # Only 1 missed occurrence in 24h window
    assert evals[1].qualification == RuleQualificationType.NONE
    assert evals[1].rule_a_satisfied is False


def test_rule_a_taken_occurrences_excluded():
    """9. Taken occurrences are excluded from Rule A thresholds."""
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"
    occs = [
        make_occ(med_id=med1_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.TAKEN),
        make_occ(med_id=med2_id, dt_str="2026-09-10T12:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].qualification == RuleQualificationType.NONE
    assert evals[1].rule_a_satisfied is False


def test_rule_a_pending_and_snoozed_active_excluded():
    """10. Pending and Snoozed-Active occurrences are excluded from Rule A thresholds."""
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"
    med3_id = "6aa258000000000000000030"
    occs = [
        make_occ(med_id=med1_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.PENDING),
        make_occ(med_id=med2_id, dt_str="2026-09-10T09:00:00", status=OccurrenceClassification.SNOOZED_ACTIVE),
        make_occ(med_id=med3_id, dt_str="2026-09-10T10:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    # Only 1 missed occurrence in 24h window
    assert evals[2].qualification == RuleQualificationType.NONE
    assert evals[2].rule_a_satisfied is False


def test_rule_a_multiple_medicines_contribute():
    """11. Multiple different medicines contribute to the patient's 24h regimen volume."""
    occs = [
        make_occ(med_id="6aa258000000000000000010", med_name="Aspirin", dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id="6aa258000000000000000020", med_name="Metformin", dt_str="2026-09-10T12:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].qualification == RuleQualificationType.RULE_A
    assert evals[1].rule_a_satisfied is True


def test_rule_a_multiple_daily_doses_contribute():
    """12. Multiple doses of the same medicine contribute to 24h volume for Rule A."""
    med_id = "6aa258000000000000000010"
    sched1 = "6aa258000000000000000101"
    sched2 = "6aa258000000000000000102"
    occs = [
        make_occ(med_id=med_id, sched_id=sched1, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, sched_id=sched2, dt_str="2026-09-10T20:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    # Both Rule A and Rule B are satisfied! (2 in 24h, and consecutive for med_id)
    assert evals[1].rule_a_satisfied is True


# ============================================================================
# RULE B TESTS
# ============================================================================

def test_rule_b_same_medicine_daily_consecutive_missed():
    """13. Same medicine, daily consecutive missed => satisfies Rule B."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-08T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].rule_b_satisfied is True
    assert evals[1].rule_b_consecutive_previous == occs[0]


def test_rule_b_same_medicine_weekly_consecutive_missed():
    """
    14. Same medicine, weekly consecutive scheduled occurrences => satisfies Rule B.
    Thursday Week 1 missed, Thursday Week 2 missed (7 days apart, non-scheduled days in between).
    """
    med_id = "6aa258000000000000000010"
    thu1 = "2026-09-03T08:00:00"
    thu2 = "2026-09-10T08:00:00"
    occs = [
        make_occ(med_id=med_id, freq="weekly", dt_str=thu1, status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, freq="weekly", dt_str=thu2, status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    # 7 days apart: Rule A is False, Rule B is True => RULE_B!
    assert evals[1].rule_a_satisfied is False
    assert evals[1].rule_b_satisfied is True
    assert evals[1].qualification == RuleQualificationType.RULE_B
    assert evals[1].rule_b_consecutive_previous == occs[0]


def test_rule_b_same_medicine_custom_consecutive_missed():
    """15. Same medicine, custom consecutive dates => satisfies Rule B."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, freq="custom", dt_str="2026-09-10T10:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, freq="custom", dt_str="2026-09-24T10:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].rule_b_satisfied is True
    assert evals[1].rule_b_consecutive_previous == occs[0]


def test_rule_b_missed_taken_missed_breaks_sequence():
    """16. Missed -> Taken -> Missed does NOT satisfy Rule B."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-08T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.TAKEN),
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    # For the third occurrence, previous occurrence is Taken => Rule B is False
    assert evals[2].rule_b_satisfied is False
    assert evals[2].rule_b_consecutive_previous is None


def test_rule_b_missed_skipped_missed_breaks_sequence():
    """17. Missed -> Skipped -> Missed does NOT satisfy Rule B."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-08T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.SKIPPED),
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[2].rule_b_satisfied is False


def test_rule_b_missed_pending_missed_breaks_sequence():
    """18. Missed -> Pending -> Missed does NOT satisfy Rule B."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-08T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.PENDING),
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[2].rule_b_satisfied is False


def test_rule_b_missed_snoozed_active_missed_breaks_sequence():
    """Intervening SNOOZED_ACTIVE dose breaks the consecutive missed sequence."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-08T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.SNOOZED_ACTIVE),
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[2].rule_b_satisfied is False


def test_rule_b_missed_on_non_consecutive_occurrences():
    """19. Missed on two non-consecutive occurrences does NOT satisfy Rule B."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-07T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-08T08:00:00", status=OccurrenceClassification.TAKEN),
        make_occ(med_id=med_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.TAKEN),
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[3].rule_b_satisfied is False


def test_rule_b_multiple_doses_same_day_uses_occurrence_sequence():
    """
    20 & 22. Two missed doses on same day (08:00 and 20:00) follow occurrence sequence,
    not conflating calendar dates.
    """
    med_id = "6aa258000000000000000010"
    sched_m = "6aa258000000000000000101"
    sched_e = "6aa258000000000000000102"
    occs = [
        make_occ(med_id=med_id, sched_id=sched_m, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, sched_id=sched_e, dt_str="2026-09-10T20:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    # The 20:00 dose is the consecutive next scheduled occurrence of med_id
    assert evals[1].rule_b_satisfied is True
    assert evals[1].rule_b_consecutive_previous == occs[0]


def test_rule_b_non_scheduled_days_do_not_break_sequence():
    """21. Non-scheduled days between scheduled occurrences do not break sequence."""
    med_id = "6aa258000000000000000010"
    # Custom schedule: Monday 09-07, Friday 09-11 (Tuesday-Thursday not scheduled)
    occs = [
        make_occ(med_id=med_id, freq="custom", dt_str="2026-09-07T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, freq="custom", dt_str="2026-09-11T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].rule_b_satisfied is True


# ============================================================================
# COMBINATION TESTS
# ============================================================================

def test_combination_rule_a_only():
    """23. Rule A only => qualification is RULE_A."""
    # Two different medicines missed within 24h
    occs = [
        make_occ(med_id="6aa258000000000000000010", med_name="Med 1", dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id="6aa258000000000000000020", med_name="Med 2", dt_str="2026-09-10T12:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].qualification == RuleQualificationType.RULE_A
    assert evals[1].rule_a_satisfied is True
    assert evals[1].rule_b_satisfied is False


def test_combination_rule_b_only():
    """24. Rule B only => qualification is RULE_B."""
    # Same medicine, weekly schedule (> 24 hours apart so Rule A cannot apply)
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-03T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[1].qualification == RuleQualificationType.RULE_B
    assert evals[1].rule_a_satisfied is False
    assert evals[1].rule_b_satisfied is True


def test_combination_both_rules_simultaneously():
    """25 & 26. Rule A AND Rule B simultaneously => ONE combined RULE_A_B qualification."""
    med_id = "6aa258000000000000000010"
    # Same medicine daily: 09-Sep 08:00 and 10-Sep 08:00 (24h apart and consecutive)
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-09T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert len(evals) == 2
    # Second occurrence satisfies both: exactly one evaluation object with RULE_A_B
    assert evals[1].qualification == RuleQualificationType.RULE_A_B
    assert evals[1].rule_a_satisfied is True
    assert evals[1].rule_b_satisfied is True
    assert evals[1].is_qualifying is True


# ============================================================================
# ISOLATION & CORRECTNESS TESTS
# ============================================================================

def test_different_medicines_do_not_satisfy_rule_b():
    """28. Different medicines never satisfy Rule B even if adjacent in time."""
    med1_id = "6aa258000000000000000010"
    med2_id = "6aa258000000000000000020"
    occs = [
        make_occ(med_id=med1_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med2_id, dt_str="2026-09-10T09:00:00", status=OccurrenceClassification.MISSED),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[0].rule_b_satisfied is False
    assert evals[1].rule_b_satisfied is False


def test_different_schedule_ids_remain_distinct_in_occurrence_identity():
    """29. Different schedule IDs for the same medicine maintain unique occurrence_key."""
    med_id = "6aa258000000000000000010"
    sched1 = "6aa258000000000000000101"
    sched2 = "6aa258000000000000000102"
    occ1 = make_occ(med_id=med_id, sched_id=sched1, dt_str="2026-09-10T08:00:00")
    occ2 = make_occ(med_id=med_id, sched_id=sched2, dt_str="2026-09-10T20:00:00")

    evals = evaluate_occurrence_sequence([occ1, occ2])
    assert evals[0].occurrence_key != evals[1].occurrence_key
    assert sched1 in evals[0].occurrence_key
    assert sched2 in evals[1].occurrence_key


def test_future_pending_occurrences_never_counted_as_missed():
    """30. Future occurrences classified as PENDING are never counted toward Rule A or Rule B."""
    med_id = "6aa258000000000000000010"
    occs = [
        make_occ(med_id=med_id, dt_str="2026-09-10T08:00:00", status=OccurrenceClassification.MISSED),
        make_occ(med_id=med_id, dt_str="2026-09-10T20:00:00", status=OccurrenceClassification.PENDING),
        make_occ(med_id=med_id, dt_str="2026-09-11T08:00:00", status=OccurrenceClassification.PENDING),
    ]
    evals = evaluate_occurrence_sequence(occs)
    assert evals[0].qualification == RuleQualificationType.NONE
    assert evals[1].qualification == RuleQualificationType.NONE
    assert evals[2].qualification == RuleQualificationType.NONE


# ============================================================================
# SERVICE ASYNC PATIENT ISOLATION (Mock Async DB)
# ============================================================================

class MockAsyncCursor:
    def __init__(self, items):
        self.items = items
    async def to_list(self, length=None):
        return self.items


class MockAsyncCollection:
    def __init__(self, docs: List[Dict[str, Any]]):
        self.docs = docs

    def find(self, query: Dict[str, Any]):
        results = []
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
                results.append(d)
        return MockAsyncCursor(results)


@pytest.mark.asyncio
async def test_service_async_patient_isolation():
    """27. Patient isolation: occurrences from another patient are never queried or qualified."""
    patient_a = ObjectId("6aa2580000000000000000aa")
    patient_b = ObjectId("6aa2580000000000000000bb")

    # Patient A has 2 missed doses (satisfies Rule A)
    # Patient B has 1 missed dose (does not satisfy Rule A)
    med_a = {"_id": ObjectId("6aa258000000000000000101"), "userId": patient_a, "name": "Med A", "dosage": "1", "dosageUnit": "mg"}
    sched_a1 = {"_id": ObjectId("6aa258000000000000000201"), "userId": patient_a, "medicineId": med_a["_id"], "time": "08:00", "frequencyType": "daily", "startDate": "2026-09-10", "enabled": True}
    sched_a2 = {"_id": ObjectId("6aa258000000000000000202"), "userId": patient_a, "medicineId": med_a["_id"], "time": "12:00", "frequencyType": "daily", "startDate": "2026-09-10", "enabled": True}

    med_b = {"_id": ObjectId("6aa258000000000000000102"), "userId": patient_b, "name": "Med B", "dosage": "1", "dosageUnit": "mg"}
    sched_b1 = {"_id": ObjectId("6aa258000000000000000203"), "userId": patient_b, "medicineId": med_b["_id"], "time": "08:00", "frequencyType": "daily", "startDate": "2026-09-10", "enabled": True}

    schedules_coll = MockAsyncCollection([sched_a1, sched_a2, sched_b1])
    medicines_coll = MockAsyncCollection([med_a, med_b])
    activities_coll = MockAsyncCollection([])  # no activity => all missed after 60m

    evaluator = MissedDoseRuleEvaluator(
        schedules_coll=schedules_coll,
        medicines_coll=medicines_coll,
        activities_coll=activities_coll,
    )

    eval_d = date(2026, 9, 10)
    ref_time = datetime(2026, 9, 10, 14, 0, 0, tzinfo=timezone.utc)

    # Evaluate Patient B: only 1 missed dose => NONE
    summary_b = await evaluator.evaluate_patient_rules_for_date(patient_b, eval_d, reference_time=ref_time)
    assert summary_b.total_missed == 1
    assert summary_b.has_qualifications is False
    assert len(summary_b.qualifying_evaluations) == 0

    # Evaluate Patient A: 2 missed doses => qualifies
    summary_a = await evaluator.evaluate_patient_rules_for_date(patient_a, eval_d, reference_time=ref_time)
    assert summary_a.total_missed == 2
    assert summary_a.has_qualifications is True
    assert len(summary_a.qualifying_evaluations) == 1
    # Qualifies for RULE_A_B (both 2 in 24h and consecutive for med_a)
    assert summary_a.qualifying_evaluations[0].qualification == RuleQualificationType.RULE_A_B
