"""Comprehensive unit and integration tests for Phase 12.1: Production Password Recovery.

Covers all 26 required scenarios:
1. Forgot password for registered email -> HTTP 200
2. Forgot password for unregistered email -> same HTTP 200 response
3. No email enumeration (identical payload and status code)
4. Reset email generated through MockEmailService
5. OTP is never returned by API
6. OTP is not stored plaintext in MongoDB
7. Valid OTP successfully resets password
8. Expired OTP rejected (HTTP 400)
9. Incorrect OTP rejected (HTTP 400)
10. Incorrect OTP increments attempts counter
11. Fifth failed attempt behavior (invalidates code)
12. OTP cannot be reused after successful reset
13. Old password no longer works for login (HTTP 401)
14. New password works for login (HTTP 200)
15. Existing JWT is invalid after password reset (session invalidation)
16. New login receives valid JWT that works with /auth/me
17. Forgot-password rate limit works (max 3 / hour per email)
18. Rate limit does not reveal account existence (returns same generic response)
19. Invalid email validation (HTTP 422)
20. Invalid OTP format (non-numeric or not 6 digits -> HTTP 422)
21. Password confirmation mismatch (HTTP 422)
22. Password below minimum length (< 8 characters -> HTTP 422)
23. Security email is generated after successful reset
24. Email delivery failure does not roll back successful password reset
25. Patient and caregiver accounts both work with reset flow
26. Reset fields are absent from UserResponse
+ Concurrency-safe atomic rate limiting test under simultaneous requests
"""

import asyncio
from datetime import datetime, timedelta, timezone
import re
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch

from app.core.config import settings
from app.core.security import hash_reset_otp
from app.db.mongodb import get_users_collection
from app.main import app
from app.services.email_service import MockEmailService, get_email_service
from app.services.rate_limiter import rate_limiter


def unique_email(prefix: str = "recov") -> str:
    """Generate a unique test email address."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_user(
    client: AsyncClient,
    email: str,
    role: str = "patient",
    password: str = "InitialPassword123!",
):
    """Helper to register a user for recovery tests."""
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "fullName": f"Test {role.capitalize()}",
            "email": email,
            "password": password,
            "confirmPassword": password,
            "role": role,
            "phone": "+1-555-0100",
            "emergencyContact": "+1-555-0199" if role == "patient" else None,
        },
    )
    assert res.status_code == 201
    return res.json()


# ============================================================================
# Test 1, 2, 3, 4, 5, 6: Forgot Password Request & OTP Security
# ============================================================================

@pytest.mark.asyncio
async def test_forgot_password_registered_and_unregistered_identical():
    """Verify forgot-password returns identical HTTP 200 response with no email enumeration."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg_email = unique_email("reg_user")
        unreg_email = unique_email("unreg_user")
        await register_user(client, reg_email)

        # Registered user
        res_reg = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": reg_email},
        )
        assert res_reg.status_code == 200
        data_reg = res_reg.json()

        # Unregistered user
        res_unreg = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": unreg_email},
        )
        assert res_unreg.status_code == 200
        data_unreg = res_unreg.json()

        # Responses must be identical (enumeration prevention)
        assert data_reg == data_unreg
        assert "password reset instructions" in data_reg["message"].lower()

        # OTP is NEVER returned in response
        assert "code" not in data_reg
        assert "otp" not in data_reg
        assert "token" not in data_reg


