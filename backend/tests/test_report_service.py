"""Unit and integration tests for Phase 11 Step 4: Report Calculation + PDF Generation.

Comprehensive tests covering:
A. Weekly report calculation
B. Monthly report calculation
C. Taken dose counted correctly
D. Skipped dose counted correctly and NOT missed
E. Snoozed -> Taken counted as Taken
F. Unresolved snooze classified correctly
G. Historical unacted dose classified as Missed
H. Future dose classified as Pending
I. Explicit missedCount is correct
J. Adherence formula is correct (Taken / TotalScheduled * 100)
K. Zero scheduled doses returns: adherencePercentage=100.0, hasScheduledDoses=False
L. Medicine breakdown totals match overall report
M. Daily breakdown totals match overall report
N. Historical streak uses report endDate, NOT today's date
O. PDF generation succeeds
P. PDF contains expected report sections/metadata
Q. PDF does not contain secrets/passwords/JWTs/SMTP credentials
R. Invalid date ranges are rejected
S. Existing Phase 1-10 behavior remains unchanged
"""

import base64
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid
import zlib
from bson import ObjectId
import pytest

from app.db.mongodb import (
    get_activities_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.models.collections import create_user_document, now_utc
from app.schemas.report import (
    MedicationReportResponse,
    ReportDailySummary,
    ReportMedicineBreakdown,
    ReportPeriod,
    ReportStreakSummary,
    ReportSummary,
)
from app.services.pdf_service import generate_adherence_report_pdf, pdf_service
from app.services.report_service import (
    PatientNotFoundError,
    ReportService,
    ReportValidationError,
    calculate_medication_report,
    validate_report_period,
)


def decode_pdf_text_streams(pdf_bytes: bytes) -> bytes:
    """Helper to extract all decompressed text streams from a ReportLab PDF."""
    parts = pdf_bytes.split(b"stream\n")
    all_decompressed = b""
    for seg in parts[1:]:
        end_marker = seg.find(b"~>")
        if end_marker != -1:
            a85_data = seg[: end_marker + 2]
            try:
                dec = zlib.decompress(base64.a85decode(a85_data, adobe=True))
                all_decompressed += dec + b"\n"
            except Exception:
                pass
        else:
            # Fallback if uncompressed or plain Flate
            raw_end = seg.find(b"\nendstream")
            if raw_end != -1:
                stream_raw = seg[:raw_end]
                try:
                    dec = zlib.decompress(stream_raw)
                    all_decompressed += dec + b"\n"
                except Exception:
                    all_decompressed += stream_raw + b"\n"
    return all_decompressed


class MockAsyncCollection:
    """Mock PyMongo Async Collection for deterministic testing of ReportService."""

    def __init__(self, documents: Optional[List[Dict[str, Any]]] = None):
        self.docs = documents or []

    async def find_one(self, query: Dict[str, Any], sort=None, **kwargs) -> Optional[Dict[str, Any]]:
        filtered = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                filtered.append(d)
        if not filtered:
            return None
        if sort:
            sort_field = sort[0][0]
            filtered.sort(key=lambda x: str(x.get(sort_field, "")))
        return filtered[0]

    def find(self, query: Dict[str, Any], **kwargs):
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


def make_test_patient(
    patient_id: Optional[ObjectId] = None,
    name: str = "Alice Jenkins",
    email: str = "alice@example.com",
) -> Dict[str, Any]:
    doc = create_user_document(
        email=email,
        full_name=name,
        password_hash="fakehashedpassword123",
        role="patient",
    )
    if patient_id:
        doc["_id"] = patient_id
    return doc


def make_test_medicine(
    med_id: ObjectId,
    patient_id: ObjectId,
    name: str = "Metformin",
    dosage: str = "500",
    dosage_unit: str = "mg",
) -> Dict[str, Any]:
    return {
        "_id": med_id,
        "userId": patient_id,
        "name": name,
        "dosage": dosage,
        "dosageUnit": dosage_unit,
        "frequency": "daily",
        "createdAt": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
    }


def make_test_schedule(
    sched_id: ObjectId,
    patient_id: ObjectId,
    med_id: ObjectId,
    frequency_type: str = "daily",
    time_str: str = "08:00",
    days_of_week: Optional[List[int]] = None,
    dates: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "_id": sched_id,
        "userId": patient_id,
        "medicineId": med_id,
        "frequencyType": frequency_type,
        "time": time_str,
        "daysOfWeek": days_of_week or [],
        "dates": dates or [],
        "enabled": True,
        "createdAt": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
    }


# ============================================================================
# Test A: Weekly Report Calculation
# ============================================================================
@pytest.mark.asyncio
async def test_weekly_report_calculation():
    """Verify weekly report spans 7 days, contains all sections, and calculates correctly."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id, "Weekly Patient", "weekly@example.com")
    med = make_test_medicine(m_id, p_id, "Atorvastatin", "20", "mg")
    sched = make_test_schedule(s_id, p_id, m_id, "daily", "08:00")

    # 7-day period: 2026-08-01 to 2026-08-07
    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 7)

    # 5 doses Taken, 1 Skipped, 1 Missed (no activity)
    activities = []
    for day_offset in range(5):
        curr = (start_d + timedelta(days=day_offset)).isoformat()
        activities.append({
            "_id": ObjectId(),
            "userId": p_id,
            "scheduleId": s_id,
            "scheduledDate": curr,
            "scheduledTime": "08:00",
            "action": "Taken",
            "actionTime": datetime.fromisoformat(f"{curr}T08:15:00+00:00"),
        })
    # 6th day: Skipped
    skip_d = (start_d + timedelta(days=5)).isoformat()
    activities.append({
        "_id": ObjectId(),
        "userId": p_id,
        "scheduleId": s_id,
        "scheduledDate": skip_d,
        "scheduledTime": "08:00",
        "action": "Skipped",
        "skipReason": "Fasting for blood work",
        "actionTime": datetime.fromisoformat(f"{skip_d}T08:05:00+00:00"),
    })
    # 7th day: no activity (will be Missed as evaluated historical date)

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        patient_id=p_id,
        period=ReportPeriod.WEEKLY,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 8, 8, 0, 0, 0, tzinfo=timezone.utc),
    )

    assert report.reportType == ReportPeriod.WEEKLY
    assert report.startDate == "2026-08-01"
    assert report.endDate == "2026-08-07"
    assert report.patientName == "Weekly Patient"
    assert report.patientEmail == "weekly@example.com"
    assert len(report.dailySummaries) == 7
    assert report.summary.totalScheduled == 7
    assert report.summary.takenCount == 5
    assert report.summary.skippedCount == 1
    assert report.summary.missedCount == 1
    assert report.summary.unresolvedSnoozedCount == 0
    assert report.summary.pendingCount == 0
    assert report.summary.adherencePercentage == round(5 / 7 * 100, 1)
    assert report.summary.hasScheduledDoses is True


# ============================================================================
# Test B: Monthly Report Calculation
# ============================================================================
@pytest.mark.asyncio
async def test_monthly_report_calculation():
    """Verify monthly report spans 30 days and aggregates correctly."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id, "Monthly Patient", "monthly@example.com")
    med = make_test_medicine(m_id, p_id, "Metformin", "500", "mg")
    sched = make_test_schedule(s_id, p_id, m_id, "daily", "09:00")

    # 30-day month: 2026-09-01 to 2026-09-30
    start_d = date(2026, 9, 1)
    end_d = date(2026, 9, 30)

    # 25 days Taken, 5 unacted (Missed)
    activities = []
    for day_offset in range(25):
        curr = (start_d + timedelta(days=day_offset)).isoformat()
        activities.append({
            "_id": ObjectId(),
            "userId": p_id,
            "scheduleId": s_id,
            "scheduledDate": curr,
            "scheduledTime": "09:00",
            "action": "Taken",
            "actionTime": datetime.fromisoformat(f"{curr}T09:10:00+00:00"),
        })

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        patient_id=p_id,
        period=ReportPeriod.MONTHLY,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 10, 1, 0, 0, 0, tzinfo=timezone.utc),
    )

    assert report.reportType == ReportPeriod.MONTHLY
    assert len(report.dailySummaries) == 30
    assert report.summary.totalScheduled == 30
    assert report.summary.takenCount == 25
    assert report.summary.missedCount == 5
    assert report.summary.skippedCount == 0
    assert report.summary.adherencePercentage == round(25 / 30 * 100, 1)


