"""User authentication and profile Pydantic validation schemas."""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class UserRole(str, Enum):
    PATIENT = "patient"
    CAREGIVER = "caregiver"


class UserBase(BaseModel):
    email: EmailStr = Field(..., description="Unique user email address", examples=["user@example.com"])
    fullName: str = Field(..., min_length=2, max_length=100, description="Full legal or preferred name", examples=["Jane Doe"])
    role: UserRole = Field(default=UserRole.PATIENT, description="User role in MediTrack+")
    emergencyContact: Optional[str] = Field(None, max_length=50, description="Emergency phone or contact info", examples=["+1-555-0199"])
    healthConditions: Optional[List[str]] = Field(default_factory=list, description="Optional recorded health conditions (e.g. Hypertension)")


class UserRegister(BaseModel):
    fullName: str = Field(..., min_length=2, max_length=100, description="Full name")
    email: EmailStr = Field(..., description="Valid email address")
    password: str = Field(..., min_length=6, max_length=128, description="Password (at least 6 characters)")
    confirmPassword: str = Field(..., min_length=6, max_length=128, description="Password confirmation")
    role: UserRole = Field(default=UserRole.PATIENT, description="Role: patient or caregiver")
    emergencyContact: Optional[str] = Field(None, max_length=50, description="Optional emergency contact phone")

    @model_validator(mode="after")
    def verify_password_match(self) -> "UserRegister":
        if self.password != self.confirmPassword:
            raise ValueError("Passwords do not match.")
        return self


class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., min_length=1, description="Account password")


class UserUpdate(BaseModel):
    fullName: Optional[str] = Field(None, min_length=2, max_length=100)
    emergencyContact: Optional[str] = Field(None, max_length=50)
    healthConditions: Optional[List[str]] = Field(None, description="Updated health condition list")


class UserResponse(BaseModel):
    id: str = Field(..., description="User unique ObjectId string")
    email: EmailStr
    fullName: str
    role: UserRole
    emergencyContact: Optional[str] = None
    healthConditions: List[str] = Field(default_factory=list)
    createdAt: datetime
    updatedAt: datetime

    model_config = {
        "from_attributes": True,
    }


class TokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT Bearer access token")
    token_type: str = Field(default="bearer")
    user: UserResponse
