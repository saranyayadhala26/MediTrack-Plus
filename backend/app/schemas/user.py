"""User authentication and profile Pydantic validation schemas."""

from datetime import datetime
from enum import Enum
from typing import Any, List, Optional, Union
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class UserRole(str, Enum):
    PATIENT = "patient"
    CAREGIVER = "caregiver"


class NotificationPreferences(BaseModel):
    medicationRemindersEnabled: bool = Field(
        default=True,
        description="Enable local medication reminder alarms",
    )
    emailReportsEnabled: bool = Field(
        default=False,
        description="Enable scheduled weekly and monthly adherence summary reports via registered account email",
    )
    emailAlertsEnabled: bool = Field(
        default=False,
        description="Enable missed-dose alerts via registered account email (for caregivers)",
    )

    model_config = {
        "extra": "forbid",
    }


class NotificationPreferencesUpdate(BaseModel):
    medicationRemindersEnabled: Optional[bool] = Field(
        default=None,
        description="Enable local medication reminder alarms",
    )
    emailReportsEnabled: Optional[bool] = Field(
        default=None,
        description="Enable scheduled weekly and monthly adherence summary reports via registered account email",
    )
    emailAlertsEnabled: Optional[bool] = Field(
        default=None,
        description="Enable missed-dose alerts via registered account email (for caregivers)",
    )

    model_config = {
        "extra": "forbid",
    }


class UserBase(BaseModel):
    email: EmailStr = Field(..., description="Unique user email address", examples=["user@example.com"])
    fullName: str = Field(..., min_length=2, max_length=100, description="Full legal or preferred name", examples=["Jane Doe"])
    role: UserRole = Field(default=UserRole.PATIENT, description="User role in MediTrack+")
    phone: Optional[str] = Field(None, max_length=30, description="Phone contact number", examples=["+1-555-0100"])
    emergencyContact: Optional[str] = Field(None, max_length=50, description="Emergency phone or contact info", examples=["+1-555-0199"])
    healthConditions: Optional[List[str]] = Field(default_factory=list, description="Optional recorded health conditions (e.g. Hypertension)")
    notificationPreferences: NotificationPreferences = Field(default_factory=NotificationPreferences, description="User notification preferences")

    @field_validator("notificationPreferences", mode="before")
    @classmethod
    def ensure_notification_preferences(cls, v: Any) -> Any:
        if v is None:
            return NotificationPreferences()
        if isinstance(v, dict):
            return NotificationPreferences(
                medicationRemindersEnabled=v.get("medicationRemindersEnabled", True),
                emailReportsEnabled=v.get("emailReportsEnabled", False),
                emailAlertsEnabled=v.get("emailAlertsEnabled", False),
            )
        return v


class UserRegister(BaseModel):
    fullName: str = Field(..., min_length=2, max_length=100, description="Full name")
    email: EmailStr = Field(..., description="Valid email address")
    password: str = Field(..., min_length=6, max_length=128, description="Password (at least 6 characters)")
    confirmPassword: str = Field(..., min_length=6, max_length=128, description="Password confirmation")
    role: UserRole = Field(default=UserRole.PATIENT, description="Role: patient or caregiver")
    phone: Optional[str] = Field(None, max_length=30, description="Optional phone contact number")
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
    phone: Optional[str] = Field(None, max_length=30)
    emergencyContact: Optional[str] = Field(None, max_length=50)
    healthConditions: Optional[List[str]] = Field(None, description="Updated health condition list")
    notificationPreferences: Optional[NotificationPreferencesUpdate] = Field(None, description="Updated notification preferences")

    model_config = {
        "extra": "forbid",
    }


class PasswordChange(BaseModel):
    currentPassword: str = Field(..., min_length=1, description="Current plaintext password")
    newPassword: str = Field(..., min_length=6, max_length=128, description="New password (at least 6 characters)")
    confirmNewPassword: str = Field(..., min_length=6, max_length=128, description="Password confirmation")

    @model_validator(mode="after")
    def verify_password_rules(self) -> "PasswordChange":
        if self.newPassword != self.confirmNewPassword:
            raise ValueError("New passwords do not match.")
        if self.currentPassword == self.newPassword:
            raise ValueError("New password cannot be the same as the current password.")
        return self


class UserResponse(BaseModel):
    id: str = Field(..., description="User unique ObjectId string")
    email: EmailStr
    fullName: str
    role: UserRole
    phone: Optional[str] = None
    emergencyContact: Optional[str] = None
    healthConditions: List[str] = Field(default_factory=list)
    notificationPreferences: NotificationPreferences = Field(default_factory=NotificationPreferences)
    createdAt: datetime
    updatedAt: datetime

    @field_validator("notificationPreferences", mode="before")
    @classmethod
    def ensure_notification_preferences(cls, v: Any) -> Any:
        if v is None:
            return NotificationPreferences()
        if isinstance(v, dict):
            return NotificationPreferences(
                medicationRemindersEnabled=v.get("medicationRemindersEnabled", True),
                emailReportsEnabled=v.get("emailReportsEnabled", False),
                emailAlertsEnabled=v.get("emailAlertsEnabled", False),
            )
        return v

    model_config = {
        "from_attributes": True,
    }


class TokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT Bearer access token")
    token_type: str = Field(default="bearer")
    user: UserResponse
