"""Unit and integration tests for Phase 11 Step 5: Email Service + Email Templates.

Covers:
A. Mock email sends successfully.
B. Mock email records recipient/subject/body.
C. PDF attachment is preserved correctly.
D. SMTP message construction contains correct From/To/Subject.
E. TLS configuration is respected.
F. EMAIL_ENABLED=false prevents actual sending.
G. Missing SMTP configuration fails safely when SMTP is enabled.
H. SMTP failure produces a controlled service-level error.
I. SMTP password never appears in exception/message/log payload exposed to callers.
J. Caregiver missed-dose template contains required safe fields.
K. Caregiver template excludes secrets/tokens/passwords.
L. Adherence report template contains report metrics.
M. Adherence report template does not recalculate metrics.
N. PDF attachment uses generated PDF bytes.
O. Weekly report filename is correct (MediTrack_Weekly_Report_YYYY-MM-DD.pdf).
P. Monthly report filename is correct (MediTrack_Monthly_Report_YYYY-MM.pdf).
Q. No database queries occur in email service.
R. Email service contains no FastAPI/HTTP dependencies.
S. Existing 300 tests remain green.
"""

from datetime import datetime, timezone
import email
from unittest.mock import MagicMock, patch
import pytest

from app.schemas.report import (
    MedicationReportResponse,
    ReportDailySummary,
    ReportMedicineBreakdown,
    ReportPeriod,
    ReportStreakSummary,
    ReportSummary,
)
from app.services.email_service import (
    EmailConfigurationError,
    EmailDeliveryError,
    EmailMessage,
    EmailResult,
    EmailServiceError,
    EmailServiceInterface,
    MockEmailService,
    SMTPEmailService,
    get_email_service,
)
from app.services.email_templates import (
    create_adherence_report_email,
    create_caregiver_missed_dose_email,
)


def make_dummy_report(
    period: ReportPeriod = ReportPeriod.WEEKLY,
    end_date: str = "2026-08-07",
) -> MedicationReportResponse:
    return MedicationReportResponse(
        reportType=period,
        startDate="2026-08-01",
        endDate=end_date,
        generatedAt=datetime(2026, 8, 8, 10, 0, tzinfo=timezone.utc),
        patientId="60c72b2f9b1d8b2bad000001",
        patientName="Arthur Dent",
        patientEmail="arthur@example.com",
        summary=ReportSummary(
            totalScheduled=14,
            takenCount=12,
            skippedCount=1,
            missedCount=1,
            unresolvedSnoozedCount=0,
            pendingCount=0,
            adherencePercentage=85.7,
            hasScheduledDoses=True,
        ),
        streak=ReportStreakSummary(
            currentStreak=5,
            longestStreak=8,
            totalAdherentDays=18,
            totalTrackedDays=21,
            lastAdherentDate="2026-08-07",
            evaluatedDate=end_date,
        ),
        medicines=[],
        dailySummaries=[],
    )


# ============================================================================
# Test A: Mock Email Sends Successfully
# ============================================================================
@pytest.mark.asyncio
async def test_mock_email_sends_successfully():
    """Verify MockEmailService returns a successful EmailResult with a mock message ID."""
    mock_svc = MockEmailService(email_enabled=True)
    msg = EmailMessage(
        recipient="test@example.com",
        subject="Hello Test",
        text_body="Test plain body",
    )
    result = await mock_svc.send_email(msg)

    assert result.success is True
    assert result.skipped is False
    assert result.recipient == "test@example.com"
    assert result.message_id is not None
    assert result.message_id.startswith("mock-")
    assert result.error is None


# ============================================================================
# Test B: Mock Email Records Recipient, Subject, and Body
# ============================================================================
@pytest.mark.asyncio
async def test_mock_email_records_payload():
    """Verify MockEmailService stores message details in memory for test assertions."""
    mock_svc = MockEmailService(email_enabled=True)
    msg = EmailMessage(
        recipient="caregiver@example.com",
        subject="Alert: Missed Dose",
        text_body="Detailed plain text alert",
        html_body="<p>HTML alert</p>",
    )
    await mock_svc.send_email(msg)

    recorded = mock_svc.get_sent_messages()
    assert len(recorded) == 1
    assert recorded[0].recipient == "caregiver@example.com"
    assert recorded[0].subject == "Alert: Missed Dose"
    assert recorded[0].text_body == "Detailed plain text alert"
    assert recorded[0].html_body == "<p>HTML alert</p>"

    # Test clear helper
    mock_svc.clear()
    assert len(mock_svc.get_sent_messages()) == 0


