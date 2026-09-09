"""Health check response schemas."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="Overall service status (healthy/degraded)")
    environment: str = Field(..., description="Current running environment")
    version: str = Field(..., description="Application version")
    database_connected: bool = Field(..., description="True if MongoDB is reachable")
    medical_disclaimer: str = Field(..., description="Authoritative safety notice")
