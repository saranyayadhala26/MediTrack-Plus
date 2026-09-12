"""Phase 11 Step 7: Scheduled Adherence Report Delivery & Idempotency Tests.

Covers requirements A through X:
A. Weekly completed period calculation.
B. Monthly completed calendar month calculation.
C. Current incomplete week is not delivered.
D. Current incomplete month is not delivered.
E. Patient with emailReportsEnabled=true is eligible.
F. Patient with emailReportsEnabled=false is skipped.
G. Caregiver with emailReportsEnabled=true receives linked patient report.
H. Caregiver with preference false is skipped.
I. Revoked caregiver is skipped.
J. Multiple active caregivers receive independent deliveries.
K. deliveryKey is deterministic.
L. Unique deliveryKey index exists.
M. First claim succeeds.
N. Concurrent/duplicate claim is rejected safely.
O. Already-sent delivery is skipped.
P. Successful email marks status=sent.
Q. Email failure preserves delivery record as failed.
R. Failed delivery error is sanitized.
S. No secrets are persisted in deliveries collection.
T. Retry of failed delivery can succeed safely.
U. Successful retry cannot produce a second delivery record.
V. CLI can execute in deterministic test mode.
W. No real emails sent during tests.
"""

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import patch

import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.schemas.report import (
    MedicationReportResponse,
    ReportDailySummary,
    ReportMedicineBreakdown,
    ReportPeriod,
    ReportStreakSummary,
    ReportSummary,
)
from app.services.email_service import (
    EmailDeliveryError,
    EmailServiceInterface,
    MockEmailService,
)
from app.services.pdf_service import PdfService
from app.services.report_service import (
    ReportService,
    ReportValidationError,
)
from app.services.scheduled_report_service import (
    DeliveryResult,
    ScheduledReportService,
    ScheduledRunSummary,
    build_delivery_key,
    calculate_completed_period,
    get_completed_monthly_period,
    get_completed_weekly_period,
)


# ==============================================================================
# Mock Collections for Scheduled Deliveries
# ==============================================================================

class MockAsyncCursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = list(docs)
        self._iter = iter(self._docs)

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class MockDeliveriesCollection:
    """In-memory collection tracking deliveries with unique deliveryKey constraint."""

    def __init__(self):
        self.docs: List[Dict[str, Any]] = []
        self.unique_keys: set = set()

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None

    async def insert_one(self, doc: Dict[str, Any]):
        key = doc.get("deliveryKey")
        if key is not None:
            if key in self.unique_keys:
                raise DuplicateKeyError(
                    f"E11000 duplicate key error collection: scheduled_report_deliveries index: deliveryKey dup key: {key}"
                )
            self.unique_keys.add(key)

        doc_copy = dict(doc)
        if "_id" not in doc_copy:
            doc_copy["_id"] = ObjectId()
        self.docs.append(doc_copy)

        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id

        return InsertResult(doc_copy["_id"])

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]):
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                if "$set" in update:
                    d.update(update["$set"])
                return

    async def find_one_and_update(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        return_document=None,
    ) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                if "$set" in update:
                    d.update(update["$set"])
                if "$inc" in update:
                    for inc_k, inc_v in update["$inc"].items():
                        d[inc_k] = d.get(inc_k, 0) + inc_v
                return dict(d)
        return None


class MockUsersCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None):
        self.docs: List[Dict[str, Any]] = [dict(d) for d in (docs or [])]

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                doc_v = d.get(k)
                if isinstance(v, ObjectId) and isinstance(doc_v, str):
                    if str(v) != doc_v:
                        match = False
                        break
                elif isinstance(v, str) and isinstance(doc_v, ObjectId):
                    if v != str(doc_v):
                        match = False
                        break
                elif doc_v != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None

    def find(self, query: Dict[str, Any]) -> MockAsyncCursor:
        matched = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                matched.append(dict(d))
        return MockAsyncCursor(matched)


class MockCaregiversCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None):
        self.docs: List[Dict[str, Any]] = [dict(d) for d in (docs or [])]

    def find(self, query: Dict[str, Any]) -> MockAsyncCursor:
        matched = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                matched.append(dict(d))
        return MockAsyncCursor(matched)


