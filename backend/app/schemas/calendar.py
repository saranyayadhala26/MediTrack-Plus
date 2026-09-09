"""Medication Calendar and Adherence Streak validation schemas (Phase 8).

Defines schemas for:
- Individual scheduled medication occurrences with actual intake status
- Day-level aggregate statuses for month-grid visualization
- Date-range calendar responses
- Clinically sound, non-fabricated adherence streaks
- Mandatory medical safety disclaimers
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

from app.schemas.common import MedicalDisclaimerMixin


class CalendarStatus(str, Enum):
    PENDING = "Pending"
    TAKEN = "Taken"
    SKIPPED = "Skipped"
    SNOOZED = "Snoozed"


class DayAggregateStatus(str, Enum):
    ADHERENT = "Adherent"      # All scheduled doses on this day were Taken
    SKIPPED = "Skipped"        # At least one scheduled dose was Skipped
    SNOOZED = "Snoozed"        # Unresolved snoozed doses (and no skips)
    PENDING = "Pending"        # Doses pending intake (mixed taken/pending, or all pending)
    NONE = "None"              # No doses scheduled on this day


class CalendarOccurrence(BaseModel):
    date: str = Field(..., description="Occurrence date in YYYY-MM-DD format", examples=["2026-09-10"])
    scheduledTime: str = Field(..., description="Scheduled intake time in 24-hour HH:MM format", examples=["08:30"])
    medicineId: str = Field(..., description="Referenced Medicine ObjectId string")
    medicineName: str = Field(..., description="Resolved prescribed medicine name", examples=["Metformin"])
    dosage: str = Field(..., description="Prescribed dose strength or quantity", examples=["500"])
    dosageUnit: str = Field(..., description="Dosage unit of measurement", examples=["mg"])
    scheduleId: str = Field(..., description="Referenced Schedule ObjectId string")
    frequencyType: str = Field(..., description="Schedule frequency (daily, weekly, custom)")
    status: CalendarStatus = Field(default=CalendarStatus.PENDING, description="Intake status")
    activityId: Optional[str] = Field(None, description="Referenced MedicationActivity ObjectId if recorded")
    actionTime: Optional[datetime] = Field(None, description="Timestamp when intake action occurred")
    skipReason: Optional[str] = Field(None, description="Clinical reason provided if skipped")
    wasSnoozed: bool = Field(default=False, description="Indicates if dose was previously snoozed")
    snoozeCount: int = Field(default=0, description="Number of times dose was snoozed")

    model_config = {
        "from_attributes": True,
    }


class DaySummary(BaseModel):
    date: str = Field(..., description="Calendar date (YYYY-MM-DD)")
    status: DayAggregateStatus = Field(..., description="Aggregate adherence status for month grid")
    totalDoses: int = Field(default=0, description="Total expected doses scheduled on this day")
    takenCount: int = Field(default=0, description="Doses taken")
    skippedCount: int = Field(default=0, description="Doses skipped")
    snoozedCount: int = Field(default=0, description="Doses snoozed")
    pendingCount: int = Field(default=0, description="Doses pending intake")


class CalendarResponse(MedicalDisclaimerMixin):
    startDate: str = Field(..., description="Start of requested range (YYYY-MM-DD)")
    endDate: str = Field(..., description="End of requested range (YYYY-MM-DD)")
    occurrences: List[CalendarOccurrence] = Field(default_factory=list, description="All scheduled dose occurrences")
    days: List[DaySummary] = Field(default_factory=list, description="Day-by-day aggregate status summaries")
    daysSummary: List[DaySummary] = Field(default_factory=list, description="Alias for days summary")
    totalOccurrences: int = Field(default=0, description="Total scheduled occurrences in date range")
    takenCount: int = Field(default=0, description="Total taken occurrences")
    skippedCount: int = Field(default=0, description="Total skipped occurrences")
    snoozedCount: int = Field(default=0, description="Total snoozed occurrences")
    pendingCount: int = Field(default=0, description="Total pending occurrences")


class StreakResponse(MedicalDisclaimerMixin):
    currentStreak: int = Field(default=0, description="Consecutive adherent days up to evaluated date")
    longestStreak: int = Field(default=0, description="Maximum historical consecutive adherent days")
    totalAdherentDays: int = Field(default=0, description="Total days where all scheduled doses were taken")
    totalTrackedDays: int = Field(default=0, description="Total days with at least one scheduled dose")
    adherenceRule: str = Field(
        default="A day is adherent only when all scheduled medication occurrences for that day are Taken. Days with no scheduled doses are neutral. Skipped or incomplete doses break the streak.",
        description="Clinical definition of adherence rule applied"
    )
    lastAdherentDate: Optional[str] = Field(None, description="Most recent adherent calendar date (YYYY-MM-DD)")
    evaluatedDate: str = Field(..., description="Base date used for streak calculation (YYYY-MM-DD)")
