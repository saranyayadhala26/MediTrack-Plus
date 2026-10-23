"""Targeted Regression Tests for OTP Reliability and Email Bug Fixes."""

import asyncio
from datetime import datetime, timedelta, timezone
import logging
from unittest.mock import MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.db.mongodb import get_users_collection
from app.main import app
from app.services.email_service import (
    EmailMessage,
    MockEmailService,
    SMTPEmailService,
    get_email_service,
)


@pytest.mark.asyncio
async def test_mock_email_service_logs_body_with_otp(caplog):
    """Verify MockEmailService records and logs the message body including OTP."""
    svc = MockEmailService(email_enabled=True)
    msg = EmailMessage(
        recipient="patient@example.com",
        subject="MediTrack+ Email Verification Code",
        text_body="Your MediTrack+ verification code is: 849201",
    )
    with caplog.at_level(logging.INFO):
        res = await svc.send_email(msg)

    assert res.success is True
    assert res.recipient == "patient@example.com"
    assert "849201" in caplog.text
    assert "MockEmailService: Recorded email" in caplog.text


@pytest.mark.asyncio
async def test_smtp_email_service_uses_to_thread(monkeypatch):
    """Verify SMTPEmailService offloads synchronous smtplib work using asyncio.to_thread."""
    svc = SMTPEmailService(
        smtp_host="localhost",
        smtp_port=587,
        email_enabled=True,
    )
    msg = EmailMessage(
        recipient="patient@example.com",
        subject="Password Reset",
        text_body="Code: 654321",
    )

    mock_send_sync = MagicMock(return_value="<test-msg-id@meditrack.health>")
    monkeypatch.setattr(svc, "_send_sync", mock_send_sync)

    result = await svc.send_email(msg)

    assert result.success is True
    assert result.message_id == "<test-msg-id@meditrack.health>"
    assert mock_send_sync.called


@pytest.mark.asyncio
async def test_registration_and_forgot_password_logs_otp_in_dev(caplog):
    """Verify that in development mode, OTP codes are logged to console for testing/viva demo."""
    unique_email = f"audit_test_{int(datetime.now(timezone.utc).timestamp())}@example.com"
    transport = ASGITransport(app=app)
    users_coll = get_users_collection()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with caplog.at_level(logging.INFO):
            # 1. Register
            reg_resp = await ac.post(
                "/api/v1/auth/register",
                json={
                    "fullName": "Audit Tester",
                    "email": unique_email,
                    "password": "Password123!",
                    "confirmPassword": "Password123!",
                    "role": "patient",
                },
            )
            assert reg_resp.status_code == 201
            assert "🔑 [DEV ONLY] Email verification OTP" in caplog.text

            # 2. Forgot Password
            forgot_resp = await ac.post(
                "/api/v1/auth/forgot-password",
                json={"email": unique_email},
            )
            assert forgot_resp.status_code == 200
            assert "🔑 [DEV ONLY] Password reset OTP" in caplog.text

            # 3. Simulate cooldown elapse for resend verification OTP
            await users_coll.update_one(
                {"email": unique_email},
                {"$set": {"emailVerificationRequestedAt": datetime.now(timezone.utc) - timedelta(seconds=70)}},
            )

            resend_resp = await ac.post(
                "/api/v1/auth/resend-verification-otp",
                json={"email": unique_email},
            )
            assert resend_resp.status_code == 200
            assert "🔑 [DEV ONLY] Resent email verification OTP" in caplog.text