# ============================================================================
# Test C: Taken Dose Counted Correctly
# ============================================================================
@pytest.mark.asyncio
async def test_taken_dose_counted_correctly():
    """Verify Taken dose increments takenCount and contributes to adherence."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id)

    act = {
        "_id": ObjectId(),
        "userId": p_id,
        "scheduleId": s_id,
        "scheduledDate": "2026-08-01",
        "scheduledTime": "08:00",
        "action": "Taken",
        "actionTime": datetime(2026, 8, 1, 8, 5, tzinfo=timezone.utc),
    }

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection([act]),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    assert report.summary.takenCount == 1
    assert report.dailySummaries[0].takenCount == 1
    assert report.medicines[0].takenCount == 1


# ============================================================================
# Test D: Skipped Dose Counted Correctly and NOT Missed
# ============================================================================
@pytest.mark.asyncio
async def test_skipped_dose_not_counted_as_missed():
    """Verify Skipped dose increments skippedCount and is NOT counted in missedCount."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id)

    act = {
        "_id": ObjectId(),
        "userId": p_id,
        "scheduleId": s_id,
        "scheduledDate": "2026-08-01",
        "scheduledTime": "08:00",
        "action": "Skipped",
        "skipReason": "Felt unwell",
        "actionTime": datetime(2026, 8, 1, 8, 10, tzinfo=timezone.utc),
    }

    # Rest of week took dose
    acts = [act]
    for d in range(1, 7):
        curr = (date(2026, 8, 1) + timedelta(days=d)).isoformat()
        acts.append({
            "_id": ObjectId(),
            "userId": p_id,
            "scheduleId": s_id,
            "scheduledDate": curr,
            "scheduledTime": "08:00",
            "action": "Taken",
            "actionTime": datetime.fromisoformat(f"{curr}T08:05:00+00:00"),
        })

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(acts),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    assert report.summary.skippedCount == 1
    assert report.summary.missedCount == 0
    assert report.summary.takenCount == 6
    assert report.summary.totalScheduled == 7


