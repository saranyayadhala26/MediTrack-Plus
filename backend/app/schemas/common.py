"""Common response schemas and medical disclaimer definitions."""

from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field
from app.core.config import settings

T = TypeVar("T")


class MedicalDisclaimerMixin(BaseModel):
    """Authoritative medical safety notice embedded into clinical/medication schemas."""
    medical_disclaimer: str = Field(
        default=settings.MEDICAL_DISCLAIMER,
        description="Mandatory medical safety warning"
    )


class ApiResponse(BaseModel, Generic[T]):
    """Standardized API response wrapper."""
    success: bool = Field(default=True, description="Indicates operation success")
    message: str = Field(default="Operation completed successfully", description="Human-readable message")
    data: Optional[T] = Field(default=None, description="Payload data")


class PaginatedListResponse(BaseModel, Generic[T]):
    """Standardized paginated list response."""
    items: List[T] = Field(default_factory=list, description="List of items")
    total: int = Field(default=0, description="Total number of items")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=20, description="Items per page")
