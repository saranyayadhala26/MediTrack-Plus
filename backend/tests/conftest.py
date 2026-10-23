"""Pytest test suite configuration and fixtures for MediTrack+."""

import pytest
from app.core.config import settings
from app.services.email_service import MockEmailService


@pytest.fixture(autouse=True)
def configure_test_environment(monkeypatch):
    """Ensure automated tests use MockEmailService in-memory recorder."""
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "mock")
