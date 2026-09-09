"""Pydantic validation schemas package for MediTrack+."""

from app.schemas.common import (
    ApiResponse,
    MedicalDisclaimerMixin,
    PaginatedListResponse,
)
from app.schemas.health import HealthResponse
from app.schemas.user import (
    TokenResponse,
    UserBase,
    UserLogin,
    UserRegister,
    UserResponse,
    UserRole,
    UserUpdate,
)
from app.schemas.medicine import (
    DosageUnit,
    MedicineBase,
    MedicineCreate,
    MedicineListResponse,
    MedicineResponse,
    MedicineUpdate,
)
from app.schemas.schedule import (
    FrequencyType,
    ScheduleBase,
    ScheduleCreate,
    ScheduleListResponse,
    ScheduleResponse,
    ScheduleUpdate,
)
from app.schemas.activity import (
    ActionType,
    ActivityCreate,
    ActivityResponse,
    AdherenceCalculationDetails,
    DailyProgressResponse,
    PredefinedSkipReason,
    StreakResponse,
)
from app.schemas.caregiver import (
    CaregiverAlert,
    CaregiverBase,
    CaregiverCreate,
    CaregiverMonitoringSummary,
    CaregiverResponse,
    CaregiverStatus,
    CaregiverUpdate,
)
from app.schemas.notification import (
    NotificationBase,
    NotificationCreate,
    NotificationListResponse,
    NotificationResponse,
    NotificationStatus,
    NotificationType,
)

__all__ = [
    # Common & Health
    "ApiResponse",
    "MedicalDisclaimerMixin",
    "PaginatedListResponse",
    "HealthResponse",
    # User
    "UserRole",
    "UserBase",
    "UserRegister",
    "UserLogin",
    "UserUpdate",
    "UserResponse",
    "TokenResponse",
    # Medicine
    "DosageUnit",
    "MedicineBase",
    "MedicineCreate",
    "MedicineUpdate",
    "MedicineResponse",
    "MedicineListResponse",
    # Schedule
    "FrequencyType",
    "ScheduleBase",
    "ScheduleCreate",
    "ScheduleUpdate",
    "ScheduleResponse",
    "ScheduleListResponse",
    # Activity & Adherence
    "ActionType",
    "PredefinedSkipReason",
    "ActivityCreate",
    "ActivityResponse",
    "DailyProgressResponse",
    "AdherenceCalculationDetails",
    "StreakResponse",
    # Caregiver
    "CaregiverStatus",
    "CaregiverBase",
    "CaregiverCreate",
    "CaregiverUpdate",
    "CaregiverResponse",
    "CaregiverAlert",
    "CaregiverMonitoringSummary",
    # Notification
    "NotificationType",
    "NotificationStatus",
    "NotificationBase",
    "NotificationCreate",
    "NotificationResponse",
    "NotificationListResponse",
]