@pytest.mark.asyncio
async def test_forgot_password_email_and_hash_storage():
    """Verify reset email is dispatched and plaintext OTP is never stored in DB."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("otp_store")
        await register_user(client, email)

        # Clear mock email service
        email_svc = get_email_service()
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()

        res = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": email},
        )
        assert res.status_code == 200

        # Verify email was captured by MockEmailService
        if isinstance(email_svc, MockEmailService):
            sent = email_svc.get_sent_messages()
            assert len(sent) >= 1
            last_msg = sent[-1]
            assert last_msg.recipient == email
            assert "[MediTrack+] Your Password Reset Code" in last_msg.subject

            # Extract 6-digit OTP from message text body
            match = re.search(r"\b(\d{6})\b", last_msg.text_body)
            assert match is not None
            plain_otp = match.group(1)
            assert len(plain_otp) == 6

            # Verify MongoDB document
            users_coll = get_users_collection()
            user_doc = await users_coll.find_one({"email": email})
            assert user_doc is not None

            # OTP must NOT be stored in plaintext
            assert "passwordResetOtp" not in user_doc
            assert user_doc.get("passwordResetOtpHash") is not None
            assert user_doc["passwordResetOtpHash"] != plain_otp

            # Verify stored hash matches HMAC-SHA256 with pepper
            pepper = settings.get_reset_token_pepper()
            expected_hash = hash_reset_otp(plain_otp, pepper)
            assert user_doc["passwordResetOtpHash"] == expected_hash
            assert user_doc.get("passwordResetExpiresAt") is not None


# ============================================================================
# Test 7, 13, 14: Valid OTP Password Reset & Login
# ============================================================================

@pytest.mark.asyncio
async def test_valid_otp_resets_password_and_new_password_works():
    """Verify valid OTP resets password, old password fails, and new password works."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("valid_reset")
        old_pwd = "InitialPassword123!"
        new_pwd = "NewSecurePassword456!"
        await register_user(client, email, password=old_pwd)

        # Request reset
        email_svc = get_email_service()
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()

        await client.post("/api/v1/auth/forgot-password", json={"email": email})

        # Extract OTP from mock email
        plain_otp = None
        if isinstance(email_svc, MockEmailService):
            match = re.search(r"\b(\d{6})\b", email_svc.get_last_message().text_body)
            plain_otp = match.group(1)

        assert plain_otp is not None

        # Reset password
        res_reset = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": plain_otp,
                "newPassword": new_pwd,
                "confirmNewPassword": new_pwd,
            },
        )
        assert res_reset.status_code == 200
        assert "successfully" in res_reset.json()["message"].lower()

        # Old password must no longer work (401)
        res_old_login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": old_pwd},
        )
        assert res_old_login.status_code == 401

        # New password must work (200)
        res_new_login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": new_pwd},
        )
        assert res_new_login.status_code == 200
        assert "access_token" in res_new_login.json()


# ============================================================================
# Test 8: Expired OTP Rejected
# ============================================================================

@pytest.mark.asyncio
async def test_expired_otp_rejected():
    """Verify expired OTP code is rejected with HTTP 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("expired_otp")
        await register_user(client, email)

        await client.post("/api/v1/auth/forgot-password", json={"email": email})

        # Artificially expire the reset code in MongoDB
        users_coll = get_users_collection()
        past_time = datetime.now(timezone.utc) - timedelta(minutes=20)
        await users_coll.update_one(
            {"email": email},
            {"$set": {"passwordResetExpiresAt": past_time}},
        )

        res = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": "123456",
                "newPassword": "BrandNewPassword123!",
                "confirmNewPassword": "BrandNewPassword123!",
            },
        )
        assert res.status_code == 400
        assert "expired" in res.json()["detail"].lower()


# ============================================================================
# Test 9, 10, 11: Failed Attempts Counter & 5th Attempt Invalidation
# ============================================================================

@pytest.mark.asyncio
async def test_incorrect_otp_increments_attempts_and_5th_invalidates():
    """Verify incorrect OTP increments attempts counter, and 5th attempt invalidates code."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("attempts_test")
        await register_user(client, email)

        await client.post("/api/v1/auth/forgot-password", json={"email": email})

        users_coll = get_users_collection()

        # Attempts 1, 2, 3, 4: should fail with invalid reset code
        for attempt in range(1, 5):
            res = await client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": email,
                    "code": "000000",
                    "newPassword": "NewPassword123!",
                    "confirmNewPassword": "NewPassword123!",
                },
            )
            assert res.status_code == 400
            assert "invalid reset code" in res.json()["detail"].lower()

            user_doc = await users_coll.find_one({"email": email})
            assert user_doc["passwordResetAttempts"] == attempt

        # 5th attempt: should invalidate reset request
        res_5 = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": "000000",
                "newPassword": "NewPassword123!",
                "confirmNewPassword": "NewPassword123!",
            },
        )
        assert res_5.status_code == 400
        assert "too many failed attempts" in res_5.json()["detail"].lower()

        # Verify code fields were wiped in MongoDB
        user_doc_after = await users_coll.find_one({"email": email})
        assert user_doc_after.get("passwordResetOtpHash") is None
        assert user_doc_after.get("passwordResetExpiresAt") is None


# ============================================================================
# Test 12: Single-Use OTP Enforcement
# ============================================================================

