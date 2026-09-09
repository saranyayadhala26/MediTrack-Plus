"""Medication Activity and Adherence validation schemas."""

import re
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class ActionType(str, Enum):
    TAKEN = "Taken"
    SKIPPED = "Skipped"
    SNOOZED = "Snoozed"


class PredefinedSkipReason(str, Enum):
    FORGOT = "Forgot"
    FEELING_UNWELL = "Feeling unwell"
    MEDICINE_UNAVAILABLE = "Medicine unavailable"
    AWAY_FROM_HOME = "Away from home"
    NOT_REQUIRED_TODAY = "Not required today"
    OTHER = "Other"


DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_REGEX = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class ActivityCreate(BaseModel):
    medicineId: str = Field(..., description="Referenced Medicine ObjectId string")
    scheduleId: str = Field(..., description="Referenced Schedule ObjectId string")
    scheduledDate: str = Field(..., description="Scheduled date in YYYY-MM-DD format", examples=["2026-09-09"])
    scheduledTime: str = Field(..., description="Scheduled time in HH:MM format", examples=["08:30"])
    action: ActionType = Field(..., description="Medication action taken: Taken, Skipped, or Snoozed")
    actionTime: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Timestamp when the action was recorded"
    )
    skipReason: Optional[str] = Field(None, max_length=250, description="Reason if skipped (required if Skipped)")

    @field_validator("scheduledDate")
    @classmethod
    def validate_date(cls, v: str) -> str:
        if not DATE_REGEX.match(v.strip()):
            raise ValueError("Scheduled date must be in YYYY-MM-DD format.")
        return v.strip()

    @field_validator("scheduledTime")
    @classmethod
    def validate_time(cls, v: str) -> str:
        if not TIME_REGEX.match(v.strip()):
            raise ValueError("Scheduled time must be in HH:MM format.")
        return v.strip()

    @model_validator(mode="after")
    def validate_skip_reason_required(self) -> "ActivityCreate":
        if self.action == ActionType.SKIPPED:
            if not self.skipReason or not self.skipReason.strip():
                raise ValueError("A skip reason must be provided when medication is skipped.")
        return self


class ActivityResponse(BaseModel):
    id: str = Field(..., description="Activity unique identifier")
    userId: str = Field(..., description="Patient user ID")
    medicineId: str
    scheduleId: str
    medicineName: Optional[str] = None
    dosage: Optional[str] = None
    dosageUnit: Optional[str] = None
    scheduledDate: str
    scheduledTime: str
    action: ActionType
    actionTime: datetime
    skipReason: Optional[str] = None
    createdAt: datetime

    model_config = {
        "from_attributes": True,
    }


class DailyProgressResponse(BaseModel):
    date: str
    totalScheduled: int = 0
    takenCount: int = 0
    skippedCount: int = 0
    pendingCount: int = 0
    adherencePercentage: float = 0.0


class AdherenceCalculationDetails(BaseModel):
    formula: str = "Adherence Percentage = (Taken scheduled doses / Total due scheduled doses) * 100"
    totalScheduled: int
    dueScheduled: int
    takenCount: int
    skippedCount: int
    missedCount: int
    adherencePercentage: float


class StreakResponse(BaseModel):
    currentStreakDays: int = 0
    longestStreakDays: int = 0
    consecutiveSuccessfulDays: int = 0
    motivationalMessage: str = "Keep your routine going!"
