"""Unit tests for MongoDB collection document models and factory functions."""

from bson import ObjectId
from app.models.collections import (
    COLLECTION_USERS,
    COLLECTION_MEDICINES,
    COLLECTION_SCHEDULES,
    COLLECTION_ACTIVITIES,
    COLLECTION_CAREGIVERS,
    COLLECTION_NOTIFICATIONS,
    create_user_document,
    create_medicine_document,
    create_schedule_document,
    create_activity_document,
    create_caregiver_document,
    create_notification_document,
)


def test_collection_names_match_spec():
    """Verify collection name constants match authoritative project specification."""
    assert COLLECTION_USERS == "users"
    assert COLLECTION_MEDICINES == "medicines"
    assert COLLECTION_SCHEDULES == "medication_schedules"
    assert COLLECTION_ACTIVITIES == "medication_activities"
    assert COLLECTION_CAREGIVERS == "caregivers"
    assert COLLECTION_NOTIFICATIONS == "notifications"


def test_create_user_document():
    """Verify user document factory populates required fields, ObjectIds, and timestamps."""
    doc = create_user_document(
        email="patient@example.com",
        full_name="Sarah Connor",
        password_hash="hashed_pw_abc",
        role="patient",
        emergency_contact="+1-555-9999",
        health_conditions=["Type 2 Diabetes"],
    )
    assert isinstance(doc["_id"], ObjectId)
    assert doc["email"] == "patient@example.com"
    assert doc["fullName"] == "Sarah Connor"
    assert doc["passwordHash"] == "hashed_pw_abc"
    assert doc["role"] == "patient"
    assert doc["emergencyContact"] == "+1-555-9999"
    assert doc["healthConditions"] == ["Type 2 Diabetes"]
    assert doc["createdAt"] is not None
    assert doc["updatedAt"] is not None


def test_create_medicine_document():
    """Verify medicine document factory creates valid structure."""
    user_id = ObjectId()
    doc = create_medicine_document(
        user_id=user_id,
        name="Paracetamol",
        dosage="650",
        dosage_unit="mg",
        frequency="Every 6 hours as needed",
        instructions="Take with warm water",
        start_date="2026-09-09",
        inventory=20,
        refill_threshold=5,
    )
    assert isinstance(doc["_id"], ObjectId)
    assert doc["userId"] == user_id
    assert doc["name"] == "Paracetamol"
    assert doc["dosage"] == "650"
    assert doc["inventory"] == 20
    assert doc["refillThreshold"] == 5


def test_create_schedule_document():
    """Verify schedule document factory produces correct structure."""
    user_id = ObjectId()
    med_id = ObjectId()
    doc = create_schedule_document(
        user_id=user_id,
        medicine_id=med_id,
        time="14:00",
        frequency_type="daily",
        start_date="2026-09-09",
        enabled=True,
    )
    assert isinstance(doc["_id"], ObjectId)
    assert doc["userId"] == user_id
    assert doc["medicineId"] == med_id
    assert doc["time"] == "14:00"
    assert doc["enabled"] is True


def test_create_activity_document():
    """Verify activity document factory produces valid activity structure."""
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()
    doc = create_activity_document(
        user_id=user_id,
        medicine_id=med_id,
        schedule_id=sched_id,
        scheduled_date="2026-09-09",
        scheduled_time="08:00",
        action="Skipped",
        skip_reason="Medicine unavailable",
    )
    assert isinstance(doc["_id"], ObjectId)
    assert doc["userId"] == user_id
    assert doc["action"] == "Skipped"
    assert doc["skipReason"] == "Medicine unavailable"
    assert doc["scheduledDate"] == "2026-09-09"


def test_create_caregiver_document():
    """Verify caregiver document factory produces valid caregiver link."""
    patient_id = ObjectId()
    doc = create_caregiver_document(
        patient_id=patient_id,
        caregiver_name="Bob Connor",
        caregiver_email="bob@example.com",
        caregiver_phone="+1-555-8888",
        relationship="Son",
    )
    assert isinstance(doc["_id"], ObjectId)
    assert doc["patientId"] == patient_id
    assert doc["caregiverEmail"] == "bob@example.com"
    assert doc["status"] == "active"


def test_create_notification_document():
    """Verify notification document factory produces valid notification."""
    user_id = ObjectId()
    doc = create_notification_document(
        user_id=user_id,
        notification_type="reminder",
        title="Medication Reminder",
        message="It's time to take your morning dose.",
    )
    assert isinstance(doc["_id"], ObjectId)
    assert doc["userId"] == user_id
    assert doc["status"] == "unread"
    assert doc["type"] == "reminder"
