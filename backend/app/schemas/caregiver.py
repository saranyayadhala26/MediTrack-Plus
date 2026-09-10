"""Caregiver relationship and monitoring validation schemas."""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import MedicalDisclaimerMixin


class CaregiverStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"
    REVOKED = "revoked"


class CaregiverBase(BaseModel):
    caregiverName: str = Field(..., min_length=2, max_length=100, description="Caregiver full name", examples=["Dr. John Smith"])
    caregiverEmail: EmailStr = Field(..., description="Caregiver contact email address", examples=["caregiver@example.com"])
    caregiverPhone: str = Field(..., min_length=5, max_length=30, description="Caregiver phone number", examples=["+1-555-0144"])
    relationship: str = Field(..., min_length=2, max_length=50, description="Relationship to patient", examples=["Daughter"])


class CaregiverCreate(CaregiverBase):
    pass


class CaregiverUpdate(BaseModel):
    caregiverName: Optional[str] = Field(None, min_length=2, max_length=100)
    caregiverPhone: Optional[str] = Field(None, min_length=5, max_length=30)
    relationship: Optional[str] = Field(None, min_length=2, max_length=50)
    status: Optional[CaregiverStatus] = None


class CaregiverResponse(CaregiverBase):
    id: str = Field(..., description="Caregiver link unique identifier")
    patientId: str = Field(..., description="Associated patient user ID")
    status: CaregiverStatus = CaregiverStatus.ACTIVE
    permissionsNote: str = Field(
        default="Permitted: Read-only adherence monitoring. Prohibited: Modifying prescriptions or schedules.",
        description="Caregiver permission scope enforcement notice"
    )
    createdAt: datetime
    updatedAt: datetime

    model_config = {
        "from_attributes": True,
    }


class CaregiverAlert(BaseModel):
    patientId: str
    patientName: str
    medicineName: str
    missedDosesCount: int
    scheduledTimes: List[str]
    alertMessage: str
    timestamp: datetime


class LinkedPatientResponse(BaseModel):
    patientId: str = Field(..., description="Unique ID of the linked patient")
    fullName: str = Field(..., description="Patient full name")
    email: EmailStr = Field(..., description="Patient email address")
    emergencyContact: Optional[str] = Field(None, description="Patient emergency contact phone number")
    relationship: str = Field(..., description="Relationship to patient (e.g. Father, Daughter)")
    status: str = Field(default="active", description="Relationship status")
    linkedAt: datetime = Field(..., description="Timestamp when relationship was established")

    model_config = {
        "from_attributes": True,
    }


class CaregiverMonitoringSummary(MedicalDisclaimerMixin, BaseModel):
    patientId: str
    patientName: str
    adherencePercentage: float
    totalScheduledToday: int
    takenToday: int
    skippedToday: int
    missedToday: int
    recentAlerts: List[CaregiverAlert] = Field(default_factory=list)
    permissionsNote: str = "Read-only access. Prescription and schedule modifications are strictly prohibited."
    currentStreak: Optional[int] = Field(default=0, description="Current consecutive adherent days")
    longestStreak: Optional[int] = Field(default=0, description="Longest historical streak")