# ============================================================================
# Test C: PDF Attachment Is Preserved Correctly
# ============================================================================
@pytest.mark.asyncio
async def test_attachment_is_preserved_correctly():
    """Verify attachments retain their binary bytes, filename, and MIME type."""
    mock_svc = MockEmailService(email_enabled=True)
    pdf_bytes = b"%PDF-1.4 mock binary content here"
    msg = EmailMessage(
        recipient="patient@example.com",
        subject="Your Report",
        text_body="Please find your attached report.",
        attachment_bytes=pdf_bytes,
        attachment_filename="MediTrack_Weekly_Report_2026-08-07.pdf",
        attachment_mime_type="application/pdf",
    )
    await mock_svc.send_email(msg)

    last = mock_svc.get_last_message()
    assert last is not None
    assert last.attachment_bytes == pdf_bytes
    assert last.attachment_filename == "MediTrack_Weekly_Report_2026-08-07.pdf"
    assert last.attachment_mime_type == "application/pdf"


# ============================================================================
# Test D: SMTP Message Construction
# ============================================================================
def test_smtp_message_construction():
    """Verify SMTPEmailService constructs compliant MIME messages with From/To/Subject headers."""
    smtp_svc = SMTPEmailService(
        smtp_host="mail.example.com",
        smtp_port=587,
        from_email="notifications@meditrack.health",
        from_name="MediTrack Alerts",
    )
    pdf_data = b"%PDF-1.4 test bytes"
    msg = EmailMessage(
        recipient="user@example.com",
        subject="Adherence Report Ready",
        text_body="Plain text version",
        html_body="<p>HTML version</p>",
        attachment_bytes=pdf_data,
        attachment_filename="Adherence_Report.pdf",
    )

    mime_msg = smtp_svc.build_mime_message(msg)

    assert mime_msg["Subject"] == "Adherence Report Ready"
    assert mime_msg["To"] == "user@example.com"
    assert "MediTrack Alerts" in mime_msg["From"]
    assert "notifications@meditrack.health" in mime_msg["From"]
    assert mime_msg["Message-ID"] is not None
    assert mime_msg["Date"] is not None
    assert mime_msg.is_multipart() is True

    # Confirm attachment part exists
    parts = list(mime_msg.walk())
    attachments = [p for p in parts if p.get_content_disposition() == "attachment"]
    assert len(attachments) == 1
    assert attachments[0].get_filename() == "Adherence_Report.pdf"
    assert attachments[0].get_payload(decode=True) == pdf_data


# ============================================================================
# Test E: TLS Configuration Is Respected
# ============================================================================
@pytest.mark.asyncio
async def test_smtp_tls_configuration_respected():
    """Verify SMTPEmailService initiates STARTTLS when smtp_use_tls=True."""
    smtp_svc = SMTPEmailService(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="testuser",
        smtp_password="testpassword",
        smtp_use_tls=True,
    )
    msg = EmailMessage(
        recipient="dest@example.com",
        subject="TLS Test",
        text_body="Body",
    )

    mock_smtp_instance = MagicMock()
    with patch("smtplib.SMTP", return_value=mock_smtp_instance):
        mock_smtp_instance.__enter__.return_value = mock_smtp_instance
        res = await smtp_svc.send_email(msg)

        assert res.success is True
        mock_smtp_instance.starttls.assert_called_once()
        mock_smtp_instance.login.assert_called_once_with("testuser", "testpassword")
        mock_smtp_instance.send_message.assert_called_once()


# ============================================================================
# Test F: EMAIL_ENABLED=false Prevents Actual Sending
# ============================================================================
@pytest.mark.asyncio
async def test_email_enabled_false_prevents_sending():
    """Verify email delivery is bypassed and returns skipped=True when EMAIL_ENABLED=False."""
    # Test for MockEmailService
    mock_disabled = MockEmailService(email_enabled=False)
    msg = EmailMessage("a@example.com", "Subj", "Body")
    res_mock = await mock_disabled.send_email(msg)
    assert res_mock.success is True
    assert res_mock.skipped is True
    assert len(mock_disabled.get_sent_messages()) == 0

    # Test for SMTPEmailService
    smtp_disabled = SMTPEmailService(email_enabled=False)
    with patch("smtplib.SMTP") as mock_smtp:
        res_smtp = await smtp_disabled.send_email(msg)
        assert res_smtp.success is True
        assert res_smtp.skipped is True
        mock_smtp.assert_not_called()