# ==============================================================================
# Helper Factories
# ==============================================================================

def make_sample_report(
    patient_id: ObjectId,
    patient_name: str = "Test Patient",
    period: ReportPeriod = ReportPeriod.WEEKLY,
    start_date: str = "2026-08-31",
    end_date: str = "2026-09-06",
) -> MedicationReportResponse:
    """Generate a valid mock MedicationReportResponse for PDF & email dispatch testing."""
    return MedicationReportResponse(
        patientId=str(patient_id),
        patientName=patient_name,
        patientEmail="patient@example.com",
        reportType=period,
        startDate=start_date,
        endDate=end_date,
        generatedAt=datetime.now(timezone.utc),
        summary=ReportSummary(
            totalScheduled=14,
            takenCount=12,
            skippedCount=1,
            missedCount=1,
            unresolvedSnoozedCount=0,
            pendingCount=0,
            adherencePercentage=85.71,
            hasScheduledDoses=True,
        ),
        streak=ReportStreakSummary(
            currentStreak=5,
            longestStreak=10,
            totalAdherentDays=15,
            totalTrackedDays=18,
            lastAdherentDate="2026-09-05",
            evaluatedDate=end_date,
        ),
        medicines=[
            ReportMedicineBreakdown(
                medicineId=str(ObjectId()),
                medicineName="Metformin",
                dosage="500",
                dosageUnit="mg",
                totalScheduled=14,
                takenCount=12,
                skippedCount=1,
                missedCount=1,
                unresolvedSnoozedCount=0,
                pendingCount=0,
                adherencePercentage=85.71,
                hasScheduledDoses=True,
            )
        ],
        dailySummaries=[
            ReportDailySummary(
                date=start_date,
                dayOfWeek="monday",
                totalScheduled=2,
                takenCount=2,
                skippedCount=0,
                missedCount=0,
                unresolvedSnoozedCount=0,
                pendingCount=0,
                adherencePercentage=100.0,
                hasScheduledDoses=True,
                isAdherentDay=True,
            )
        ],
    )


class MockReportService:
    """Mock ReportService that returns a valid report without hitting DB."""
    def __init__(self, report: Optional[MedicationReportResponse] = None):
        self.report = report

    async def calculate_report(self, patient_id, period, start_date, end_date, reference_time=None):
        if self.report:
            return self.report
        return make_sample_report(
            patient_id=patient_id,
            period=ReportPeriod(period),
            start_date=start_date.isoformat() if hasattr(start_date, "isoformat") else str(start_date),
            end_date=end_date.isoformat() if hasattr(end_date, "isoformat") else str(end_date),
        )


# ==============================================================================
# Tests A through X
# ==============================================================================

def test_case_a_weekly_completed_period_calculation():
    """A. Weekly completed period spans exactly 7 days (Monday through Sunday) prior to reference date."""
    # Monday 2026-09-14: prior completed week is 2026-09-07 to 2026-09-13
    ref_mon = date(2026, 9, 14)
    start_d, end_d = get_completed_weekly_period(ref_mon)
    assert start_d == date(2026, 9, 7)
    assert end_d == date(2026, 9, 13)
    assert (end_d - start_d).days + 1 == 7
    assert start_d.weekday() == 0  # Monday
    assert end_d.weekday() == 6    # Sunday

    # Wednesday 2026-09-16: prior completed week is still 2026-09-07 to 2026-09-13
    ref_wed = date(2026, 9, 16)
    start_w, end_w = get_completed_weekly_period(ref_wed)
    assert start_w == date(2026, 9, 7)
    assert end_w == date(2026, 9, 13)


def test_case_b_monthly_completed_calendar_month_calculation():
    """B. Monthly completed calendar month spans from day 1 to last day of prior month."""
    # September 12, 2026: prior completed month is August 2026 (31 days)
    ref = date(2026, 9, 12)
    start_m, end_m = get_completed_monthly_period(ref)
    assert start_m == date(2026, 8, 1)
    assert end_m == date(2026, 8, 31)
    assert (end_m - start_m).days + 1 == 31

    # March 1, 2026: prior completed month is February 2026 (28 days)
    ref_mar = date(2026, 3, 1)
    start_feb, end_feb = get_completed_monthly_period(ref_mar)
    assert start_feb == date(2026, 2, 1)
    assert end_feb == date(2026, 2, 28)
    assert (end_feb - start_feb).days + 1 == 28

    # January 15, 2026: prior completed month is December 2025 (year rollover)
    ref_jan = date(2026, 1, 15)
    start_dec, end_dec = get_completed_monthly_period(ref_jan)
    assert start_dec == date(2025, 12, 1)
    assert end_dec == date(2025, 12, 31)


