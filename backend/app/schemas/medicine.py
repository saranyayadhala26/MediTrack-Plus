"""Medicine validation schemas for CRUD operations."""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.common import MedicalDisclaimerMixin


class DosageUnit(str, Enum):
    MG = "mg"
    ML = "ml"
    TABLET = "tablet"
    CAPSULE = "capsule"
    DROP = "drop"
    PUFF = "puff"
    UNIT = "unit"
    OTHER = "other"


class MedicineBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150, description="Name of the prescribed medicine", examples=["Amoxicillin"])
    dosage: str = Field(..., min_length=1, max_length=50, description="Dosage quantity or strength", examples=["500"])
    dosageUnit: DosageUnit = Field(default=DosageUnit.MG, description="Unit of measurement", examples=["mg"])
    frequency: str = Field(..., min_length=1, max_length=100, description="Prescribed frequency", examples=["Twice daily"])
    instructions: Optional[str] = Field(None, max_length=500, description="Prescription intake instructions", examples=["Take after meals with a full glass of water"])
    startDate: Optional[str] = Field(None, description="Start date in YYYY-MM-DD format", examples=["2026-09-10"])
    endDate: Optional[str] = Field(None, description="End date in YYYY-MM-DD format", examples=["2026-09-20"])
    inventory: Optional[int] = Field(None, ge=0, description="Current supply inventory count", examples=[30])
    refillThreshold: Optional[int] = Field(None, ge=0, description="Refill reminder alert threshold", examples=[5])

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Medicine name cannot be empty or whitespace.")
        return stripped

    @field_validator("dosage")
    @classmethod
    def strip_dosage(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Dosage cannot be empty or whitespace.")
        return stripped

    @field_validator("frequency")
    @classmethod
    def strip_frequency(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Frequency cannot be empty or whitespace.")
        return stripped

    @model_validator(mode="after")
    def validate_date_range(self) -> "MedicineBase":
        if self.startDate and self.endDate:
            if self.endDate < self.startDate:
                raise ValueError("End date must be greater than or equal to start date.")
        return self


class MedicineCreate(MedicineBase):
    pass


class MedicineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    dosage: Optional[str] = Field(None, min_length=1, max_length=50)
    dosageUnit: Optional[DosageUnit] = None
    frequency: Optional[str] = Field(None, min_length=1, max_length=100)
    instructions: Optional[str] = Field(None, max_length=500)
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    inventory: Optional[int] = Field(None, ge=0)
    refillThreshold: Optional[int] = Field(None, ge=0)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Medicine name cannot be empty or whitespace.")
            return stripped
        return v

    @field_validator("dosage")
    @classmethod
    def strip_dosage(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Dosage cannot be empty or whitespace.")
            return stripped
        return v

    @field_validator("frequency")
    @classmethod
    def strip_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Frequency cannot be empty or whitespace.")
            return stripped
        return v

    @model_validator(mode="after")
    def validate_date_range(self) -> "MedicineUpdate":
        if self.startDate and self.endDate:
            if self.endDate < self.startDate:
                raise ValueError("End date must be greater than or equal to start date.")
        return self


class MedicineResponse(MedicineBase, MedicalDisclaimerMixin):
    id: str = Field(..., description="Medicine unique identifier string")
    userId: str = Field(..., description="Owner patient user ID")
    createdAt: datetime
    updatedAt: datetime

    model_config = {
        "from_attributes": True,
    }


class MedicineListResponse(MedicalDisclaimerMixin):
    items: List[MedicineResponse] = Field(default_factory=list)
    total: int = 0


class MedicineDeleteResponse(MedicalDisclaimerMixin):
    message: str = Field(default="Medicine deleted successfully")
    id: str