# ============================================================================
# Test E: Snoozed followed by Taken counted as Taken
# ============================================================================
@pytest.mark.asyncio
async def test_snoozed_followed_by_taken_resolves_to_taken():
    """Verify an occurrence that was snoozed then taken resolves cleanly to Taken."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id, time_str="08:00")

    # Day 1: Snoozed at 08:02, Taken at 08:09
    act_snooze = {
        "_id": ObjectId(),
        "userId": p_id,
        "scheduleId": s_id,
        "scheduledDate": "2026-08-01",
        "scheduledTime": "08:00",
        "action": "Snoozed",
        "actionTime": datetime(2026, 8, 1, 8, 2, tzinfo=timezone.utc),
        "snoozeCount": 1,
    }
    act_taken = {
        "_id": ObjectId(),
        "userId": p_id,
        "scheduleId": s_id,
        "scheduledDate": "2026-08-01",
        "scheduledTime": "08:00",
        "action": "Taken",
        "actionTime": datetime(2026, 8, 1, 8, 9, tzinfo=timezone.utc),
        "wasSnoozed": True,
        "snoozeCount": 1,
    }

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection([act_snooze, act_taken]),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    day1 = report.dailySummaries[0]
    assert day1.takenCount == 1
    assert day1.unresolvedSnoozedCount == 0
    assert day1.missedCount == 0


# ============================================================================
# Test F: Unresolved Snooze Classification
# ============================================================================
@pytest.mark.asyncio
async def test_unresolved_snooze_classification():
    """Verify active snooze within 10 min window is counted as unresolvedSnoozedCount,
    and snooze expired beyond grace window is counted as missedCount."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id, time_str="08:00")

    # Dose snoozed at 08:05:00
    act_snooze = {
        "_id": ObjectId(),
        "userId": p_id,
        "scheduleId": s_id,
        "scheduledDate": "2026-08-01",
        "scheduledTime": "08:00",
        "action": "Snoozed",
        "actionTime": datetime(2026, 8, 1, 8, 5, 0, tzinfo=timezone.utc),
        "snoozeCount": 1,
    }

    # Case 1: Evaluated at 08:12 (within 10-minute snooze window, expiry is 08:15)
    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection([act_snooze]),
        users_coll=MockAsyncCollection([user]),
    )
    report_active = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 1, 8, 12, 0, tzinfo=timezone.utc)
    )
    assert report_active.dailySummaries[0].unresolvedSnoozedCount == 1
    assert report_active.dailySummaries[0].missedCount == 0

    # Case 2: Evaluated at 09:30 (snooze expired and past scheduled + 60m deadline)
    report_expired = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 1, 9, 30, 0, tzinfo=timezone.utc)
    )
    assert report_expired.dailySummaries[0].missedCount == 1
    assert report_expired.dailySummaries[0].unresolvedSnoozedCount == 0