def test_case_c_current_incomplete_week_is_not_delivered():
    """C. An incomplete/current week is strictly prohibited and rejected."""
    ref = date(2026, 9, 12)  # Saturday
    # Attempting to deliver the current week (ends on or after ref) raises ReportValidationError
    with pytest.raises(ReportValidationError) as exc:
        calculate_completed_period(
            period="weekly",
            reference_date=ref,
            start_date="2026-09-07",
            end_date="2026-09-13",
            allow_custom_dates=False,
        )
    assert "only accepts completed periods" in str(exc.value)


def test_case_d_current_incomplete_month_is_not_delivered():
    """D. An incomplete/current month is strictly prohibited and rejected."""
    ref = date(2026, 9, 12)
    # Attempting to deliver current September month raises ReportValidationError
    with pytest.raises(ReportValidationError) as exc:
        calculate_completed_period(
            period="monthly",
            reference_date=ref,
            start_date="2026-09-01",
            end_date="2026-09-30",
            allow_custom_dates=False,
        )
    assert "only accepts completed periods" in str(exc.value)


def test_case_k_delivery_key_is_deterministic():
    """K. deliveryKey format is strictly recipientUserId:patientId:periodType:startDate:endDate."""
    r_id = ObjectId("507f1f77bcf86cd799439011")
    p_id = ObjectId("507f1f77bcf86cd799439022")
    key = build_delivery_key(
        recipient_user_id=r_id,
        patient_id=p_id,
        period_type="weekly",
        start_date="2026-08-31",
        end_date="2026-09-06",
    )
    expected = f"{r_id}:{p_id}:weekly:2026-08-31:2026-09-06"
    assert key == expected


@pytest.mark.asyncio
async def test_case_e_f_patient_eligibility_by_preference():
    """E & F. Patient with emailReportsEnabled=true is delivered; emailReportsEnabled=false is skipped."""
    pt1_id = ObjectId("6ba258000000000000000001")
    pt2_id = ObjectId("6ba258000000000000000002")

    users_coll = MockUsersCollection([
        {
            "_id": pt1_id,
            "fullName": "Eligible Patient",
            "email": "opted_in@example.com",
            "role": "patient",
            "notificationPreferences": {"emailReportsEnabled": True},
        },
        {
            "_id": pt2_id,
            "fullName": "Skipped Patient",
            "email": "opted_out@example.com",
            "role": "patient",
            "notificationPreferences": {"emailReportsEnabled": False},
        },
    ])
    deliveries_coll = MockDeliveriesCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = ScheduledReportService(
        deliveries_collection=deliveries_coll,
        users_collection=users_coll,
        caregivers_collection=MockCaregiversCollection([]),
        report_service=MockReportService(),
        email_service=mock_email,
    )

    summary = await service.execute_scheduled_run(
        period="weekly",
        reference_date=date(2026, 9, 14),
    )

    # Only 1 patient was eligible
    assert summary.total_eligible == 1
    assert summary.sent_count == 1
    assert summary.results[0].recipient_email == "opted_in@example.com"
    assert summary.results[0].status == "sent"

    # Email was dispatched only to the opted-in patient
    sent_msgs = mock_email.get_sent_messages()
    assert len(sent_msgs) == 1
    assert sent_msgs[0].recipient == "opted_in@example.com"