# ============================================================================
# Test G: Missing SMTP Configuration Fails Safely
# ============================================================================
@pytest.mark.asyncio
async def test_missing_smtp_configuration_fails_safely():
    """Verify SMTPEmailService raises EmailConfigurationError when host or port is invalid."""
    empty_host_svc = SMTPEmailService(smtp_host="", smtp_port=587, email_enabled=True)
    msg = EmailMessage("b@example.com", "Subj", "Body")

    with pytest.raises(EmailConfigurationError) as exc_info:
        await empty_host_svc.send_email(msg)
    assert "SMTP_HOST or SMTP_PORT is not properly configured" in str(exc_info.value)


# ============================================================================
# Test H: SMTP Failure Produces a Controlled Service-Level Error
# ============================================================================
@pytest.mark.asyncio
async def test_smtp_failure_produces_controlled_error():
    """Verify SMTP exceptions are caught and raised as EmailDeliveryError without crashing."""
    import smtplib

    smtp_svc = SMTPEmailService(
        smtp_host="mail.example.com",
        smtp_port=587,
        email_enabled=True,
    )
    msg = EmailMessage("c@example.com", "Subj", "Body")

    mock_smtp = MagicMock()
    mock_smtp.__enter__.return_value = mock_smtp
    mock_smtp.send_message.side_effect = smtplib.SMTPConnectError(421, b"Connection refused")

    with patch("smtplib.SMTP", return_value=mock_smtp):
        with pytest.raises(EmailDeliveryError) as exc_info:
            await smtp_svc.send_email(msg)
        assert "Email delivery failed" in str(exc_info.value)


# ============================================================================
# Test I: SMTP Password Never Appears in Exception/Message
# ============================================================================
@pytest.mark.asyncio
async def test_smtp_password_never_leaked():
    """Verify SMTP credentials do not appear in exceptions or error logs."""
    super_secret = "SuperSecretPassword12345!"
    smtp_svc = SMTPEmailService(
        smtp_host="mail.example.com",
        smtp_port=587,
        smtp_username="mailer",
        smtp_password=super_secret,
        email_enabled=True,
    )
    msg = EmailMessage("d@example.com", "Subj", "Body")

    # Simulate an error string that accidentally contains the password
    mock_smtp = MagicMock()
    mock_smtp.__enter__.return_value = mock_smtp
    mock_smtp.login.side_effect = Exception(f"Auth failed for secret: {super_secret}")

    with patch("smtplib.SMTP", return_value=mock_smtp):
        with pytest.raises(EmailDeliveryError) as exc_info:
            await smtp_svc.send_email(msg)
        err_str = str(exc_info.value)
        assert super_secret not in err_str
        assert "[REDACTED]" in err_str


# ============================================================================
# Test J: Caregiver Missed-Dose Template Contains Safe Fields
# ============================================================================
def test_caregiver_missed_dose_template_fields():
    """Verify caregiver alert template contains all required clinical safety fields."""
    msg = create_caregiver_missed_dose_email(
        caregiver_email="carer@example.com",
        caregiver_name="Elena Fisher",
        patient_name="Nathan Drake",
        medicine_name="Amoxicillin",
        dosage="500",
        dosage_unit="mg",
        scheduled_date="2026-09-12",
        scheduled_time="14:00",
        alert_rule="Rule A: 2 missed doses within 24 hours",
        adherence_context="Recent adherence: 60.0%",
    )

    assert msg.recipient == "carer@example.com"
    assert "Nathan Drake" in msg.subject
    assert "[MediTrack+ Alert]" in msg.subject

    for body in [msg.text_body, msg.html_body]:
        assert "Elena Fisher" in body
        assert "Nathan Drake" in body
        assert "Amoxicillin" in body
        assert "500 mg" in body
        assert "2026-09-12" in body
        assert "14:00" in body
        assert "Rule A: 2 missed doses within 24 hours" in body
        assert "Recent adherence: 60.0%" in body
        assert "MediTrack+" in body
        assert "Medical Safety Notice" in body


# ============================================================================
# Test K: Caregiver Template Excludes Secrets/Tokens/Passwords
# ============================================================================
def test_caregiver_template_excludes_secrets():
    """Verify caregiver template contains zero auth tokens, secrets, or passwords."""
    msg = create_caregiver_missed_dose_email(
        caregiver_email="carer@example.com",
        caregiver_name="Caregiver",
        patient_name="Patient",
        medicine_name="Med",
        dosage="10",
        dosage_unit="mg",
        scheduled_date="2026-09-12",
        scheduled_time="08:00",
        alert_rule="Rule B",
    )

    for body in [msg.text_body.lower(), msg.html_body.lower()]:
        assert "password" not in body
        assert "secret" not in body
        assert "smtp" not in body
        assert "bearer" not in body
        assert "eyj" not in body
        assert "token" not in body or "notification" in body  # ensure no auth tokens


