"""Application configuration module using Pydantic Settings."""

import os
from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "MediTrack+ Backend API"
    PROJECT_TITLE: str = "MediTrack+: Smart Medication Management & Adherence Platform"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # MongoDB Atlas Configuration
    MONGODB_URI: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "meditrack_plus"

    # Authentication & Security
    JWT_SECRET_KEY: str = "meditrack_dev_secret_key_super_secure_replace_in_production_2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Business Rules
    CAREGIVER_MISSED_THRESHOLD: int = 2  # Repeated missed dose alert threshold

    # Email & Alerts Configuration (Phase 11 & 12.3)
    EMAIL_BACKEND: str = "mock"  # "smtp" or "mock"
    EMAIL_ENABLED: bool = True
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT: int = 15
    EMAIL_FROM_EMAIL: str = "noreply@meditrack.health"
    EMAIL_FROM_NAME: str = "MediTrack+ Medication Safety"

    # Automation Security: Defaults to None; fails closed if unset
    CRON_SECRET_KEY: Optional[str] = None

    # Password Recovery & Abuse Protection (Phase 12.1)
    RESET_TOKEN_EXPIRE_MINUTES: int = 15
    RESET_TOKEN_MAX_ATTEMPTS: int = 5
    RESET_RATE_LIMIT_PER_HOUR: int = 3
    RESET_TOKEN_PEPPER: Optional[str] = None

    def get_reset_token_pepper(self) -> str:
        """Return server-side pepper for HMAC-SHA256 OTP hashing."""
        if self.RESET_TOKEN_PEPPER:
            return self.RESET_TOKEN_PEPPER
        if self.ENVIRONMENT == "production":
            raise ValueError("RESET_TOKEN_PEPPER must be explicitly configured in production.")
        return "dev_reset_token_pepper_secret_key_2026"

    # Medical Safety Notice
    MEDICAL_DISCLAIMER: str = (
        "MediTrack+ is a medication management and reminder application. "
        "It does not provide medical advice, diagnosis, or treatment recommendations. "
        "All medication schedules and details must be prescribed by a licensed healthcare professional."
    )

    # CORS Settings
    CORS_ORIGINS: Union[List[str], str] = ["*"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