# ============================================================================
# Test G: Historical Unacted Dose Classified as Missed
# ============================================================================
@pytest.mark.asyncio
async def test_historical_unacted_dose_classified_as_missed():
    """Verify past scheduled dose with no recorded action is classified as Missed."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id, time_str="08:00")

    # Empty activities
    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection([]),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    assert report.summary.totalScheduled == 7
    assert report.summary.missedCount == 7
    assert report.summary.takenCount == 0
    assert report.summary.adherencePercentage == 0.0


# ============================================================================
# Test H: Future Dose Classified as Pending
# ============================================================================
@pytest.mark.asyncio
async def test_future_dose_classified_as_pending():
    """Verify scheduled doses in the future relative to reference_time are classified as Pending."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id, time_str="08:00")

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection([]),
        users_coll=MockAsyncCollection([user]),
    )

    # Reference time is day 1 at 07:00 (before 08:00 dose): all 7 days should be Pending!
    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 1, 7, 0, tzinfo=timezone.utc)
    )

    assert report.summary.totalScheduled == 7
    assert report.summary.pendingCount == 7
    assert report.summary.missedCount == 0
    assert report.summary.takenCount == 0


# ============================================================================
# Test I: Explicit missedCount is Correct
# ============================================================================
@pytest.mark.asyncio
async def test_explicit_missed_count_across_mixed_occurrences():
    """Verify missedCount accurately counts both unacted historical and expired snooze doses."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id, time_str="08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 7)

    # Day 1: Taken
    # Day 2: Taken
    # Day 3: Skipped (not missed!)
    # Day 4: Expired snooze (missed)
    # Day 5, 6, 7: Unacted (missed)
    activities = [
        {
            "_id": ObjectId(), "userId": p_id, "scheduleId": s_id,
            "scheduledDate": "2026-08-01", "scheduledTime": "08:00",
            "action": "Taken", "actionTime": datetime(2026, 8, 1, 8, 10, tzinfo=timezone.utc),
        },
        {
            "_id": ObjectId(), "userId": p_id, "scheduleId": s_id,
            "scheduledDate": "2026-08-02", "scheduledTime": "08:00",
            "action": "Taken", "actionTime": datetime(2026, 8, 2, 8, 5, tzinfo=timezone.utc),
        },
        {
            "_id": ObjectId(), "userId": p_id, "scheduleId": s_id,
            "scheduledDate": "2026-08-03", "scheduledTime": "08:00",
            "action": "Skipped", "skipReason": "NPO",
            "actionTime": datetime(2026, 8, 3, 8, 0, tzinfo=timezone.utc),
        },
        {
            "_id": ObjectId(), "userId": p_id, "scheduleId": s_id,
            "scheduledDate": "2026-08-04", "scheduledTime": "08:00",
            "action": "Snoozed",
            "actionTime": datetime(2026, 8, 4, 8, 5, tzinfo=timezone.utc),
        },
    ]

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, start_d, end_d,
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    assert report.summary.totalScheduled == 7
    assert report.summary.takenCount == 2
    assert report.summary.skippedCount == 1
    assert report.summary.missedCount == 4  # Day 4 (expired snooze) + Days 5, 6, 7
    assert report.summary.unresolvedSnoozedCount == 0
    assert report.summary.pendingCount == 0


# ============================================================================
# Test J: Adherence Formula is Correct
# ============================================================================
@pytest.mark.asyncio
async def test_adherence_formula_calculation():
    """Verify primary adherence formula: Taken / TotalScheduled * 100."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id, time_str="08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 7)

    # 4 taken out of 7 scheduled
    activities = []
    for day_offset in range(4):
        curr = (start_d + timedelta(days=day_offset)).isoformat()
        activities.append({
            "_id": ObjectId(), "userId": p_id, "scheduleId": s_id,
            "scheduledDate": curr, "scheduledTime": "08:00",
            "action": "Taken", "actionTime": datetime.fromisoformat(f"{curr}T08:05:00+00:00"),
        })

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, start_d, end_d,
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    expected_pct = round((4 / 7) * 100.0, 1)
    assert report.summary.adherencePercentage == expected_pct
    assert report.summary.adherencePercentage == 57.1


