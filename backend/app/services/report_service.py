"""Medication Adherence Report Calculation Service (Phase 11).

Calculates clinically accurate adherence reports for weekly and monthly periods:
- Distinguishes Taken, Skipped, Missed, Unresolved Snoozed, and Pending states
- Adheres strictly to Phase 9 missed-dose and occurrence classification semantics
- Reuses shared AdherenceService for streak calculation evaluated as of report endDate
- Never duplicates occurrence-generation or streak logic
- Calculates overall summary, per-medicine breakdown, and daily adherence logs
- Pure domain calculation service: decoupled from HTTP routers, authorization, and PDF rendering
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

from bson import ObjectId

from app.db.mongodb import (
    get_activities_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.models.collections import now_utc
from app.schemas.report import (
    MedicationReportResponse,
    ReportDailySummary,
    ReportMedicineBreakdown,
    ReportPeriod,
    ReportStreakSummary,
    ReportSummary,
)
from app.services.adherence_service import build_streak_response
from app.services.missed_dose_service import (
    OccurrenceClassification,
    classify_occurrence,
)
from app.services.occurrence_engine import is_schedule_occurrence
from app.utils.mongo import to_object_id

logger = logging.getLogger("meditrack.report_service")


class ReportValidationError(ValueError):
    """Raised when report period or date constraints fail."""
    pass


class PatientNotFoundError(KeyError):
    """Raised when target patient record does not exist."""
    pass


def _parse_report_date(val: Union[date, str], param_name: str = "date") -> date:
    """Parse a date parameter, raising domain ReportValidationError on invalid format."""
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return date.fromisoformat(val.strip())
        except (ValueError, AttributeError):
            raise ReportValidationError(f"{param_name} must be a valid date in YYYY-MM-DD format: '{val}'.")
    raise ReportValidationError(f"{param_name} must be a date object or YYYY-MM-DD string.")


def validate_report_period(
    period: Union[ReportPeriod, str],
    start_d: date,
    end_d: date,
    reference_today: Optional[date] = None,
) -> ReportPeriod:
    """Validate report date range and period constraints.

    Rules:
    - startDate <= endDate
    - Weekly period must span exactly 7 consecutive days
    - Monthly period must span between 28 and 31 days (one full month)
    - If reference_today is provided, startDate cannot be strictly in the future
    """
    if start_d > end_d:
        raise ReportValidationError("startDate must be before or equal to endDate.")

    if reference_today is not None and start_d > reference_today:
        raise ReportValidationError("Report start date cannot be in the future.")

    period_str = str(period.value if isinstance(period, ReportPeriod) else period).lower().strip()
    days_count = (end_d - start_d).days + 1

    if period_str == "weekly":
        if days_count != 7:
            raise ReportValidationError(
                f"Weekly report must span exactly 7 consecutive days. Provided range spans {days_count} days."
            )
        return ReportPeriod.WEEKLY
    elif period_str == "monthly":
        if not (28 <= days_count <= 31):
            raise ReportValidationError(
                f"Monthly report must span between 28 and 31 days. Provided range spans {days_count} days."
            )
        return ReportPeriod.MONTHLY
    else:
        raise ReportValidationError(f"Unsupported report period: '{period}'. Must be 'weekly' or 'monthly'.")


class ReportService:
    """Domain service for calculating comprehensive medication adherence reports."""

    def __init__(
        self,
        medicines_coll: Optional[Any] = None,
        schedules_coll: Optional[Any] = None,
        activities_coll: Optional[Any] = None,
        users_coll: Optional[Any] = None,
    ):
        self._medicines_coll = medicines_coll
        self._schedules_coll = schedules_coll
        self._activities_coll = activities_coll
        self._users_coll = users_coll

    @property
    def medicines_coll(self) -> Any:
        return self._medicines_coll if self._medicines_coll is not None else get_medicines_collection()

    @property
    def schedules_coll(self) -> Any:
        return self._schedules_coll if self._schedules_coll is not None else get_schedules_collection()

    @property
    def activities_coll(self) -> Any:
        return self._activities_coll if self._activities_coll is not None else get_activities_collection()

    @property
    def users_coll(self) -> Any:
        return self._users_coll if self._users_coll is not None else get_users_collection()

    async def calculate_report(
        self,
        patient_id: Union[ObjectId, str],
        period: Union[ReportPeriod, str],
        start_date: Union[date, str],
        end_date: Union[date, str],
        reference_time: Optional[datetime] = None,
    ) -> MedicationReportResponse:
        """Calculate a complete adherence report for the specified patient and date range.

        Parameters:
        - patient_id: Target patient ObjectId or string
        - period: 'weekly' or 'monthly'
        - start_date: Start of report range (date or YYYY-MM-DD string)
        - end_date: End of report range (date or YYYY-MM-DD string)
        - reference_time: Optional datetime reference point for historical evaluation
        """
        patient_oid = to_object_id(patient_id)

        # 1. Parse and validate dates
        start_d = _parse_report_date(start_date, "startDate")
        end_d = _parse_report_date(end_date, "endDate")

        ref_time = reference_time
        if ref_time is None:
            now = now_utc()
            # If report is purely historical (end_d in the past), evaluate occurrences as of end of that period
            if end_d < now.date():
                ref_time = datetime.combine(end_d, datetime.max.time().replace(microsecond=0), tzinfo=timezone.utc)
            else:
                ref_time = now
        elif ref_time.tzinfo is None:
            ref_time = ref_time.replace(tzinfo=timezone.utc)

        ref_today = ref_time.date()
        validated_period = validate_report_period(period, start_d, end_d, reference_today=ref_today)

        start_str = start_d.isoformat()
        end_str = end_d.isoformat()

        # 2. Fetch patient user document
        user = await self.users_coll.find_one({"_id": patient_oid})
        if not user:
            raise PatientNotFoundError(f"Patient record not found for id: {patient_id}")
        patient_name = user.get("fullName") or "Patient"
        patient_email = user.get("email") or ""

        # 3. Fetch medicines
        medicines = await self.medicines_coll.find({"userId": patient_oid}).to_list(length=1000)
        med_map = {str(m["_id"]): m for m in medicines}

        # 4. Fetch enabled schedules
        schedules = await self.schedules_coll.find({"userId": patient_oid, "enabled": True}).to_list(length=1000)

        # 5. Fetch activities recorded in the report window
        activities = await self.activities_coll.find({
            "userId": patient_oid,
            "scheduledDate": {"$gte": start_str, "$lte": end_str},
        }).to_list(length=3000)

        # Index activities by (scheduleId, scheduledDate, scheduledTime)
        act_map: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = defaultdict(list)
        for act in activities:
            key = (
                str(act.get("scheduleId")),
                str(act.get("scheduledDate")),
                str(act.get("scheduledTime")),
            )
            act_map[key].append(act)

        # 6. Evaluate occurrences day-by-day and medicine-by-medicine
        total_scheduled = 0
        total_taken = 0
        total_skipped = 0
        total_missed = 0
        total_snoozed = 0
        total_pending = 0

        # Data structures for breakdowns
        daily_summaries: List[ReportDailySummary] = []
        med_stats: Dict[str, Dict[str, Any]] = {}

        # Initialize med stats for all medicines that have schedules
        for sched in schedules:
            med_id = str(sched.get("medicineId"))
            if med_id not in med_stats and med_id in med_map:
                m = med_map[med_id]
                med_stats[med_id] = {
                    "medicineId": med_id,
                    "medicineName": m.get("name", "Unknown Medicine"),
                    "dosage": str(m.get("dosage", "1")),
                    "dosageUnit": str(m.get("dosageUnit", "tablet")),
                    "totalScheduled": 0,
                    "takenCount": 0,
                    "skippedCount": 0,
                    "missedCount": 0,
                    "unresolvedSnoozedCount": 0,
                    "pendingCount": 0,
                }

        curr_d = start_d
        day_step = timedelta(days=1)

        while curr_d <= end_d:
            curr_str = curr_d.isoformat()
            day_scheduled = 0
            day_taken = 0
            day_skipped = 0
            day_missed = 0
            day_snoozed = 0
            day_pending = 0

            for sched in schedules:
                sched_med_id = str(sched.get("medicineId"))
                med = med_map.get(sched_med_id)
                if not med:
                    continue

                if not is_schedule_occurrence(sched, med, curr_d, curr_str):
                    continue

                sched_id_str = str(sched["_id"])
                sched_time = str(sched.get("time", "08:00")).strip()
                acts = act_map.get((sched_id_str, curr_str, sched_time))

                # Classify occurrence using canonical Phase 9 semantics
                classified = classify_occurrence(
                    sched=sched,
                    med=med,
                    curr_date=curr_d,
                    curr_str=curr_str,
                    activities=acts,
                    reference_time=ref_time,
                )
                if not classified:
                    continue

                day_scheduled += 1
                if sched_med_id in med_stats:
                    med_stats[sched_med_id]["totalScheduled"] += 1

                if classified.status == OccurrenceClassification.TAKEN:
                    day_taken += 1
                    if sched_med_id in med_stats:
                        med_stats[sched_med_id]["takenCount"] += 1
                elif classified.status == OccurrenceClassification.SKIPPED:
                    day_skipped += 1
                    if sched_med_id in med_stats:
                        med_stats[sched_med_id]["skippedCount"] += 1
                elif classified.status == OccurrenceClassification.MISSED:
                    day_missed += 1
                    if sched_med_id in med_stats:
                        med_stats[sched_med_id]["missedCount"] += 1
                elif classified.status == OccurrenceClassification.SNOOZED_ACTIVE:
                    day_snoozed += 1
                    if sched_med_id in med_stats:
                        med_stats[sched_med_id]["unresolvedSnoozedCount"] += 1
                else:  # OccurrenceClassification.PENDING
                    day_pending += 1
                    if sched_med_id in med_stats:
                        med_stats[sched_med_id]["pendingCount"] += 1

            # Day metrics
            day_has_scheduled = day_scheduled > 0
            day_adherence = (
                round((day_taken / day_scheduled) * 100.0, 1)
                if day_has_scheduled
                else 100.0
            )

            daily_summaries.append(ReportDailySummary(
                date=curr_str,
                totalScheduled=day_scheduled,
                takenCount=day_taken,
                skippedCount=day_skipped,
                missedCount=day_missed,
                unresolvedSnoozedCount=day_snoozed,
                pendingCount=day_pending,
                adherencePercentage=day_adherence,
                hasScheduledDoses=day_has_scheduled,
            ))

            total_scheduled += day_scheduled
            total_taken += day_taken
            total_skipped += day_skipped
            total_missed += day_missed
            total_snoozed += day_snoozed
            total_pending += day_pending

            curr_d += day_step

        # 7. Calculate overall adherence summary
        has_scheduled = total_scheduled > 0
        overall_adherence = (
            round((total_taken / total_scheduled) * 100.0, 1)
            if has_scheduled
            else 100.0
        )

        summary = ReportSummary(
            totalScheduled=total_scheduled,
            takenCount=total_taken,
            skippedCount=total_skipped,
            missedCount=total_missed,
            unresolvedSnoozedCount=total_snoozed,
            pendingCount=total_pending,
            adherencePercentage=overall_adherence,
            hasScheduledDoses=has_scheduled,
        )

        # 8. Medicine breakdown models
        medicines_breakdown: List[ReportMedicineBreakdown] = []
        for m_id, stats in sorted(med_stats.items(), key=lambda x: x[1]["medicineName"].lower()):
            m_total = stats["totalScheduled"]
            m_taken = stats["takenCount"]
            m_has_scheduled = m_total > 0
            m_adherence = (
                round((m_taken / m_total) * 100.0, 1)
                if m_has_scheduled
                else 100.0
            )
            medicines_breakdown.append(ReportMedicineBreakdown(
                medicineId=stats["medicineId"],
                medicineName=stats["medicineName"],
                dosage=stats["dosage"],
                dosageUnit=stats["dosageUnit"],
                totalScheduled=m_total,
                takenCount=m_taken,
                skippedCount=stats["skippedCount"],
                missedCount=stats["missedCount"],
                unresolvedSnoozedCount=stats["unresolvedSnoozedCount"],
                pendingCount=stats["pendingCount"],
                adherencePercentage=m_adherence,
                hasScheduledDoses=m_has_scheduled,
            ))

        # 9. Historical streak calculation evaluated as of report endDate
        streak_resp = await build_streak_response(
            patient_oid=patient_oid,
            today=end_d,
            medicines_coll=self.medicines_coll,
            schedules_coll=self.schedules_coll,
            activities_coll=self.activities_coll,
        )
        streak_summary = ReportStreakSummary(
            currentStreak=streak_resp.currentStreak,
            longestStreak=streak_resp.longestStreak,
            totalAdherentDays=streak_resp.totalAdherentDays,
            totalTrackedDays=streak_resp.totalTrackedDays,
            lastAdherentDate=streak_resp.lastAdherentDate,
            evaluatedDate=end_str,
        )

        return MedicationReportResponse(
            reportType=validated_period,
            startDate=start_str,
            endDate=end_str,
            generatedAt=now_utc(),
            patientId=str(patient_oid),
            patientName=patient_name,
            patientEmail=patient_email,
            summary=summary,
            streak=streak_summary,
            medicines=medicines_breakdown,
            dailySummaries=daily_summaries,
        )


# Global singleton instance for shared usage
report_service = ReportService()


async def calculate_medication_report(
    patient_id: Union[ObjectId, str],
    period: Union[ReportPeriod, str],
    start_date: Union[date, str],
    end_date: Union[date, str],
    reference_time: Optional[datetime] = None,
) -> MedicationReportResponse:
    """Convenience helper to calculate an adherence report using the default service."""
    return await report_service.calculate_report(
        patient_id=patient_id,
        period=period,
        start_date=start_date,
        end_date=end_date,
        reference_time=reference_time,
    )
