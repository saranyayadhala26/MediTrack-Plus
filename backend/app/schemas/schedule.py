"""Medication Schedule validation schemas."""

import re
from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class FrequencyType(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    CUSTOM = "custom"


TIME_REGEX = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class ScheduleBase(BaseModel):
    medicineId: str = Field(..., description="Referenced Medicine ObjectId string", examples=["650c709e3e7f4c3a8e9e1234"])
    time: str = Field(..., description="Intake time in 24-hour HH:MM format", examples=["08:30"])
    frequencyType: FrequencyType = Field(default=FrequencyType.DAILY, description="Schedule frequency type")
    daysOfWeek: Optional[List[int]] = Field(
        default=None,
        description="Days of week for weekly/custom frequencies (0=Sunday ... 6=Saturday)",
        examples=[[1, 3, 5]]
    )
    startDate: str = Field(..., description="Schedule start date (YYYY-MM-DD)", examples=["2026-09-10"])
    endDate: Optional[str] = Field(None, description="Optional schedule end date (YYYY-MM-DD)", examples=["2026-10-10"])
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
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "ScheduleBase":
        if self.startDate and self.endDate:
            if self.endDate < self.startDate:
                raise ValueError("Schedule end date cannot be earlier than start date.")
        return self


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    time: Optional[str] = None
    frequencyType: Optional[FrequencyType] = None
    daysOfWeek: Optional[List[int]] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
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
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "ScheduleUpdate":
        if self.startDate and self.endDate:
            if self.endDate < self.startDate:
                raise ValueError("Schedule end date cannot be earlier than start date.")
        return self


class ScheduleResponse(ScheduleBase):
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


class ScheduleListResponse(BaseModel):
    items: List[ScheduleResponse] = Field(default_factory=list)
    total: int = 0
