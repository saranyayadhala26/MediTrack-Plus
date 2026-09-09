"""Unit and integration tests for Authentication & User Management (Phase 3)."""

from datetime import timedelta
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.dependencies import get_current_caregiver, get_current_patient
from app.core.security import create_access_token, hash_password, verify_password
from app.db.mongodb import connect_to_mongo, get_users_collection
from app.main import app
from fastapi import HTTPException


def unique_email(prefix: str = "user") -> str:
    """Generate a unique test email address."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


# ---------------------------------------------------------------------------
# Password Hashing Tests
# ---------------------------------------------------------------------------
def test_password_hashing_and_verification():
    """Verify Bcrypt password hashing is one-way and verifies correctly."""
    plain = "SuperSecurePassword123"
    hashed = hash_password(plain)

    # Must not be plaintext
    assert hashed != plain
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    # Correct password verifies
    assert verify_password(plain, hashed) is True
    # Incorrect password fails
    assert verify_password("WrongPassword123", hashed) is False


# ---------------------------------------------------------------------------
# JWT Generation & Validation Tests
# ---------------------------------------------------------------------------
def test_jwt_token_generation_and_claims():
    """Verify JWT access token contains subject, role, and email claims."""
    token = create_access_token(
        subject="650c709e3e7f4c3a8e9e1234",
        role="patient",
        email="test@example.com",
    )
    assert isinstance(token, str)
    assert len(token) > 20

    from app.core.security import decode_access_token
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "650c709e3e7f4c3a8e9e1234"
    assert payload["role"] == "patient"
    assert payload["email"] == "test@example.com"


def test_jwt_expired_token():
    """Verify expired JWT tokens are rejected by decode_access_token."""
    from app.core.security import decode_access_token
    expired_token = create_access_token(
        subject="650c709e3e7f4c3a8e9e1234",
        expires_delta=timedelta(seconds=-10),  # In the past
    )
    payload = decode_access_token(expired_token)
    assert payload is None


# ---------------------------------------------------------------------------
# Registration API Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_register_valid_patient():
    """Verify successful patient registration returns token and user data without passwordHash."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("patient")
        res = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Alice Johnson",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
                "emergencyContact": "+1-555-0101",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
        assert data["user"]["email"] == email
        assert data["user"]["fullName"] == "Alice Johnson"
        assert data["user"]["role"] == "patient"
        assert "passwordHash" not in data["user"]
        assert "password" not in data["user"]


@pytest.mark.asyncio
async def test_register_duplicate_email_rejected():
    """Verify registering with an existing email returns HTTP 409 Conflict."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("dup")
        # First registration
        res1 = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "First User",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        assert res1.status_code == 201

        # Duplicate registration
        res2 = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Duplicate User",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        assert res2.status_code == 409
        assert "already exists" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_password_mismatch_rejected():
    """Verify mismatched password confirmation returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Mismatch User",
                "email": unique_email("mismatch"),
                "password": "Password123!",
                "confirmPassword": "DifferentPassword456!",
                "role": "patient",
            },
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_invalid_email_rejected():
    """Verify invalid email format returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Bad Email User",
                "email": "not-a-valid-email",
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        assert res.status_code == 422


# ---------------------------------------------------------------------------
# Login API Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_login_valid_credentials():
    """Verify login with correct email and password returns JWT token."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("login")
        password = "SecurePassword123!"

        # Register first
        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Login Tester",
                "email": email,
                "password": password,
                "confirmPassword": password,
                "role": "patient",
            },
        )

        # Login
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["user"]["email"] == email
        assert "passwordHash" not in data["user"]


@pytest.mark.asyncio
async def test_login_invalid_password():
    """Verify login with wrong password returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("badpw")
        # Register
        await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Tester",
                "email": email,
                "password": "CorrectPassword123",
                "confirmPassword": "CorrectPassword123",
                "role": "patient",
            },
        )

        # Login with wrong password
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword999"},
        )
        assert res.status_code == 401
        assert "invalid email or password" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_unknown_email():
    """Verify login with unknown email returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent_user@example.com", "password": "AnyPassword123"},
        )
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# Protected /me & Profile Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_get_me_with_valid_token():
    """Verify /me returns the current user profile when valid Bearer token is passed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("me")
        reg_res = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Me Tester",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
                "emergencyContact": "+1-555-0909",
            },
        )
        token = reg_res.json()["access_token"]

        # Call /me
        res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == email
        assert data["fullName"] == "Me Tester"
        assert data["emergencyContact"] == "+1-555-0909"


@pytest.mark.asyncio
async def test_get_me_without_token_rejected():
    """Verify /me returns HTTP 401 when no token is provided."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_me_with_invalid_token_rejected():
    """Verify /me returns HTTP 401 when an invalid token string is provided."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.value"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_update_profile_permitted_fields():
    """Verify user can update fullName, emergencyContact, and healthConditions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("update")
        reg_res = await client.post(
            "/api/v1/auth/register",
            json={
                "fullName": "Old Name",
                "email": email,
                "password": "Password123!",
                "confirmPassword": "Password123!",
                "role": "patient",
            },
        )
        token = reg_res.json()["access_token"]

        # Patch profile
        res = await client.patch(
            "/api/v1/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "fullName": "Updated New Name",
                "emergencyContact": "+1-555-4444",
                "healthConditions": ["Asthma", "Allergies"],
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["fullName"] == "Updated New Name"
        assert data["emergencyContact"] == "+1-555-4444"
        assert "Asthma" in data["healthConditions"]
        assert data["role"] == "patient"  # Role unchanged


# ---------------------------------------------------------------------------
# Role Authorization Dependency Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_role_authorization_patient_and_caregiver():
    """Verify patient and caregiver dependency authorization rules."""
    patient_user = {"id": "1", "email": "p@test.com", "role": "patient"}
    caregiver_user = {"id": "2", "email": "c@test.com", "role": "caregiver"}

    # Patient accessing patient dependency succeeds
    assert await get_current_patient(patient_user) == patient_user

    # Caregiver accessing patient dependency fails with 403
    with pytest.raises(HTTPException) as exc_info:
        await get_current_patient(caregiver_user)
    assert exc_info.value.status_code == 403

    # Caregiver accessing caregiver dependency succeeds
    assert await get_current_caregiver(caregiver_user) == caregiver_user

    # Patient accessing caregiver dependency fails with 403
    with pytest.raises(HTTPException) as exc_info:
        await get_current_caregiver(patient_user)
    assert exc_info.value.status_code == 403