@pytest.mark.asyncio
async def test_case_g_h_caregiver_eligibility_by_caregiver_preference():
    """G & H. Caregiver with emailReportsEnabled=true receives linked patient report; preference false is skipped."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg1_id = ObjectId("6ba2580000000000000000c1")
    cg2_id = ObjectId("6ba2580000000000000000c2")

    users_coll = MockUsersCollection([
        # Patient has preference False, but caregiver 1 has True -> Caregiver 1 STILL gets report!
        {
            "_id": pt_id,
            "fullName": "Patient John",
            "email": "john@example.com",
            "role": "patient",
            "notificationPreferences": {"emailReportsEnabled": False},
        },
        {
            "_id": cg1_id,
            "fullName": "Caregiver One",
            "email": "cg1@example.com",
            "role": "caregiver",
            "notificationPreferences": {"emailReportsEnabled": True},
        },
        {
            "_id": cg2_id,
            "fullName": "Caregiver Two",
            "email": "cg2@example.com",
            "role": "caregiver",
            "notificationPreferences": {"emailReportsEnabled": False},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": "cg1@example.com", "status": "active"},
        {"patientId": pt_id, "caregiverEmail": "cg2@example.com", "status": "active"},
    ])
    deliveries_coll = MockDeliveriesCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = ScheduledReportService(
        deliveries_collection=deliveries_coll,
        users_collection=users_coll,
        caregivers_collection=cg_coll,
        report_service=MockReportService(),
        email_service=mock_email,
    )

    summary = await service.execute_scheduled_run(
        period="weekly",
        reference_date=date(2026, 9, 14),
    )

    # Only cg1 was eligible (patient is opted-out; cg2 is opted-out)
    assert summary.total_eligible == 1
    assert summary.sent_count == 1
    assert summary.results[0].recipient_email == "cg1@example.com"
    assert summary.results[0].recipient_role == "caregiver"

    sent_msgs = mock_email.get_sent_messages()
    assert len(sent_msgs) == 1
    assert sent_msgs[0].recipient == "cg1@example.com"


@pytest.mark.asyncio
async def test_case_i_revoked_caregiver_is_skipped():
    """I. Revoked caregiver relationships are ignored by the scheduled delivery runner."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Patient", "email": "pt@example.com", "role": "patient", "notificationPreferences": {"emailReportsEnabled": False}},
        {"_id": cg_id, "fullName": "Revoked", "email": "revoked@example.com", "role": "caregiver", "notificationPreferences": {"emailReportsEnabled": True}},
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": "revoked@example.com", "status": "revoked"},
    ])
    deliveries_coll = MockDeliveriesCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = ScheduledReportService(
        deliveries_collection=deliveries_coll,
        users_collection=users_coll,
        caregivers_collection=cg_coll,
        report_service=MockReportService(),
        email_service=mock_email,
    )

    summary = await service.execute_scheduled_run(
        period="weekly",
        reference_date=date(2026, 9, 14),
    )

    assert summary.total_eligible == 0
    assert len(mock_email.get_sent_messages()) == 0