@pytest.mark.asyncio
async def test_otp_single_use_enforcement():
    """Verify OTP cannot be reused after successful reset."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("single_use")
        await register_user(client, email)

        email_svc = get_email_service()
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()

        await client.post("/api/v1/auth/forgot-password", json={"email": email})

        match = re.search(r"\b(\d{6})\b", email_svc.get_last_message().text_body)
        otp = match.group(1)

        # 1st reset succeeds
        res1 = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": otp,
                "newPassword": "FirstNewPassword123!",
                "confirmNewPassword": "FirstNewPassword123!",
            },
        )
        assert res1.status_code == 200

        # 2nd reset with same OTP must fail
        res2 = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": otp,
                "newPassword": "SecondNewPassword123!",
                "confirmNewPassword": "SecondNewPassword123!",
            },
        )
        assert res2.status_code == 400
        assert "invalid" in res2.json()["detail"].lower() or "no active" in res2.json()["detail"].lower()


# ============================================================================
# Test 15, 16: Session Invalidation (tokenVersion)
# ============================================================================

@pytest.mark.asyncio
async def test_existing_jwt_invalidated_after_password_reset():
    """Verify JWT issued before password reset is rejected by get_current_user after reset."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("session_inv")
        old_pwd = "InitialPassword123!"
        new_pwd = "UpdatedPassword456!"
        reg = await register_user(client, email, password=old_pwd)
        old_token = reg["access_token"]

        # Token works before reset
        res_me_before = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        assert res_me_before.status_code == 200

        # Request reset & extract OTP
        email_svc = get_email_service()
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()
        await client.post("/api/v1/auth/forgot-password", json={"email": email})
        match = re.search(r"\b(\d{6})\b", email_svc.get_last_message().text_body)
        otp = match.group(1)

        # Perform reset
        await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": otp,
                "newPassword": new_pwd,
                "confirmNewPassword": new_pwd,
            },
        )

        # Old token must now be rejected (401)
        res_me_after = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        assert res_me_after.status_code == 401
        assert "invalidated" in res_me_after.json()["detail"].lower() or "expired" in res_me_after.json()["detail"].lower()

        # Login with new password issues a new valid token
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": new_pwd},
        )
        assert login_res.status_code == 200
        new_token = login_res.json()["access_token"]

        # New token works with /auth/me
        res_me_new = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {new_token}"},
        )
        assert res_me_new.status_code == 200
        assert res_me_new.json()["email"] == email


# ============================================================================
# Test 17, 18: Rate Limiting
# ============================================================================

@pytest.mark.asyncio
async def test_forgot_password_rate_limiting():
    """Verify rate limit triggers after configured max requests and returns same generic response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("rate_limit")
        await register_user(client, email)

        # Reset rate limits for clean test state
        await rate_limiter.reset("forgot_pwd_email", email)

        email_svc = get_email_service()
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()

        # First 3 requests should succeed (allowed=True)
        for i in range(settings.RESET_RATE_LIMIT_PER_HOUR):
            res = await client.post("/api/v1/auth/forgot-password", json={"email": email})
            assert res.status_code == 200
            assert "password reset instructions" in res.json()["message"].lower()

        count_sent_allowed = len(email_svc.get_sent_messages()) if isinstance(email_svc, MockEmailService) else 3
        assert count_sent_allowed == settings.RESET_RATE_LIMIT_PER_HOUR

        # 4th request exceeds rate limit: must return same generic HTTP 200 response
        res_4 = await client.post("/api/v1/auth/forgot-password", json={"email": email})
        assert res_4.status_code == 200
        assert "password reset instructions" in res_4.json()["message"].lower()

        # Email must NOT have been sent for 4th request
        if isinstance(email_svc, MockEmailService):
            assert len(email_svc.get_sent_messages()) == count_sent_allowed


# ============================================================================
# Test: Concurrency-Safe Rate Limiting (Correction 2)
# ============================================================================

@pytest.mark.asyncio
async def test_rate_limiter_concurrency_safety():
    """Verify simultaneous concurrent requests cannot bypass the atomic rate limiter."""
    test_key = f"concurrent_{uuid.uuid4().hex[:8]}"
    limit = 3

    # Send 10 concurrent requests simultaneously using asyncio.gather
    tasks = [
        rate_limiter.acquire(action="test_concurrency", key=test_key, max_requests=limit, window_seconds=60)
        for _ in range(10)
    ]
    results = await asyncio.gather(*tasks)

    # Exactly 3 requests must be allowed, and 7 rejected
    allowed_count = sum(1 for r in results if r is True)
    denied_count = sum(1 for r in results if r is False)

    assert allowed_count == limit
    assert denied_count == (10 - limit)


# ============================================================================
# Test 19, 20, 21, 22: Validation Rules
# ============================================================================

@pytest.mark.asyncio
async def test_schema_validations():
    """Verify email format, OTP length, password length (min 8), and confirmation matching."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Invalid email on forgot-password
        res_bad_email = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "not-an-email"},
        )
        assert res_bad_email.status_code == 422

        # Invalid OTP format (non-numeric)
        res_bad_otp1 = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": "user@example.com",
                "code": "abcdef",
                "newPassword": "ValidPassword123!",
                "confirmNewPassword": "ValidPassword123!",
            },
        )
        assert res_bad_otp1.status_code == 422

        # Invalid OTP format (wrong length)
        res_bad_otp2 = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": "user@example.com",
                "code": "12345",
                "newPassword": "ValidPassword123!",
                "confirmNewPassword": "ValidPassword123!",
            },
        )
        assert res_bad_otp2.status_code == 422

        # Password below 8 characters
        res_short_pwd = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": "user@example.com",
                "code": "123456",
                "newPassword": "Short7!",
                "confirmNewPassword": "Short7!",
            },
        )
        assert res_short_pwd.status_code == 422

        # Password confirmation mismatch
        res_mismatch = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": "user@example.com",
                "code": "123456",
                "newPassword": "ValidPassword123!",
                "confirmNewPassword": "DifferentPassword123!",
            },
        )
        assert res_mismatch.status_code == 422


