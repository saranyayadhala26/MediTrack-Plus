"""MongoDB collections and document schema definitions for MediTrack+."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import ObjectId


# Canonical MongoDB Collection Names
COLLECTION_USERS = "users"
COLLECTION_MEDICINES = "medicines"
COLLECTION_SCHEDULES = "medication_schedules"
COLLECTION_ACTIVITIES = "medication_activities"
COLLECTION_CAREGIVERS = "caregivers"
COLLECTION_NOTIFICATIONS = "notifications"


def now_utc() -> datetime:
    """Return current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def create_user_document(
    email: str,
    full_name: str,
    password_hash: str,
    role: str = "patient",
    emergency_contact: Optional[str] = None,
    health_conditions: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Factory creating a new persistent User document."""
    return {
        "_id": ObjectId(),
        "email": email.strip().lower(),
        "fullName": full_name.strip(),
        "passwordHash": password_hash,
        "role": role,
        "emergencyContact": emergency_contact.strip() if emergency_contact else None,
        "healthConditions": health_conditions or [],
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    }


def create_medicine_document(
    user_id: ObjectId,
    name: str,
    dosage: str,
    dosage_unit: str,
    frequency: str,
    instructions: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    inventory: Optional[int] = None,
    refill_threshold: Optional[int] = None,
) -> Dict[str, Any]:
    """Factory creating a new persistent Medicine document."""
    return {
        "_id": ObjectId(),
        "userId": user_id,
        "name": name.strip(),
        "dosage": dosage.strip(),
        "dosageUnit": dosage_unit,
        "frequency": frequency.strip(),
        "instructions": instructions.strip() if instructions else None,
        "startDate": start_date,
        "endDate": end_date,
        "inventory": inventory,
        "refillThreshold": refill_threshold,
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    }


def create_schedule_document(
    user_id: ObjectId,
    medicine_id: ObjectId,
    time: str,
    frequency_type: str = "daily",
    days_of_week: Optional[List[int]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    dates: Optional[List[str]] = None,
    enabled: bool = True,
) -> Dict[str, Any]:
    """Factory creating a new persistent MedicationSchedule document."""
    return {
        "_id": ObjectId(),
        "userId": user_id,
        "medicineId": medicine_id,
        "time": time.strip(),
        "frequencyType": frequency_type,
        "daysOfWeek": days_of_week or [],
        "startDate": start_date,
        "endDate": end_date,
        "dates": dates or [],
        "enabled": enabled,
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    }


def create_activity_document(
    user_id: ObjectId,
    medicine_id: ObjectId,
    schedule_id: ObjectId,
    scheduled_date: str,
    scheduled_time: str,
    action: str,
    action_time: Optional[datetime] = None,
    skip_reason: Optional[str] = None,
    was_snoozed: bool = False,
    snooze_count: int = 0,
) -> Dict[str, Any]:
    """Factory creating a new persistent MedicationActivity document."""
    is_snoozed = action == "Snoozed"
    return {
        "_id": ObjectId(),
        "userId": user_id,
        "medicineId": medicine_id,
        "scheduleId": schedule_id,
        "scheduledDate": scheduled_date.strip(),
        "scheduledTime": scheduled_time.strip(),
        "action": action,
        "actionTime": action_time or now_utc(),
        "skipReason": skip_reason.strip() if skip_reason else None,
        "wasSnoozed": was_snoozed or is_snoozed,
        "snoozeCount": snooze_count + (1 if is_snoozed else 0),
        "createdAt": now_utc(),
    }


def create_caregiver_document(
    patient_id: ObjectId,
    caregiver_name: str,
    caregiver_email: str,
    caregiver_phone: str,
    relationship: str,
    status: str = "active",
) -> Dict[str, Any]:
    """Factory creating a new persistent Caregiver document."""
    return {
        "_id": ObjectId(),
        "patientId": patient_id,
        "caregiverName": caregiver_name.strip(),
        "caregiverEmail": caregiver_email.strip().lower(),
        "caregiverPhone": caregiver_phone.strip(),
        "relationship": relationship.strip(),
        "status": status,
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    }


def create_notification_document(
    user_id: ObjectId,
    notification_type: str,
    title: str,
    message: str,
    caregiver_id: Optional[ObjectId] = None,
    medicine_id: Optional[ObjectId] = None,
    schedule_id: Optional[ObjectId] = None,
    scheduled_time: Optional[datetime] = None,
    status: str = "unread",
) -> Dict[str, Any]:
    """Factory creating a new persistent Notification document."""
    return {
        "_id": ObjectId(),
        "userId": user_id,
        "caregiverId": caregiver_id,
        "medicineId": medicine_id,
        "scheduleId": schedule_id,
        "type": notification_type,
        "title": title.strip(),
        "message": message.strip(),
        "scheduledTime": scheduled_time or now_utc(),
        "status": status,
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    }
