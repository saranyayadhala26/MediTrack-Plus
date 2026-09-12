"""Medication Adherence Report validation schemas (Phase 11).

Defines strongly typed domain and API response schemas for:
- Weekly and monthly adherence report summaries
- Medicine-level adherence breakdowns
- Day-by-day occurrence logs
- Historical streak summaries evaluated as of report endDate
- Medical disclaimers and export formats
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

from app.core.config import settings
from app.schemas.common import MedicalDisclaimerMixin


class ReportPeriod(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ReportDoseStatus(str, Enum):
    TAKEN = "taken"
    SKIPPED = "skipped"
    MISSED = "missed"
    SNOOZED_UNRESOLVED = "snoozed_unresolved"
    PENDING = "pending"


class ReportSummary(BaseModel):
    totalScheduled: int = Field(..., description="Total doses scheduled in the report period")
    takenCount: int = Field(..., description="Doses confirmed taken")
    skippedCount: int = Field(..., description="Doses confirmed skipped")
    missedCount: int = Field(..., description="Doses not taken within the allowed window")
    unresolvedSnoozedCount: int = Field(..., description="Doses currently snoozed without resolution")
    pendingCount: int = Field(..., description="Future scheduled doses not yet due")
    adherencePercentage: float = Field(..., description="Adherence percentage (Taken / TotalScheduled * 100)")
    hasScheduledDoses: bool = Field(..., description="True if period has at least one scheduled dose")


class ReportStreakSummary(BaseModel):
    currentStreak: int = Field(..., description="Consecutive adherent days ending on or before report endDate")
    longestStreak: int = Field(..., description="Longest consecutive adherent days in recorded history up to report endDate")
    totalAdherentDays: int = Field(..., description="Total days in recorded history with 100% adherence up to report endDate")
    totalTrackedDays: int = Field(..., description="Total days with scheduled doses up to report endDate")
    lastAdherentDate: Optional[str] = Field(None, description="Most recent adherent date (YYYY-MM-DD)")
    evaluatedDate: str = Field(..., description="Report endDate used as reference for streak calculation")


class ReportMedicineBreakdown(BaseModel):
    medicineId: str = Field(..., description="Medicine ObjectId as string")
    medicineName: str = Field(..., description="Prescribed medicine name")
    dosage: str = Field(..., description="Prescribed dose strength or quantity")
    dosageUnit: str = Field(default="tablet", description="Dosage unit of measurement")
    totalScheduled: int = Field(..., description="Total doses scheduled for this medicine in period")
    takenCount: int = Field(..., description="Confirmed taken doses")
    skippedCount: int = Field(..., description="Confirmed skipped doses")
    missedCount: int = Field(..., description="Missed doses")
    unresolvedSnoozedCount: int = Field(..., description="Unresolved snoozed doses")
    pendingCount: int = Field(..., description="Pending future doses")
    adherencePercentage: float = Field(..., description="Adherence percentage for this medicine")
    hasScheduledDoses: bool = Field(..., description="True if this medicine had scheduled doses in period")


class ReportDailySummary(BaseModel):
    date: str = Field(..., description="Calendar date (YYYY-MM-DD)")
    totalScheduled: int = Field(..., description="Total doses scheduled on this date")
    takenCount: int = Field(..., description="Confirmed taken doses on this date")
    skippedCount: int = Field(..., description="Confirmed skipped doses on this date")
    missedCount: int = Field(..., description="Missed doses on this date")
    unresolvedSnoozedCount: int = Field(..., description="Unresolved snoozed doses on this date")
    pendingCount: int = Field(..., description="Pending future doses on this date")
    adherencePercentage: float = Field(..., description="Adherence percentage for this date")
    hasScheduledDoses: bool = Field(..., description="True if doses were scheduled on this date")


class MedicationReportResponse(MedicalDisclaimerMixin):
    reportType: ReportPeriod = Field(..., description="Report period type (weekly or monthly)")
    startDate: str = Field(..., description="Report start date (YYYY-MM-DD)")
    endDate: str = Field(..., description="Report end date (YYYY-MM-DD)")
    generatedAt: datetime = Field(..., description="UTC timestamp when report was calculated")
    patientId: str = Field(..., description="Patient User ObjectId as string")
    patientName: str = Field(..., description="Patient full legal/display name")
    patientEmail: str = Field(..., description="Patient registered account email")
    summary: ReportSummary = Field(..., description="Overall adherence summary metrics")
    streak: ReportStreakSummary = Field(..., description="Historical adherence streak as of report endDate")
    medicines: List[ReportMedicineBreakdown] = Field(default_factory=list, description="Per-medicine adherence breakdown")
    dailySummaries: List[ReportDailySummary] = Field(default_factory=list, description="Day-by-day adherence log")
    medicalDisclaimer: str = Field(
        default=settings.MEDICAL_DISCLAIMER,
        description="Mandatory medical safety disclaimer"
    )

    model_config = {
        "from_attributes": True,
    }
