"""Unit tests for Phase 2 Pydantic schemas validation rules."""

from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from app.schemas.user import UserRegister, UserLogin, UserRole
from app.schemas.medicine import MedicineCreate, MedicineResponse, DosageUnit
from app.schemas.schedule import ScheduleCreate, FrequencyType
from app.schemas.activity import ActivityCreate, ActionType
from app.schemas.caregiver import CaregiverCreate, CaregiverStatus
from app.schemas.notification import NotificationCreate, NotificationType


# ---------------------------------------------------------------------------
# User Schema Tests
# ---------------------------------------------------------------------------
def test_user_register_valid():
    """Verify valid user registration schema accepts expected inputs."""
    user = UserRegister(
        fullName="John Doe",
        email="john.doe@example.com",
        password="secretpassword123",
        confirmPassword="secretpassword123",
        role=UserRole.PATIENT,
        emergencyContact="+1-555-1234",
    )
    assert user.fullName == "John Doe"
    assert user.email == "john.doe@example.com"
    assert user.role == UserRole.PATIENT


def test_user_register_password_mismatch():
    """Verify registration fails when password and confirmPassword differ."""
    with pytest.raises(ValidationError, match="Passwords do not match"):
        UserRegister(
            fullName="John Doe",
            email="john@example.com",
            password="password123",
            confirmPassword="differentpassword456",
        )


def test_user_register_invalid_email():
    """Verify registration fails with malformed email."""
    with pytest.raises(ValidationError):
        UserRegister(
            fullName="John Doe",
            email="not-an-email",
            password="password123",
            confirmPassword="password123",
        )


# ---------------------------------------------------------------------------
# Medicine Schema Tests
# ---------------------------------------------------------------------------
def test_medicine_create_valid():
    """Verify valid medicine creation."""
    med = MedicineCreate(
        name="Metformin",
        dosage="500",
        dosageUnit=DosageUnit.MG,
        frequency="Twice daily",
        instructions="Take with meals",
        startDate="2026-09-10",
        endDate="2026-10-10",
        inventory=60,
        refillThreshold=10,
    )
    assert med.name == "Metformin"
    assert med.dosageUnit == DosageUnit.MG
    assert med.inventory == 60


def test_medicine_create_empty_name_rejected():
    """Verify empty or whitespace-only medicine names are rejected."""
    with pytest.raises(ValidationError, match="Medicine name cannot be empty"):
        MedicineCreate(
            name="   ",
            dosage="500",
            dosageUnit=DosageUnit.MG,
            frequency="Daily",
        )


def test_medicine_create_inverted_date_range_rejected():
    """Verify end date earlier than start date is rejected."""
    with pytest.raises(ValidationError, match="End date must be greater than or equal to start date"):
        MedicineCreate(
            name="Metformin",
            dosage="500",
            dosageUnit=DosageUnit.MG,
            frequency="Daily",
            startDate="2026-09-20",
            endDate="2026-09-10",
        )


def test_medicine_response_has_medical_disclaimer():
    """Verify MedicineResponse includes the authoritative medical disclaimer."""
    now = datetime.now(timezone.utc)
    res = MedicineResponse(
        id="650c709e3e7f4c3a8e9e1234",
        userId="650c709e3e7f4c3a8e9e0000",
        name="Metformin",
        dosage="500",
        dosageUnit=DosageUnit.MG,
        frequency="Daily",
        createdAt=now,
        updatedAt=now,
    )
    assert "medical_disclaimer" in res.model_dump()
    assert "does not provide medical advice" in res.medical_disclaimer.lower()


# ---------------------------------------------------------------------------
# Schedule Schema Tests
# ---------------------------------------------------------------------------
def test_schedule_create_valid():
    """Verify valid schedule with 24-hour time format."""
    sched = ScheduleCreate(
        medicineId="650c709e3e7f4c3a8e9e1234",
        time="08:30",
        frequencyType=FrequencyType.DAILY,
        startDate="2026-09-10",
    )
    assert sched.time == "08:30"
    assert sched.enabled is True


def test_schedule_create_invalid_time_format():
    """Verify invalid time format is rejected."""
    with pytest.raises(ValidationError, match="24-hour HH:MM format"):
        ScheduleCreate(
            medicineId="650c709e3e7f4c3a8e9e1234",
            time="25:00",  # Invalid hour
            startDate="2026-09-10",
        )


def test_schedule_create_invalid_day_of_week():
    """Verify invalid day index (> 6) is rejected."""
    with pytest.raises(ValidationError, match="between 0 .* and 6"):
        ScheduleCreate(
            medicineId="650c709e3e7f4c3a8e9e1234",
            time="09:00",
            frequencyType=FrequencyType.WEEKLY,
            daysOfWeek=[1, 7],  # 7 is invalid
            startDate="2026-09-10",
        )


# ---------------------------------------------------------------------------
# Activity & Skip Reason Tests
# ---------------------------------------------------------------------------
def test_activity_taken_valid():
    """Verify recording a Taken activity does not require a skipReason."""
    act = ActivityCreate(
        medicineId="650c709e3e7f4c3a8e9e1234",
        scheduleId="650c709e3e7f4c3a8e9e5678",
        scheduledDate="2026-09-09",
        scheduledTime="08:00",
        action=ActionType.TAKEN,
    )
    assert act.action == ActionType.TAKEN
    assert act.skipReason is None


def test_activity_skipped_with_reason_valid():
    """Verify recording a Skipped activity with valid skipReason passes."""
    act = ActivityCreate(
        medicineId="650c709e3e7f4c3a8e9e1234",
        scheduleId="650c709e3e7f4c3a8e9e5678",
        scheduledDate="2026-09-09",
        scheduledTime="08:00",
        action=ActionType.SKIPPED,
        skipReason="Forgot",
    )
    assert act.action == ActionType.SKIPPED
    assert act.skipReason == "Forgot"


def test_activity_skipped_without_reason_rejected():
    """Verify recording a Skipped activity WITHOUT a skipReason is rejected."""
    with pytest.raises(ValidationError, match="skip reason must be provided"):
        ActivityCreate(
            medicineId="650c709e3e7f4c3a8e9e1234",
            scheduleId="650c709e3e7f4c3a8e9e5678",
            scheduledDate="2026-09-09",
            scheduledTime="08:00",
            action=ActionType.SKIPPED,
            skipReason=None,  # Missing reason
        )


# ---------------------------------------------------------------------------
# Caregiver Schema Tests
# ---------------------------------------------------------------------------
def test_caregiver_create_valid():
    """Verify caregiver creation."""
    cg = CaregiverCreate(
        caregiverName="Alice Smith",
        caregiverEmail="alice@example.com",
        caregiverPhone="+1-555-0987",
        relationship="Daughter",
    )
    assert cg.caregiverName == "Alice Smith"
    assert cg.relationship == "Daughter"


def test_caregiver_create_invalid_email():
    """Verify caregiver creation rejects malformed email."""
    with pytest.raises(ValidationError):
        CaregiverCreate(
            caregiverName="Alice Smith",
            caregiverEmail="invalid-email-address",
            caregiverPhone="+1-555-0987",
            relationship="Daughter",
        )


# ---------------------------------------------------------------------------
# Notification Schema Tests
# ---------------------------------------------------------------------------
def test_notification_create_valid():
    """Verify notification creation."""
    notif = NotificationCreate(
        type=NotificationType.REMINDER,
        title="Medication Reminder",
        message="Time to take Metformin 500mg",
    )
    assert notif.type == NotificationType.REMINDER
    assert notif.title == "Medication Reminder"