# ============================================================================
# Test K: Zero Scheduled Doses Returns 100% and False
# ============================================================================
@pytest.mark.asyncio
async def test_zero_scheduled_doses():
    """Verify period with zero scheduled doses returns adherencePercentage=100.0 and hasScheduledDoses=False."""
    p_id = ObjectId()
    user = make_test_patient(p_id)

    service = ReportService(
        medicines_coll=MockAsyncCollection([]),
        schedules_coll=MockAsyncCollection([]),
        activities_coll=MockAsyncCollection([]),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7),
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    assert report.summary.totalScheduled == 0
    assert report.summary.takenCount == 0
    assert report.summary.skippedCount == 0
    assert report.summary.missedCount == 0
    assert report.summary.adherencePercentage == 100.0
    assert report.summary.hasScheduledDoses is False


# ============================================================================
# Test L: Medicine Breakdown Totals Match Overall Report
# ============================================================================
@pytest.mark.asyncio
async def test_medicine_breakdown_totals_match_overall_report():
    """Verify that sum of medicine-level breakdown counts matches summary counts exactly."""
    p_id = ObjectId()
    m1_id = ObjectId()
    m2_id = ObjectId()
    s1_id = ObjectId()
    s2_id = ObjectId()

    user = make_test_patient(p_id)
    med1 = make_test_medicine(m1_id, p_id, "Metformin", "500", "mg")
    med2 = make_test_medicine(m2_id, p_id, "Lisinopril", "10", "mg")
    sched1 = make_test_schedule(s1_id, p_id, m1_id, "daily", "08:00")
    sched2 = make_test_schedule(s2_id, p_id, m2_id, "daily", "20:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 7)

    # Med 1: 5 taken, 2 missed
    # Med 2: 7 taken, 0 missed
    activities = []
    for day_offset in range(5):
        curr = (start_d + timedelta(days=day_offset)).isoformat()
        activities.append({
            "_id": ObjectId(), "userId": p_id, "scheduleId": s1_id,
            "scheduledDate": curr, "scheduledTime": "08:00",
            "action": "Taken", "actionTime": datetime.fromisoformat(f"{curr}T08:05:00+00:00"),
        })
    for day_offset in range(7):
        curr = (start_d + timedelta(days=day_offset)).isoformat()
        activities.append({
            "_id": ObjectId(), "userId": p_id, "scheduleId": s2_id,
            "scheduledDate": curr, "scheduledTime": "20:00",
            "action": "Taken", "actionTime": datetime.fromisoformat(f"{curr}T20:05:00+00:00"),
        })

    service = ReportService(
        medicines_coll=MockAsyncCollection([med1, med2]),
        schedules_coll=MockAsyncCollection([sched1, sched2]),
        activities_coll=MockAsyncCollection(activities),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, start_d, end_d,
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    assert len(report.medicines) == 2
    sum_total = sum(m.totalScheduled for m in report.medicines)
    sum_taken = sum(m.takenCount for m in report.medicines)
    sum_skipped = sum(m.skippedCount for m in report.medicines)
    sum_missed = sum(m.missedCount for m in report.medicines)

    assert sum_total == report.summary.totalScheduled == 14
    assert sum_taken == report.summary.takenCount == 12
    assert sum_skipped == report.summary.skippedCount == 0
    assert sum_missed == report.summary.missedCount == 2


# ============================================================================
# Test M: Daily Breakdown Totals Match Overall Report
# ============================================================================
@pytest.mark.asyncio
async def test_daily_breakdown_totals_match_overall_report():
    """Verify that sum of daily breakdown totals matches overall summary totals."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id)

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 7)

    activities = [
        {
            "_id": ObjectId(), "userId": p_id, "scheduleId": s_id,
            "scheduledDate": "2026-08-01", "scheduledTime": "08:00",
            "action": "Taken", "actionTime": datetime(2026, 8, 1, 8, 5, tzinfo=timezone.utc),
        },
        {
            "_id": ObjectId(), "userId": p_id, "scheduleId": s_id,
            "scheduledDate": "2026-08-02", "scheduledTime": "08:00",
            "action": "Skipped", "skipReason": "Illness",
            "actionTime": datetime(2026, 8, 2, 8, 5, tzinfo=timezone.utc),
        },
    ]

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
        users_coll=MockAsyncCollection([user]),
    )

    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, start_d, end_d,
        reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc)
    )

    sum_total = sum(d.totalScheduled for d in report.dailySummaries)
    sum_taken = sum(d.takenCount for d in report.dailySummaries)
    sum_skipped = sum(d.skippedCount for d in report.dailySummaries)
    sum_missed = sum(d.missedCount for d in report.dailySummaries)

    assert sum_total == report.summary.totalScheduled == 7
    assert sum_taken == report.summary.takenCount == 1
    assert sum_skipped == report.summary.skippedCount == 1
    assert sum_missed == report.summary.missedCount == 5


# ============================================================================
# Test N: Historical Streak Uses Report endDate, NOT Today's Date
# ============================================================================
@pytest.mark.asyncio
async def test_historical_streak_evaluated_at_end_date():
    """Verify historical streak is evaluated as of report endDate."""
    p_id = ObjectId()
    m_id = ObjectId()
    s_id = ObjectId()

    user = make_test_patient(p_id)
    med = make_test_medicine(m_id, p_id)
    sched = make_test_schedule(s_id, p_id, m_id)

    # 3 days adherent up to 2026-07-03
    activities = [
        {"_id": ObjectId(), "userId": p_id, "scheduleId": s_id, "scheduledDate": "2026-07-01", "scheduledTime": "08:00", "action": "Taken", "actionTime": datetime(2026, 7, 1, 8, 0, tzinfo=timezone.utc)},
        {"_id": ObjectId(), "userId": p_id, "scheduleId": s_id, "scheduledDate": "2026-07-02", "scheduledTime": "08:00", "action": "Taken", "actionTime": datetime(2026, 7, 2, 8, 0, tzinfo=timezone.utc)},
        {"_id": ObjectId(), "userId": p_id, "scheduleId": s_id, "scheduledDate": "2026-07-03", "scheduledTime": "08:00", "action": "Taken", "actionTime": datetime(2026, 7, 3, 8, 0, tzinfo=timezone.utc)},
    ]

    service = ReportService(
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
        users_coll=MockAsyncCollection([user]),
    )

    # Report ending on 2026-07-07
    report = await service.calculate_report(
        p_id, ReportPeriod.WEEKLY, date(2026, 7, 1), date(2026, 7, 7),
        reference_time=datetime(2026, 7, 8, 0, 0, tzinfo=timezone.utc)
    )

    # The streak evaluation evaluatedDate must match endDate
    assert report.streak.evaluatedDate == "2026-07-07"
    assert report.streak.totalAdherentDays == 3


# ============================================================================
# Test O: PDF Generation Succeeds
# ============================================================================
def test_pdf_generation_succeeds():
    """Verify PDF rendering produces valid PDF bytes."""
    report = MedicationReportResponse(
        reportType=ReportPeriod.WEEKLY,
        startDate="2026-08-01",
        endDate="2026-08-07",
        generatedAt=datetime(2026, 8, 8, 12, 0, 0, tzinfo=timezone.utc),
        patientId=str(ObjectId()),
        patientName="Sarah Connor",
        patientEmail="sarah@example.com",
        summary=ReportSummary(
            totalScheduled=14, takenCount=14, skippedCount=0, missedCount=0,
            unresolvedSnoozedCount=0, pendingCount=0, adherencePercentage=100.0,
            hasScheduledDoses=True,
        ),
        streak=ReportStreakSummary(
            currentStreak=7, longestStreak=7, totalAdherentDays=7,
            totalTrackedDays=7, lastAdherentDate="2026-08-07",
            evaluatedDate="2026-08-07",
        ),
        medicines=[
            ReportMedicineBreakdown(
                medicineId=str(ObjectId()), medicineName="Metformin",
                dosage="500", dosageUnit="mg", totalScheduled=14, takenCount=14,
                skippedCount=0, missedCount=0, unresolvedSnoozedCount=0, pendingCount=0,
                adherencePercentage=100.0, hasScheduledDoses=True,
            )
        ],
        dailySummaries=[
            ReportDailySummary(
                date="2026-08-01", totalScheduled=2, takenCount=2, skippedCount=0,
                missedCount=0, unresolvedSnoozedCount=0, pendingCount=0,
                adherencePercentage=100.0, hasScheduledDoses=True,
            )
        ],
    )

    pdf_bytes = generate_adherence_report_pdf(report)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 2000
    assert pdf_bytes.startswith(b"%PDF")


# ============================================================================
# Test P: PDF Contains Expected Report Sections and Metadata
# ============================================================================
def test_pdf_contains_expected_sections_and_metadata():
    """Verify PDF contains branding, patient metadata, metrics, and disclaimers."""
    report = MedicationReportResponse(
        reportType=ReportPeriod.WEEKLY,
        startDate="2026-08-01",
        endDate="2026-08-07",
        generatedAt=datetime(2026, 8, 8, 12, 0, 0, tzinfo=timezone.utc),
        patientId=str(ObjectId()),
        patientName="Thomas Anderson",
        patientEmail="neo@example.com",
        summary=ReportSummary(
            totalScheduled=7, takenCount=6, skippedCount=1, missedCount=0,
            unresolvedSnoozedCount=0, pendingCount=0, adherencePercentage=85.7,
            hasScheduledDoses=True,
        ),
        streak=ReportStreakSummary(
            currentStreak=6, longestStreak=10, totalAdherentDays=15,
            totalTrackedDays=17, lastAdherentDate="2026-08-07",
            evaluatedDate="2026-08-07",
        ),
        medicines=[
            ReportMedicineBreakdown(
                medicineId=str(ObjectId()), medicineName="Red Pill",
                dosage="1", dosageUnit="capsule", totalScheduled=7, takenCount=6,
                skippedCount=1, missedCount=0, unresolvedSnoozedCount=0, pendingCount=0,
                adherencePercentage=85.7, hasScheduledDoses=True,
            )
        ],
        dailySummaries=[
            ReportDailySummary(
                date="2026-08-01", totalScheduled=1, takenCount=1, skippedCount=0,
                missedCount=0, unresolvedSnoozedCount=0, pendingCount=0,
                adherencePercentage=100.0, hasScheduledDoses=True,
            )
        ],
    )

    pdf_bytes = generate_adherence_report_pdf(report)
    decompressed = decode_pdf_text_streams(pdf_bytes)

    assert b"MediTrack+" in decompressed
    assert b"Thomas Anderson" in decompressed
    assert b"neo@example.com" in decompressed
    assert b"Red Pill" in decompressed
    assert b"Confidential" in decompressed
    assert b"IMPORTANT MEDICAL DISCLAIMER" in decompressed


# ============================================================================
# Test Q: PDF Does Not Contain Secrets/Passwords/JWTs/SMTP Credentials
# ============================================================================
def test_pdf_does_not_contain_secrets_or_credentials():
    """Verify generated PDF contains no password hashes, JWT secrets, or SMTP credentials."""
    report = MedicationReportResponse(
        reportType=ReportPeriod.MONTHLY,
        startDate="2026-08-01",
        endDate="2026-08-30",
        generatedAt=datetime(2026, 8, 31, 12, 0, 0, tzinfo=timezone.utc),
        patientId=str(ObjectId()),
        patientName="Safe User",
        patientEmail="safe@example.com",
        summary=ReportSummary(
            totalScheduled=30, takenCount=30, skippedCount=0, missedCount=0,
            unresolvedSnoozedCount=0, pendingCount=0, adherencePercentage=100.0,
            hasScheduledDoses=True,
        ),
        streak=ReportStreakSummary(
            currentStreak=30, longestStreak=30, totalAdherentDays=30,
            totalTrackedDays=30, lastAdherentDate="2026-08-30",
            evaluatedDate="2026-08-30",
        ),
        medicines=[],
        dailySummaries=[],
    )

    pdf_bytes = generate_adherence_report_pdf(report)
    decompressed = decode_pdf_text_streams(pdf_bytes)

    assert b"password" not in decompressed.lower()
    assert b"secret" not in decompressed.lower()
    assert b"smtp" not in decompressed.lower()
    assert b"bearer" not in decompressed.lower()
    assert b"eyj" not in decompressed.lower()  # standard JWT prefix


# ============================================================================
# Test R: Invalid Date Ranges Are Rejected
# ============================================================================
def test_invalid_date_ranges_are_rejected():
    """Verify validation rejects invalid spans, inverted ranges, and future periods."""
    today = date(2026, 9, 12)

    # Inverted: start > end
    with pytest.raises(ReportValidationError) as exc_inverted:
        validate_report_period("weekly", date(2026, 9, 10), date(2026, 9, 5), today)
    assert "startDate must be before or equal to endDate" in str(exc_inverted.value)

    # Weekly not 7 days (e.g. 5 days)
    with pytest.raises(ReportValidationError) as exc_weekly:
        validate_report_period("weekly", date(2026, 9, 1), date(2026, 9, 5), today)
    assert "Weekly report must span exactly 7 consecutive days" in str(exc_weekly.value)

    # Monthly not 28-31 days (e.g. 15 days)
    with pytest.raises(ReportValidationError) as exc_monthly:
        validate_report_period("monthly", date(2026, 9, 1), date(2026, 9, 15), today)
    assert "Monthly report must span between 28 and 31 days" in str(exc_monthly.value)

    # Future start date
    with pytest.raises(ReportValidationError) as exc_future:
        validate_report_period("weekly", date(2026, 9, 20), date(2026, 9, 26), today)
    assert "cannot be in the future" in str(exc_future.value)


@pytest.mark.asyncio
async def test_patient_not_found_raises_domain_exception():
    """Verify non-existent patient raises domain PatientNotFoundError."""
    service = ReportService(
        medicines_coll=MockAsyncCollection([]),
        schedules_coll=MockAsyncCollection([]),
        activities_coll=MockAsyncCollection([]),
        users_coll=MockAsyncCollection([]),
    )
    with pytest.raises(PatientNotFoundError) as exc_patient:
        await service.calculate_report(
            ObjectId(), ReportPeriod.WEEKLY, date(2026, 8, 1), date(2026, 8, 7)
        )
    assert "Patient record not found" in str(exc_patient.value)


# ============================================================================
# Test S: Existing Phase 1-10 Behavior Remains Unchanged (Live Integration)
# ============================================================================
@pytest.mark.asyncio
async def test_live_collections_integration():
    """Verify ReportService operates against live MongoDB collections alongside Phase 1-10 features."""
    users_coll = get_users_collection()
    meds_coll = get_medicines_collection()
    scheds_coll = get_schedules_collection()
    acts_coll = get_activities_collection()

    patient_email = f"report_live_{uuid.uuid4().hex[:8]}@example.com"
    patient_doc = create_user_document(
        email=patient_email,
        full_name="Live Patient Test",
        password_hash="fakehashlive123",
        role="patient",
    )
    res_user = await users_coll.insert_one(patient_doc)
    patient_id = res_user.inserted_id

    med_doc = {
        "_id": ObjectId(),
        "userId": patient_id,
        "name": "Live Amoxicillin",
        "dosage": "250",
        "dosageUnit": "mg",
        "frequency": "daily",
        "createdAt": now_utc(),
    }
    await meds_coll.insert_one(med_doc)

    sched_doc = {
        "_id": ObjectId(),
        "userId": patient_id,
        "medicineId": med_doc["_id"],
        "frequencyType": "daily",
        "time": "08:00",
        "daysOfWeek": [],
        "dates": [],
        "enabled": True,
        "createdAt": now_utc(),
    }
    await scheds_coll.insert_one(sched_doc)

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 7)

    # Record 1 live Taken activity
    await acts_coll.insert_one({
        "_id": ObjectId(),
        "userId": patient_id,
        "scheduleId": sched_doc["_id"],
        "scheduledDate": "2026-08-01",
        "scheduledTime": "08:00",
        "action": "Taken",
        "actionTime": datetime(2026, 8, 1, 8, 10, tzinfo=timezone.utc),
        "createdAt": now_utc(),
    })

    try:
        report = await calculate_medication_report(
            patient_id=patient_id,
            period=ReportPeriod.WEEKLY,
            start_date=start_d,
            end_date=end_d,
            reference_time=datetime(2026, 8, 8, 0, 0, tzinfo=timezone.utc),
        )

        assert report.patientName == "Live Patient Test"
        assert report.patientEmail == patient_email
        assert report.summary.totalScheduled == 7
        assert report.summary.takenCount == 1
        assert report.summary.missedCount == 6
        assert len(report.medicines) == 1
        assert report.medicines[0].medicineName == "Live Amoxicillin"

        # Generate PDF for this live report
        pdf_bytes = generate_adherence_report_pdf(report)
        assert len(pdf_bytes) > 2000
        assert pdf_bytes.startswith(b"%PDF")
    finally:
        # Cleanup test data
        await users_coll.delete_one({"_id": patient_id})
        await meds_coll.delete_one({"_id": med_doc["_id"]})
        await scheds_coll.delete_one({"_id": sched_doc["_id"]})
        await acts_coll.delete_many({"userId": patient_id})