# ============================================================================
# Test L: Adherence Report Template Contains Report Metrics
# ============================================================================
def test_adherence_report_template_contains_metrics():
    """Verify report email template renders calculated adherence summary metrics."""
    report = make_dummy_report(ReportPeriod.WEEKLY, "2026-08-07")
    pdf_bytes = b"%PDF-1.4 dummy pdf bytes"

    msg = create_adherence_report_email(
        recipient_email="recipient@example.com",
        recipient_name="Arthur Dent",
        report=report,
        pdf_bytes=pdf_bytes,
    )

    assert msg.recipient == "recipient@example.com"
    assert "Weekly" in msg.subject
    assert "2026-08-01 to 2026-08-07" in msg.subject

    for body in [msg.text_body, msg.html_body]:
        assert "85.7%" in body  # Adherence
        assert "12" in body     # Taken
        assert "14" in body     # Total scheduled
        assert "1" in body      # Missed / Skipped
        assert "5" in body      # Current streak
        assert "Arthur Dent" in body
        assert "MediTrack_Weekly_Report_2026-08-07.pdf" in body


# ============================================================================
# Test M: Adherence Report Template Does Not Recalculate Metrics
# ============================================================================
def test_adherence_report_template_does_not_recalculate():
    """Verify template relies entirely on already-calculated MedicationReportResponse attributes."""
    report = make_dummy_report()
    # Artificially modify the summary value to verify template uses it without re-computing
    report.summary.adherencePercentage = 99.9

    msg = create_adherence_report_email(
        recipient_email="test@example.com",
        recipient_name="User",
        report=report,
        pdf_bytes=b"%PDF-1.4 bytes",
    )

    assert "99.9%" in msg.text_body
    assert "99.9%" in msg.html_body


# ============================================================================
# Test N: PDF Attachment Uses Generated PDF Bytes
# ============================================================================
def test_pdf_attachment_uses_exact_bytes():
    """Verify email message attachment contains exact binary bytes supplied."""
    report = make_dummy_report()
    unique_pdf_bytes = b"%PDF-1.4 UNIQUE_BINARY_TEST_STREAM_12345"

    msg = create_adherence_report_email(
        recipient_email="patient@example.com",
        recipient_name="Patient",
        report=report,
        pdf_bytes=unique_pdf_bytes,
    )

    assert msg.attachment_bytes == unique_pdf_bytes
    assert msg.attachment_mime_type == "application/pdf"


# ============================================================================
# Test O: Weekly Report Filename Format
# ============================================================================
def test_weekly_report_filename_format():
    """Verify weekly report filename is MediTrack_Weekly_Report_YYYY-MM-DD.pdf."""
    report = make_dummy_report(ReportPeriod.WEEKLY, end_date="2026-09-07")
    msg = create_adherence_report_email("test@example.com", "User", report, b"pdf")
    assert msg.attachment_filename == "MediTrack_Weekly_Report_2026-09-07.pdf"


# ============================================================================
# Test P: Monthly Report Filename Format
# ============================================================================
def test_monthly_report_filename_format():
    """Verify monthly report filename is MediTrack_Monthly_Report_YYYY-MM.pdf."""
    report = make_dummy_report(ReportPeriod.MONTHLY, end_date="2026-08-31")
    msg = create_adherence_report_email("test@example.com", "User", report, b"pdf")
    assert msg.attachment_filename == "MediTrack_Monthly_Report_2026-08.pdf"


# ============================================================================
# Test Q: No Database Queries in Email Service
# ============================================================================
def test_no_database_queries_in_email_service():
    """Verify email_service and email_templates modules have zero database imports."""
    import app.services.email_service as es
    import app.services.email_templates as et

    forbidden_terms = ["pymongo", "mongodb", "motor", "get_users_collection", "get_activities_collection"]

    for mod in [es, et]:
        mod_vars = dir(mod)
        for term in forbidden_terms:
            assert term not in mod_vars, f"Module {mod.__name__} should not import {term}"


