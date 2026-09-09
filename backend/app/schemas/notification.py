"""Notification validation schemas (Phase 6).

Provides models for medication reminders and notification alerts:
- Notification types (reminder, snooze, caregiver_alert, system)
- Read / Unread status tracking
- Authoritative medical safety disclaimers
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.common import MedicalDisclaimerMixin


class NotificationType(str, Enum):
    REMINDER = "reminder"
    SNOOZE = "snooze"
    CAREGIVER_ALERT = "caregiver_alert"
    SYSTEM = "system"


class NotificationStatus(str, Enum):
    UNREAD = "unread"
    READ = "read"


class NotificationBase(BaseModel):
    type: NotificationType = Field(default=NotificationType.REMINDER)
    title: str = Field(..., min_length=1, max_length=150, description="Notification header title")
    message: str = Field(..., min_length=1, max_length=500, description="Notification body content")
    scheduledTime: Optional[datetime] = Field(None, description="Trigger or scheduled timestamp")


class NotificationCreate(NotificationBase):
    caregiverId: Optional[str] = Field(None, description="Optional associated caregiver recipient ID")
    medicineId: Optional[str] = Field(None, description="Optional associated medicine ID")
    scheduleId: Optional[str] = Field(None, description="Optional associated schedule ID")


class NotificationResponse(NotificationBase, MedicalDisclaimerMixin):
    id: str = Field(..., description="Notification unique identifier")
    userId: str = Field(..., description="Recipient user ID")
    caregiverId: Optional[str] = None
    medicineId: Optional[str] = None
    scheduleId: Optional[str] = None
    status: NotificationStatus = NotificationStatus.UNREAD
    createdAt: datetime
    updatedAt: datetime

    model_config = {
        "from_attributes": True,
    }


class NotificationListResponse(MedicalDisclaimerMixin):
    items: List[NotificationResponse] = Field(default_factory=list)
    total: int = 0
    unreadCount: int = 0