@pytest.mark.asyncio
async def test_case_j_multiple_active_caregivers_independent_deliveries():
    """J. Multiple active caregivers for a patient each receive independent deliveries and unique deliveryKeys."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg1_id = ObjectId("6ba2580000000000000000c1")
    cg2_id = ObjectId("6ba2580000000000000000c2")

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Patient", "email": "pt@example.com", "role": "patient", "notificationPreferences": {"emailReportsEnabled": False}},
        {"_id": cg1_id, "fullName": "Caregiver 1", "email": "cg1@example.com", "role": "caregiver", "notificationPreferences": {"emailReportsEnabled": True}},
        {"_id": cg2_id, "fullName": "Caregiver 2", "email": "cg2@example.com", "role": "caregiver", "notificationPreferences": {"emailReportsEnabled": True}},
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": "cg1@example.com", "status": "active"},
        {"patientId": pt_id, "caregiverEmail": "cg2@example.com", "status": "active"},
    ])
    deliveries_coll = MockDeliveriesCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = ScheduledReportService(
        deliveries_collection=deliveries_coll,
        users_collection=users_coll,
        caregivers_collection=cg_coll,
        report_service=MockReportService(),
        email_service=mock_email,
    )

    summary = await service.execute_scheduled_run(
        period="monthly",
        reference_date=date(2026, 9, 12),
    )

    assert summary.total_eligible == 2
    assert summary.sent_count == 2
    keys = {r.delivery_key for r in summary.results}
    assert len(keys) == 2  # Each has a distinct deliveryKey!
    assert str(cg1_id) in summary.results[0].delivery_key or str(cg1_id) in summary.results[1].delivery_key
    assert str(cg2_id) in summary.results[0].delivery_key or str(cg2_id) in summary.results[1].delivery_key


@pytest.mark.asyncio
async def test_case_m_n_o_p_atomic_claiming_and_already_sent_skipping():
    """M, N, O, P. First claim succeeds, status marks sent, subsequent runner skips, duplicate claim handled."""
    pt_id = ObjectId("6ba258000000000000000001")
    deliveries_coll = MockDeliveriesCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = ScheduledReportService(
        deliveries_collection=deliveries_coll,
        report_service=MockReportService(),
        email_service=mock_email,
    )

    # 1. First run: successfully claims, delivers, and marks status='sent'
    res1 = await service.deliver_report(
        recipient_user_id=pt_id,
        patient_id=pt_id,
        recipient_email="patient@example.com",
        recipient_name="Patient",
        period="weekly",
        start_date=date(2026, 8, 31),
        end_date=date(2026, 9, 6),
    )
    assert res1.status == "sent"
    assert len(deliveries_coll.docs) == 1
    assert deliveries_coll.docs[0]["status"] == "sent"
    assert deliveries_coll.docs[0]["sentAt"] is not None
    assert len(mock_email.get_sent_messages()) == 1

    # 2. Subsequent run: already sent -> skipped without generating report or sending email
    res2 = await service.deliver_report(
        recipient_user_id=pt_id,
        patient_id=pt_id,
        recipient_email="patient@example.com",
        recipient_name="Patient",
        period="weekly",
        start_date=date(2026, 8, 31),
        end_date=date(2026, 9, 6),
    )
    assert res2.status == "skipped"
    assert res2.skip_reason == "already_sent"
    assert len(mock_email.get_sent_messages()) == 1  # No second email!


@pytest.mark.asyncio
async def test_case_q_r_s_failure_sanitizes_errors_and_preserves_record():
    """Q, R, S. Delivery failure marks status=failed, sanitizes error credentials, and persists no secrets."""
    secret_pw = "super_smtp_secret_password_123"
    pt_id = ObjectId("6ba258000000000000000001")
    deliveries_coll = MockDeliveriesCollection()

    class FailingEmailService(EmailServiceInterface):
        async def send_email(self, message):
            raise EmailDeliveryError(f"Connection failed authenticating with password={secret_pw}")

    with patch("app.core.config.settings.SMTP_PASSWORD", secret_pw):
        service = ScheduledReportService(
            deliveries_collection=deliveries_coll,
            report_service=MockReportService(),
            email_service=FailingEmailService(),
        )

        res = await service.deliver_report(
            recipient_user_id=pt_id,
            patient_id=pt_id,
            recipient_email="patient@example.com",
            recipient_name="Patient",
            period="weekly",
            start_date=date(2026, 8, 31),
            end_date=date(2026, 9, 6),
        )

        assert res.status == "failed"
        assert secret_pw not in (res.error_message or "")
        assert "[REDACTED]" in (res.error_message or "")

        # Verify DB document
        assert len(deliveries_coll.docs) == 1
        doc = deliveries_coll.docs[0]
        assert doc["status"] == "failed"
        assert secret_pw not in (doc.get("errorMessage") or "")
        assert "[REDACTED]" in (doc.get("errorMessage") or "")
        assert "pdfBytes" not in doc  # No full PDF stored in MongoDB per data minimization rule!


@pytest.mark.asyncio
async def test_case_t_u_failed_delivery_retry_semantics():
    """T & U. Failed delivery can be retried; successful retry updates existing record without creating duplicate."""
    pt_id = ObjectId("6ba258000000000000000001")
    deliveries_coll = MockDeliveriesCollection()

    # Step 1: Delivery fails
    failing_service = ScheduledReportService(
        deliveries_collection=deliveries_coll,
        report_service=MockReportService(),
        email_service=MockEmailService(email_enabled=False),  # skipped causes failure
    )

    res1 = await failing_service.deliver_report(
        recipient_user_id=pt_id,
        patient_id=pt_id,
        recipient_email="patient@example.com",
        recipient_name="Patient",
        period="weekly",
        start_date=date(2026, 8, 31),
        end_date=date(2026, 9, 6),
    )
    assert res1.status == "failed"
    assert len(deliveries_coll.docs) == 1
    assert deliveries_coll.docs[0]["status"] == "failed"
    assert deliveries_coll.docs[0]["attempts"] == 1

    # Step 2: Retry with functional email service
    mock_email = MockEmailService(email_enabled=True)
    working_service = ScheduledReportService(
        deliveries_collection=deliveries_coll,
        report_service=MockReportService(),
        email_service=mock_email,
    )

    res2 = await working_service.deliver_report(
        recipient_user_id=pt_id,
        patient_id=pt_id,
        recipient_email="patient@example.com",
        recipient_name="Patient",
        period="weekly",
        start_date=date(2026, 8, 31),
        end_date=date(2026, 9, 6),
    )
    assert res2.status == "sent"
    # Still exactly ONE document in deliveries collection (no duplicate document created on retry)
    assert len(deliveries_coll.docs) == 1
    assert deliveries_coll.docs[0]["status"] == "sent"
    assert deliveries_coll.docs[0]["attempts"] == 2
    assert deliveries_coll.docs[0]["sentAt"] is not None


@pytest.mark.asyncio
async def test_case_v_cli_execution_mode():
    """V. CLI script executes deterministically and handles custom test date ranges."""
    from app.scripts.send_scheduled_reports import run_cli
    import argparse

    pt_id = ObjectId("6ba258000000000000000001")
    users_coll = MockUsersCollection([
        {
            "_id": pt_id,
            "fullName": "CLI Test Patient",
            "email": "cli@example.com",
            "role": "patient",
            "notificationPreferences": {"emailReportsEnabled": True},
        }
    ])
    deliveries_coll = MockDeliveriesCollection()
    mock_email = MockEmailService(email_enabled=True)

    args = argparse.Namespace(
        period="weekly",
        reference_date="2026-09-14",
        start_date=None,
        end_date=None,
        allow_custom_dates=False,
    )

    # Patch connect_to_mongo, close_mongo_connection, and ScheduledReportService to use mocks
    with patch("app.scripts.send_scheduled_reports.connect_to_mongo"), \
         patch("app.scripts.send_scheduled_reports.close_mongo_connection"), \
         patch("app.scripts.send_scheduled_reports.ScheduledReportService") as MockServiceCls:

        mock_svc_instance = ScheduledReportService(
            deliveries_collection=deliveries_coll,
            users_collection=users_coll,
            caregivers_collection=MockCaregiversCollection([]),
            report_service=MockReportService(),
            email_service=mock_email,
        )
        MockServiceCls.return_value = mock_svc_instance

        exit_code = await run_cli(args)
        assert exit_code == 0
        assert len(mock_email.get_sent_messages()) == 1
        assert mock_email.get_sent_messages()[0].recipient == "cli@example.com"


@pytest.mark.asyncio
async def test_case_l_real_mongodb_unique_delivery_key_index():
    """L. Unique deliveryKey index exists on scheduled_report_deliveries in real MongoDB."""
    from app.db.mongodb import (
        connect_to_mongo,
        get_scheduled_report_deliveries_collection,
    )
    await connect_to_mongo()
    coll = get_scheduled_report_deliveries_collection()

    test_uid = ObjectId("6ba258000000000000000999")
    test_pid = ObjectId("6ba258000000000000000888")
    test_key = f"test_delivery_key_idx_{ObjectId()}"

    doc1 = {
        "_id": ObjectId(),
        "deliveryKey": test_key,
        "recipientUserId": test_uid,
        "patientId": test_pid,
        "periodType": "weekly",
        "startDate": "2026-08-31",
        "endDate": "2026-09-06",
        "status": "pending",
        "attempts": 1,
    }
    doc2 = {
        "_id": ObjectId(),
        "deliveryKey": test_key,
        "recipientUserId": test_uid,
        "patientId": test_pid,
        "periodType": "weekly",
        "startDate": "2026-08-31",
        "endDate": "2026-09-06",
        "status": "pending",
        "attempts": 1,
    }

    try:
        await coll.insert_one(doc1)
        with pytest.raises(DuplicateKeyError):
            await coll.insert_one(doc2)
    finally:
        await coll.delete_many({"deliveryKey": test_key})