# ============================================================================
# Test R: Email Service Contains No FastAPI / HTTP Dependencies
# ============================================================================
def test_no_fastapi_dependencies_in_email_service():
    """Verify email_service and email_templates modules have zero FastAPI/HTTP imports."""
    import app.services.email_service as es
    import app.services.email_templates as et

    forbidden_terms = ["fastapi", "HTTPException", "status", "Request", "Response", "APIRouter"]

    for mod in [es, et]:
        mod_vars = dir(mod)
        for term in forbidden_terms:
            assert term not in mod_vars, f"Module {mod.__name__} should not import {term}"


# ============================================================================
# Test S: Factory Provider Behavior
# ============================================================================
def test_get_email_service_factory():
    """Verify get_email_service factory returns appropriate provider according to settings."""
    with patch("app.core.config.settings.EMAIL_BACKEND", "mock"):
        svc_mock = get_email_service()
        assert isinstance(svc_mock, MockEmailService)

    with patch("app.core.config.settings.EMAIL_BACKEND", "smtp"):
        svc_smtp = get_email_service()
        assert isinstance(svc_smtp, SMTPEmailService)


# ============================================================================
# Test T: SMTP Port 465 and Direct SSL Behavior (Phase 12.3)
# ============================================================================
@pytest.mark.asyncio
async def test_smtp_port_465_uses_direct_ssl():
    """Verify that port 465 or smtp_use_ssl=True invokes smtplib.SMTP_SSL without starttls."""
    smtp_svc = SMTPEmailService(
        smtp_host="smtp.example.com",
        smtp_port=465,
        smtp_username="ssl_user",
        smtp_password="ssl_password",
        smtp_use_ssl=True,
        smtp_timeout=20,
    )
    msg = EmailMessage(
        recipient="ssl_dest@example.com",
        subject="SSL Test",
        text_body="SSL Body",
    )

    mock_ssl_instance = MagicMock()
    mock_ssl_instance.__enter__.return_value = mock_ssl_instance

    with patch("smtplib.SMTP_SSL", return_value=mock_ssl_instance) as mock_ssl_cls, \
         patch("smtplib.SMTP") as mock_smtp_cls:
        res = await smtp_svc.send_email(msg)

        assert res.success is True
        mock_ssl_cls.assert_called_once_with("smtp.example.com", 465, timeout=20)
        mock_smtp_cls.assert_not_called()
        # Direct SSL must not issue starttls
        mock_ssl_instance.starttls.assert_not_called()
        mock_ssl_instance.login.assert_called_once_with("ssl_user", "ssl_password")
        mock_ssl_instance.send_message.assert_called_once()


# ============================================================================
# Test U: SMTP Port 587 STARTTLS and Configurable Timeout (Phase 12.3)
# ============================================================================
@pytest.mark.asyncio
async def test_smtp_port_587_starttls_and_configurable_timeout():
    """Verify that port 587 invokes smtplib.SMTP with starttls and respects custom timeout."""
    custom_timeout = 25
    smtp_svc = SMTPEmailService(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="tls_user",
        smtp_password="tls_password",
        smtp_use_tls=True,
        smtp_use_ssl=False,
        smtp_timeout=custom_timeout,
    )
    msg = EmailMessage(
        recipient="tls_dest@example.com",
        subject="TLS 587 Test",
        text_body="TLS Body",
    )

    mock_smtp_instance = MagicMock()
    mock_smtp_instance.__enter__.return_value = mock_smtp_instance

    with patch("smtplib.SMTP", return_value=mock_smtp_instance) as mock_smtp_cls, \
         patch("smtplib.SMTP_SSL") as mock_ssl_cls:
        res = await smtp_svc.send_email(msg)

        assert res.success is True
        mock_smtp_cls.assert_called_once_with("smtp.example.com", 587, timeout=custom_timeout)
        mock_ssl_cls.assert_not_called()
        mock_smtp_instance.starttls.assert_called_once()
        mock_smtp_instance.login.assert_called_once_with("tls_user", "tls_password")
        mock_smtp_instance.send_message.assert_called_once()


# ============================================================================
# Test V: SMTP Diagnostic Script Executes Cleanly in Mock Mode (Phase 12.3)
# ============================================================================
def test_smtp_diagnostic_utility_mock_mode():
    """Verify backend/scripts/test_smtp_connection.py runs safely and returns code 0."""
    from scripts.test_smtp_connection import run_smtp_verification

    with patch("app.core.config.settings.EMAIL_BACKEND", "mock"):
        exit_code = run_smtp_verification()
        assert exit_code == 0

