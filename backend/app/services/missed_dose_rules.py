"""Missed-Dose Rule Evaluator: Rule A + Rule B Alert Qualification (Phase 9.2.3).

Consumes already-classified ClassifiedOccurrence records and evaluates
application/product alert qualification rules:

- RULE A: At least 2 genuinely MISSED occurrences across the patient's active
  regimen within a rolling 24-hour window.
  * Boundary: older occurrence <= 24h before trigger => inside (inclusive).
  * Boundary: older occurrence > 24h before trigger => outside (exclusive).
  * Only occurrences classified as MISSED participate (Taken, Skipped, Pending,
    and Snoozed-Active are strictly excluded).

- RULE B: The same medicine is MISSED on 2 consecutive scheduled occurrences
  in that medicine's canonical schedule sequence.
  * Intervening Taken, Skipped, Pending, or Snoozed-Active dose breaks the sequence.
  * Non-scheduled days do not break the sequence.
  * Multiple daily schedules for the same medicine follow their chronological
    occurrence sequence.

- COMBINATION (RULE A + RULE B):
  * If Rule A AND Rule B are satisfied for the same trigger occurrence:
    Return ONE qualification: RULE_A_B (never two separate alert qualifications).
  * If only Rule A: RULE_A.
  * If only Rule B: RULE_B.
  * If neither: NONE.

Pure business logic service:
- Decoupled from FastAPI Request, HTTPException, and RBAC
- No notification persistence, no deduplication, no cooldown logic (deferred to Phase 9.2.4)
- Uses PyMongo Async collection getters (no Motor dependency)
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Union
from bson import ObjectId

from app.models.collections import now_utc
from app.services.missed_dose_service import (
    ClassifiedOccurrence,
    MissedDoseService,
    OccurrenceClassification,
)
from app.utils.mongo import to_object_id

# Rolling 24-hour lookback duration
ROLLING_WINDOW_HOURS = 24
ROLLING_WINDOW_DELTA = timedelta(hours=ROLLING_WINDOW_HOURS)


class RuleQualificationType(str, Enum):
    """Domain alert qualification types for a trigger occurrence."""
    NONE = "NONE"
    RULE_A = "RULE_A"
    RULE_B = "RULE_B"
    RULE_A_B = "RULE_A_B"


@dataclass
class OccurrenceRuleEvaluation:
    """Detailed evaluation result for an individual scheduled occurrence."""
    occurrence: ClassifiedOccurrence
    qualification: RuleQualificationType
    rule_a_satisfied: bool
    rule_b_satisfied: bool
    rule_a_trigger_occurrences: List[ClassifiedOccurrence] = field(default_factory=list)
    rule_b_consecutive_previous: Optional[ClassifiedOccurrence] = None

    @property
    def occurrence_key(self) -> str:
        """Canonical 5-tuple occurrence identity."""
        return (
            f"{self.occurrence.patient_id}:"
            f"{self.occurrence.medicine_id}:"
            f"{self.occurrence.schedule_id}:"
            f"{self.occurrence.scheduled_date}:"
            f"{self.occurrence.scheduled_time}"
        )

    @property
    def is_qualifying(self) -> bool:
        """True if occurrence qualifies for Rule A, Rule B, or both."""
        return self.qualification != RuleQualificationType.NONE


@dataclass
class PatientRuleEvaluationSummary:
    """Aggregate summary of rule evaluations for a patient across an evaluated period."""
    patient_id: ObjectId
    evaluated_at: datetime
    total_occurrences: int
    total_missed: int
    evaluations: List[OccurrenceRuleEvaluation]
    qualifying_evaluations: List[OccurrenceRuleEvaluation]
    has_qualifications: bool


def evaluate_occurrence_sequence(
    occurrences: List[ClassifiedOccurrence],
) -> List[OccurrenceRuleEvaluation]:
    """
    Pure business evaluation function:
    Evaluates Rule A and Rule B across a chronological sequence of ClassifiedOccurrence records.
    Deterministic: identical occurrence input produces identical rule results.
    """
    if not occurrences:
        return []

    # 1. Sort all occurrences strictly chronologically
    sorted_occs = sorted(
        occurrences,
        key=lambda x: (x.scheduled_datetime, str(x.medicine_id), str(x.schedule_id)),
    )

    # 2. Build per-medicine chronological occurrence sequences for Rule B
    med_occurrences: Dict[ObjectId, List[ClassifiedOccurrence]] = defaultdict(list)
    for occ in sorted_occs:
        med_occurrences[occ.medicine_id].append(occ)

    evaluations: List[OccurrenceRuleEvaluation] = []

    # 3. Evaluate each occurrence
    for occ in sorted_occs:
        # Non-missed occurrences (Taken, Skipped, Pending, Snoozed-Active) never qualify
        if not occ.is_missed:
            evaluations.append(
                OccurrenceRuleEvaluation(
                    occurrence=occ,
                    qualification=RuleQualificationType.NONE,
                    rule_a_satisfied=False,
                    rule_b_satisfied=False,
                    rule_a_trigger_occurrences=[],
                    rule_b_consecutive_previous=None,
                )
            )
            continue

        trigger_time = occ.scheduled_datetime
        window_start = trigger_time - ROLLING_WINDOW_DELTA

        # ---------------------------------------------------------------------
        # RULE A: >= 2 missed occurrences across the regimen within rolling 24h
        # Window: [trigger_time - 24h, trigger_time] (inclusive boundaries)
        # Older occurrence > 24h before trigger => outside
        # Older occurrence == 24h before trigger => inside
        # ---------------------------------------------------------------------
        rule_a_matches = [
            other for other in sorted_occs
            if other.is_missed
            and window_start <= other.scheduled_datetime <= trigger_time
        ]
        rule_a_satisfied = len(rule_a_matches) >= 2

        # ---------------------------------------------------------------------
        # RULE B: 2 consecutive missed scheduled occurrences of the same medicine
        # Look up immediately preceding scheduled occurrence in that medicine's sequence
        # ---------------------------------------------------------------------
        med_seq = med_occurrences[occ.medicine_id]
        occ_idx = med_seq.index(occ)
        rule_b_satisfied = False
        prev_med_occ: Optional[ClassifiedOccurrence] = None

        if occ_idx > 0:
            candidate_prev = med_seq[occ_idx - 1]
            if candidate_prev.is_missed:
                rule_b_satisfied = True
                prev_med_occ = candidate_prev

        # ---------------------------------------------------------------------
        # COMBINATION: RULE_A_B vs RULE_A vs RULE_B vs NONE
        # If both Rule A and Rule B are satisfied, return ONE combined qualification
        # ---------------------------------------------------------------------
        if rule_a_satisfied and rule_b_satisfied:
            qualification = RuleQualificationType.RULE_A_B
        elif rule_a_satisfied:
            qualification = RuleQualificationType.RULE_A
        elif rule_b_satisfied:
            qualification = RuleQualificationType.RULE_B
        else:
            qualification = RuleQualificationType.NONE

        evaluations.append(
            OccurrenceRuleEvaluation(
                occurrence=occ,
                qualification=qualification,
                rule_a_satisfied=rule_a_satisfied,
                rule_b_satisfied=rule_b_satisfied,
                rule_a_trigger_occurrences=rule_a_matches if rule_a_satisfied else [],
                rule_b_consecutive_previous=prev_med_occ if rule_b_satisfied else None,
            )
        )

    return evaluations


class MissedDoseRuleEvaluator:
    """
    Service coordinating occurrence classification and Rule A / Rule B alert qualification.
    Decoupled from HTTP, RBAC, notification persistence, and scheduling.
    """

    def __init__(
        self,
        missed_dose_service: Optional[MissedDoseService] = None,
        schedules_coll: Optional[Any] = None,
        medicines_coll: Optional[Any] = None,
        activities_coll: Optional[Any] = None,
    ):
        if missed_dose_service is not None:
            self.missed_dose_service = missed_dose_service
        else:
            self.missed_dose_service = MissedDoseService(
                schedules_coll=schedules_coll,
                medicines_coll=medicines_coll,
                activities_coll=activities_coll,
            )

    async def evaluate_patient_rules(
        self,
        patient_id: Union[str, ObjectId],
        start_date: date,
        end_date: date,
        reference_time: Optional[datetime] = None,
        lookback_days: int = 30,
    ) -> PatientRuleEvaluationSummary:
        """
        Evaluate alert qualification rules for a patient.
        Fetches an expanded lookback window to provide context for consecutive misses
        and rolling 24-hour calculations, then filters results to [start_date, end_date].
        """
        patient_oid = to_object_id(patient_id)
        if reference_time is None:
            ref_time = now_utc()
        else:
            ref_time = reference_time
            if ref_time.tzinfo is None:
                ref_time = ref_time.replace(tzinfo=timezone.utc)

        # Expand start date backwards to cover lookback history
        fetch_start = start_date - timedelta(days=lookback_days)

        # 1. Fetch classified occurrences from MissedDoseService
        all_classified = await self.missed_dose_service.get_classified_occurrences_for_patient(
            patient_id=patient_oid,
            start_date=fetch_start,
            end_date=end_date,
            reference_time=ref_time,
        )

        # 2. Run pure business evaluation over complete chronological sequence
        all_evaluations = evaluate_occurrence_sequence(all_classified)

        # 3. Filter evaluations to the target date range [start_date, end_date]
        target_evals: List[OccurrenceRuleEvaluation] = []
        for eval_item in all_evaluations:
            occ_d = eval_item.occurrence.scheduled_datetime.date()
            if start_date <= occ_d <= end_date:
                target_evals.append(eval_item)

        qualifying = [e for e in target_evals if e.is_qualifying]
        missed_count = sum(1 for e in target_evals if e.occurrence.is_missed)

        return PatientRuleEvaluationSummary(
            patient_id=patient_oid,
            evaluated_at=ref_time,
            total_occurrences=len(target_evals),
            total_missed=missed_count,
            evaluations=target_evals,
            qualifying_evaluations=qualifying,
            has_qualifications=len(qualifying) > 0,
        )

    async def evaluate_patient_rules_for_date(
        self,
        patient_id: Union[str, ObjectId],
        target_date: date,
        reference_time: Optional[datetime] = None,
        lookback_days: int = 30,
    ) -> PatientRuleEvaluationSummary:
        """Convenience method evaluating rules for a single calendar date."""
        return await self.evaluate_patient_rules(
            patient_id=patient_id,
            start_date=target_date,
            end_date=target_date,
            reference_time=reference_time,
            lookback_days=lookback_days,
        )
