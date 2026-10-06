"""Unit and integration tests for Email Verification OTP & Password Reset OTP (Batch 1)."""

from datetime import datetime, timedelta, timezone
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.db.mongodb import get_users_collection
from app.main import app
from app.models.collections import now_utc
from app.services.email_service import get_email_service


def unique_email(prefix: str = "verify") -> str:
    """Generate a unique test email address."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.mark.asyncio
async def test_registration_dispatches_email_verification_otp():
    """1. Registration creates unverified user and dispatches 6-digit OTP email."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("reg_otp")
        email_svc = get_email_service()
        email_svc.clear()

        res = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Jane Verification",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["user"]["email"] == email
        assert data["user"]["isEmailVerified"] is False

        # Verify email was dispatched via email service
        last_msg = email_svc.get_last_message()
        assert last_msg is not None
        assert last_msg.recipient == email
        assert "Verify Your Email" in last_msg.subject

        # Verify OTP is stored as a hash (never plaintext) in MongoDB
        users_coll = get_users_collection()
        user_doc = await users_coll.find_one({"email": email})
        assert user_doc is not None
        assert user_doc["isEmailVerified"] is False
        assert user_doc["emailVerificationOtpHash"] is not None
        assert user_doc["emailVerificationExpiresAt"] is not None


@pytest.mark.asyncio
async def test_valid_otp_verifies_email():
    """2. Submitting correct 6-digit OTP verifies account and returns valid token."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("valid_otp")
        email_svc = get_email_service()
        email_svc.clear()

        # Register
        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "John Valid",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )

        # Extract OTP from mock email message subject
        last_msg = email_svc.get_last_message()
        assert last_msg is not None
        # Subject format: "[MediTrack+] Verify Your Email — Code: 123456"
        otp_code = last_msg.subject.split("Code: ")[-1].strip()
        assert len(otp_code) == 6

        # Submit OTP to verify endpoint
        res = await client.post(
            "/api/v1/auth/verify-email-otp",
            json={"email": email, "code": otp_code},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["isEmailVerified"] is True
        assert data["access_token"] is not None
        assert data["user"]["isEmailVerified"] is True

        # Verify DB document updated
        users_coll = get_users_collection()
        user_doc = await users_coll.find_one({"email": email})
        assert user_doc["isEmailVerified"] is True
        assert user_doc.get("emailVerificationOtpHash") is None


@pytest.mark.asyncio
async def test_already_verified_email_returns_success():
    """3. Verifying an already verified account returns 200 with informative message."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("already_v")
        email_svc = get_email_service()
        email_svc.clear()

        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Already Verified",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        otp_code = email_svc.get_last_message().subject.split("Code: ")[-1].strip()

        # First verification
        await client.post(
            "/api/v1/auth/verify-email-otp",
            json={"email": email, "code": otp_code},
        )

        # Second verification attempt
        res2 = await client.post(
            "/api/v1/auth/verify-email-otp",
            json={"email": email, "code": otp_code},
        )
        assert res2.status_code == 200
        assert res2.json()["isEmailVerified"] is True
        assert "already verified" in res2.json()["message"].lower()


@pytest.mark.asyncio
async def test_invalid_otp_rejected():
    """4. Submitting incorrect OTP is rejected with HTTP 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("invalid_otp")

        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Invalid OTP",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )

        # Submit wrong code
        res = await client.post(
            "/api/v1/auth/verify-email-otp",
            json={"email": email, "code": "999999"},
        )
        assert res.status_code == 400
        assert "invalid" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_expired_otp_rejected():
    """5. Expired verification code is rejected with HTTP 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("expired_otp")
        email_svc = get_email_service()

        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Expired OTP",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        otp_code = email_svc.get_last_message().subject.split("Code: ")[-1].strip()

        # Manually expire the code in DB
        users_coll = get_users_collection()
        past_time = now_utc() - timedelta(minutes=15)
        await users_coll.update_one(
            {"email": email},
            {"$set": {"emailVerificationExpiresAt": past_time}},
        )

        res = await client.post(
            "/api/v1/auth/verify-email-otp",
            json={"email": email, "code": otp_code},
        )
        assert res.status_code == 400
        assert "expired" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_max_failed_attempts_invalidates_code():
    """6. Exceeding 5 failed attempts permanently invalidates the verification code."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("max_attempts")
        email_svc = get_email_service()

        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Max Attempts",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        real_otp = email_svc.get_last_message().subject.split("Code: ")[-1].strip()

        # Fail 5 times
        for _ in range(5):
            await client.post(
                "/api/v1/auth/verify-email-otp",
                json={"email": email, "code": "000000"},
            )

        # Real OTP should now be rejected as invalidated
        res = await client.post(
            "/api/v1/auth/verify-email-otp",
            json={"email": email, "code": real_otp},
        )
        assert res.status_code == 400
        assert "too many failed attempts" in res.json()["detail"].lower() or "no active" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_cooldown_rate_limiting():
    """7. Resending OTP enforces 60-second cooldown."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("resend_cd")

        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Resend Cooldown",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )

        # Attempting to resend immediately triggers 429 cooldown
        res = await client.post(
            "/api/v1/auth/resend-verification-otp",
            json={"email": email},
        )
        assert res.status_code == 429
        assert "wait" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_reset_otp_endpoint_and_password_reset_flow():
    """8. Test Feature 2: intermediate verify-reset-otp endpoint and password reset flow."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("reset_otp_flow")
        email_svc = get_email_service()
        email_svc.clear()

        # 1. Register user
        old_password = "OldPassword123!"
        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Reset Flow User",
                "email": email,
                "password": old_password,
                "confirmPassword": old_password,
                "role": "patient",
            },
        )

        # 2. Request forgot password code
        forgot_res = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": email},
        )
        assert forgot_res.status_code == 200

        last_msg = email_svc.get_last_message()
        assert last_msg is not None
        reset_otp = last_msg.subject.split("Code: ")[-1].strip()
        assert len(reset_otp) == 6

        # 3. Test invalid code on verify-reset-otp
        bad_verify = await client.post(
            "/api/v1/auth/verify-reset-otp",
            json={"email": email, "code": "000000"},
        )
        assert bad_verify.status_code == 400
        assert "invalid" in bad_verify.json()["detail"].lower()

        # 4. Test valid code on verify-reset-otp
        good_verify = await client.post(
            "/api/v1/auth/verify-reset-otp",
            json={"email": email, "code": reset_otp},
        )
        assert good_verify.status_code == 200
        assert good_verify.json()["valid"] is True

        # 5. Complete password reset with new password
        new_password = "BrandNewPassword123!"
        reset_res = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": reset_otp,
                "newPassword": new_password,
                "confirmNewPassword": new_password,
            },
        )
        assert reset_res.status_code == 200

        # 6. Verify old password fails login
        old_login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": old_password},
        )
        assert old_login.status_code == 401

        # 7. Verify new password succeeds login
        new_login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": new_password},
        )
        assert new_login.status_code == 200
        assert new_login.json()["access_token"] is not None
