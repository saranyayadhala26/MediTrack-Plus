"""MongoDB models and document factories package."""

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

__all__ = [
    "COLLECTION_USERS",
    "COLLECTION_MEDICINES",
    "COLLECTION_SCHEDULES",
    "COLLECTION_ACTIVITIES",
    "COLLECTION_CAREGIVERS",
    "COLLECTION_NOTIFICATIONS",
    "create_user_document",
    "create_medicine_document",
    "create_schedule_document",
    "create_activity_document",
    "create_caregiver_document",
    "create_notification_document",
]