# ============================================================================
# Test 23, 24: Security Notice Email & Resiliency on Email Delivery Failure
# ============================================================================

@pytest.mark.asyncio
async def test_security_email_and_failure_resilience():
    """Verify security notification is sent, and email failure does NOT rollback password reset."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("sec_email")
        new_pwd = "BrandNewPassword789!"
        await register_user(client, email)

        email_svc = get_email_service()
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()

        await client.post("/api/v1/auth/forgot-password", json={"email": email})
        match = re.search(r"\b(\d{6})\b", email_svc.get_last_message().text_body)
        otp = match.group(1)

        # Clear sent messages before reset
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()

        # Case A: Normal success generates security notification
        res = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": otp,
                "newPassword": new_pwd,
                "confirmNewPassword": new_pwd,
            },
        )
        assert res.status_code == 200

        if isinstance(email_svc, MockEmailService):
            last_msg = email_svc.get_last_message()
            assert last_msg is not None
            assert "Your Password Was Changed" in last_msg.subject
            assert last_msg.recipient == email

        # Case B: Email failure during password reset does not fail the password reset
        email2 = unique_email("email_fail")
        new_pwd2 = "AnotherNewPassword123!"
        await register_user(client, email2)
        await client.post("/api/v1/auth/forgot-password", json={"email": email2})
        match2 = re.search(r"\b(\d{6})\b", email_svc.get_last_message().text_body)
        otp2 = match2.group(1)

        # Patch send_email to simulate transient SMTP failure
        with patch.object(email_svc, "send_email", side_effect=Exception("Simulated SMTP network error")):
            res_fail = await client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": email2,
                    "code": otp2,
                    "newPassword": new_pwd2,
                    "confirmNewPassword": new_pwd2,
                },
            )
            # Password reset MUST still succeed
            assert res_fail.status_code == 200

            # Login with new password must work
            login_check = await client.post(
                "/api/v1/auth/login",
                json={"email": email2, "password": new_pwd2},
            )
            assert login_check.status_code == 200


# ============================================================================
# Test 25, 26: Dual Persona Support & Absence of Reset Fields in UserResponse
# ============================================================================

@pytest.mark.asyncio
async def test_caregiver_reset_and_absence_of_reset_fields_in_profile():
    """Verify caregivers can recover passwords, and reset fields are absent from UserResponse."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        cg_email = unique_email("caregiver_recov")
        cg_new_pwd = "CaregiverNewPassword123!"
        await register_user(client, cg_email, role="caregiver")

        email_svc = get_email_service()
        if isinstance(email_svc, MockEmailService):
            email_svc.clear()

        # Forgot password
        await client.post("/api/v1/auth/forgot-password", json={"email": cg_email})
        match = re.search(r"\b(\d{6})\b", email_svc.get_last_message().text_body)
        otp = match.group(1)

        # Reset password
        res = await client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": cg_email,
                "code": otp,
                "newPassword": cg_new_pwd,
                "confirmNewPassword": cg_new_pwd,
            },
        )
        assert res.status_code == 200

        # Login as caregiver
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": cg_email, "password": cg_new_pwd},
        )
        assert login_res.status_code == 200
        data = login_res.json()
        token = data["access_token"]
        user_profile = data["user"]

        # UserResponse must strictly exclude reset fields
        for forbidden in [
            "passwordResetOtp",
            "passwordResetOtpHash",
            "passwordResetExpiresAt",
            "passwordResetAttempts",
            "passwordResetRequestedAt",
            "passwordHash",
            "password",
        ]:
            assert forbidden not in user_profile

        # Profile via /auth/me must also exclude reset fields
        me_res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_res.status_code == 200
        me_profile = me_res.json()
        for forbidden in [
            "passwordResetOtp",
            "passwordResetOtpHash",
            "passwordResetExpiresAt",
            "passwordResetAttempts",
            "passwordResetRequestedAt",
            "passwordHash",
            "password",
        ]:
            assert forbidden not in me_profile
