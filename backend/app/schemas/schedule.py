"""Medication Schedule validation schemas (Phase 5).

Provides strict validation for daily, weekly, and custom medication schedules:
- Time validation (24-hour HH:MM format)
- Days of week validation (0=Sunday to 6=Saturday, no duplicates)
- Custom dates validation (valid calendar dates, no duplicates)
- Date range ordering (endDate >= startDate)
- Resolution metadata (medicineName, dosage, dosageUnit)
- Medical safety disclaimers
"""

import re
from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.common import MedicalDisclaimerMixin


class FrequencyType(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    CUSTOM = "custom"


TIME_REGEX = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_date_str(date_str: str, field_name: str) -> str:
    """Validate date string is in YYYY-MM-DD format and represents a real calendar date."""
    if not DATE_REGEX.match(date_str.strip()):
        raise ValueError(f"{field_name} must be in YYYY-MM-DD format.")
    try:
        datetime.strptime(date_str.strip(), "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"{field_name} contains an invalid calendar date: '{date_str}'.")
    return date_str.strip()


class ScheduleBase(BaseModel):
    medicineId: str = Field(..., description="Referenced Medicine ObjectId string", examples=["650c709e3e7f4c3a8e9e1234"])
    time: str = Field(..., description="Intake time in 24-hour HH:MM format", examples=["08:30"])
    frequencyType: FrequencyType = Field(default=FrequencyType.DAILY, description="Schedule frequency type")
    daysOfWeek: Optional[List[int]] = Field(
        default=None,
        description="Days of week for weekly frequencies (0=Sunday ... 6=Saturday)",
        examples=[[1, 3, 5]]
    )
    startDate: Optional[str] = Field(None, description="Schedule start date (YYYY-MM-DD)", examples=["2026-09-10"])
    endDate: Optional[str] = Field(None, description="Optional schedule end date (YYYY-MM-DD)", examples=["2026-10-10"])
    dates: Optional[List[str]] = Field(default=None, description="Specific dates for custom frequency (YYYY-MM-DD)", examples=[["2026-09-15", "2026-09-20"]])
    enabled: bool = Field(default=True, description="Active status of this reminder schedule")

    @field_validator("time")
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        if not TIME_REGEX.match(v.strip()):
            raise ValueError("Time must be in 24-hour HH:MM format between 00:00 and 23:59.")
        return v.strip()

    @field_validator("daysOfWeek")
    @classmethod
    def validate_days(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is not None:
            for day in v:
                if not (0 <= day <= 6):
                    raise ValueError("Days of week must be integers between 0 (Sunday) and 6 (Saturday).")
            if len(v) != len(set(v)):
                raise ValueError("Duplicate days of week are not allowed.")
        return v

    @field_validator("dates")
    @classmethod
    def validate_dates_list(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            for d in v:
                validate_date_str(d, "dates")
            if len(v) != len(set(v)):
                raise ValueError("Duplicate dates are not allowed in custom schedule.")
        return v

    @model_validator(mode="after")
    def validate_schedule_consistency(self) -> "ScheduleBase":
        if self.startDate:
            validate_date_str(self.startDate, "startDate")
        if self.endDate:
            validate_date_str(self.endDate, "endDate")
        if self.startDate and self.endDate:
            if self.endDate < self.startDate:
                raise ValueError("Schedule end date cannot be earlier than start date.")

        if self.frequencyType == FrequencyType.WEEKLY:
            if not self.daysOfWeek:
                raise ValueError("daysOfWeek is required and cannot be empty for weekly frequency.")

        if self.frequencyType == FrequencyType.CUSTOM:
            if not self.dates:
                raise ValueError("Specific dates list is required and cannot be empty for custom frequency.")

        return self


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    time: Optional[str] = None
    frequencyType: Optional[FrequencyType] = None
    daysOfWeek: Optional[List[int]] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    dates: Optional[List[str]] = None
    enabled: Optional[bool] = None

    @field_validator("time")
    @classmethod
    def validate_time_format(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not TIME_REGEX.match(v.strip()):
                raise ValueError("Time must be in 24-hour HH:MM format between 00:00 and 23:59.")
            return v.strip()
        return v

    @field_validator("daysOfWeek")
    @classmethod
    def validate_days(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is not None:
            for day in v:
                if not (0 <= day <= 6):
                    raise ValueError("Days of week must be integers between 0 (Sunday) and 6 (Saturday).")
            if len(v) != len(set(v)):
                raise ValueError("Duplicate days of week are not allowed.")
        return v

    @field_validator("dates")
    @classmethod
    def validate_dates_list(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            for d in v:
                validate_date_str(d, "dates")
            if len(v) != len(set(v)):
                raise ValueError("Duplicate dates are not allowed in custom schedule.")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "ScheduleUpdate":
        if self.startDate:
            validate_date_str(self.startDate, "startDate")
        if self.endDate:
            validate_date_str(self.endDate, "endDate")
        if self.startDate and self.endDate:
            if self.endDate < self.startDate:
                raise ValueError("Schedule end date cannot be earlier than start date.")
        return self


class ScheduleResponse(ScheduleBase, MedicalDisclaimerMixin):
    id: str = Field(..., description="Schedule unique identifier")
    userId: str = Field(..., description="Patient user ID")
    medicineName: Optional[str] = Field(None, description="Resolved medicine name for UI convenience")
    dosage: Optional[str] = Field(None, description="Resolved medicine dosage")
    dosageUnit: Optional[str] = Field(None, description="Resolved dosage unit")
    createdAt: datetime
    updatedAt: datetime

    model_config = {
        "from_attributes": True,
    }


class ScheduleListResponse(MedicalDisclaimerMixin):
    items: List[ScheduleResponse] = Field(default_factory=list)
    total: int = 0


class ScheduleDeleteResponse(MedicalDisclaimerMixin):
    message: str = Field(default="Schedule deleted successfully")
    id: str
