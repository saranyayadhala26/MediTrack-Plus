"""Unit and integration tests for Phase 11 Step 3: Backend Schemas + Email Opt-In Preferences.

Covers:
A. New user gets:
   medicationRemindersEnabled=True
   emailReportsEnabled=False
   emailAlertsEnabled=False
B. Existing legacy user without new fields can call GET /auth/me successfully.
C. Existing legacy user without new fields can PATCH profile successfully.
D. emailReportsEnabled can be toggled false -> true -> false.
E. emailAlertsEnabled can be toggled false -> true -> false.
F. medicationRemindersEnabled remains compatible with Phase 10.1 behavior.
G. Invalid non-boolean preference values or extra arbitrary keys are rejected with HTTP 422.
H. Patient can update own preferences.
I. Authentication is strictly required.
J. No email credentials, hashes, or secrets appear in API responses.
K. Caregiver profile and preferences continue working seamlessly.
"""

import uuid
from bson import ObjectId
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token, hash_password
from app.db.mongodb import get_users_collection
from app.main import app
from app.models.collections import now_utc


def unique_email(prefix: str = "pref_test") -> str:
    """Generate a unique test email address."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_user(client: AsyncClient, role: str = "patient") -> dict:
    """Helper to register a user and return token and user dict."""
    email = unique_email(role)
    password = "SecurePassword123!"
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "fullName": f"Test {role.capitalize()}",
            "email": email,
            "password": password,
            "confirmPassword": password,
            "role": role,
            "emergencyContact": "+1-555-9876",
        },
    )
    assert res.status_code == 201
    return res.json()


# ---------------------------------------------------------------------------
# Test A: New user defaults
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_new_user_default_notification_preferences():
    """Verify new user receives medicationRemindersEnabled=True, emailReportsEnabled=False, emailAlertsEnabled=False."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Patient
        pat_data = await register_user(client, "patient")
        token = pat_data["access_token"]

        me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        prefs = me_res.json()["notificationPreferences"]
        assert prefs["medicationRemindersEnabled"] is True
        assert prefs["emailReportsEnabled"] is False
        assert prefs["emailAlertsEnabled"] is False

        # Caregiver
        cg_data = await register_user(client, "caregiver")
        cg_token = cg_data["access_token"]
        cg_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {cg_token}"})
        assert cg_res.status_code == 200
        cg_prefs = cg_res.json()["notificationPreferences"]
        assert cg_prefs["medicationRemindersEnabled"] is True
        assert cg_prefs["emailReportsEnabled"] is False
        assert cg_prefs["emailAlertsEnabled"] is False


# ---------------------------------------------------------------------------
# Test B: Legacy user GET /auth/me backward compatibility
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_legacy_user_without_new_fields_can_get_me():
    """Verify existing user document without Phase 11 fields defaults emailReportsEnabled and emailAlertsEnabled to False."""
    users_coll = get_users_collection()
    user_id = ObjectId()
    email = unique_email("legacy_get")

    # Simulate legacy document without Phase 11 fields
    legacy_doc = {
        "_id": user_id,
        "email": email,
        "fullName": "Legacy User",
        "passwordHash": hash_password("Password123!"),
        "role": "patient",
        "phone": "+1-555-0001",
        "emergencyContact": "+1-555-0002",
        "healthConditions": [],
        "notificationPreferences": {
            "medicationRemindersEnabled": False  # Explicitly False in legacy
        },
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    }
    await users_coll.insert_one(legacy_doc)

    token = create_access_token(subject=str(user_id), role="patient", email=email)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == email
        assert data["fullName"] == "Legacy User"
        prefs = data["notificationPreferences"]
        assert prefs["medicationRemindersEnabled"] is False  # Preserved legacy value
        assert prefs["emailReportsEnabled"] is False        # Safe default
        assert prefs["emailAlertsEnabled"] is False         # Safe default


# ---------------------------------------------------------------------------
# Test C: Legacy user PATCH /auth/profile backward compatibility
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_legacy_user_without_new_fields_can_patch_profile():
    """Verify legacy user can PATCH profile, preserving legacy preferences and adopting defaults."""
    users_coll = get_users_collection()
    user_id = ObjectId()
    email = unique_email("legacy_patch")

    legacy_doc = {
        "_id": user_id,
        "email": email,
        "fullName": "Old Name",
        "passwordHash": hash_password("Password123!"),
        "role": "patient",
        "notificationPreferences": {
            "medicationRemindersEnabled": True
        },
        "createdAt": now_utc(),
        "updatedAt": now_utc(),
    }
    await users_coll.insert_one(legacy_doc)

    token = create_access_token(subject=str(user_id), role="patient", email=email)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.patch(
            "/api/v1/auth/profile",
            json={"fullName": "Updated Legacy Name"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["fullName"] == "Updated Legacy Name"
        prefs = data["notificationPreferences"]
        assert prefs["medicationRemindersEnabled"] is True
        assert prefs["emailReportsEnabled"] is False
        assert prefs["emailAlertsEnabled"] is False


# ---------------------------------------------------------------------------
# Test D: emailReportsEnabled toggle (False -> True -> False)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_email_reports_enabled_toggle():
    """Verify emailReportsEnabled can be explicitly toggled from False to True and back to False."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_data = await register_user(client, "patient")
        token = user_data["access_token"]

        # Initial: False
        res1 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res1.json()["notificationPreferences"]["emailReportsEnabled"] is False

        # Toggle to True
        patch1 = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailReportsEnabled": True}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert patch1.status_code == 200
        assert patch1.json()["notificationPreferences"]["emailReportsEnabled"] is True
        assert patch1.json()["notificationPreferences"]["medicationRemindersEnabled"] is True

        # Verify persisted on GET /me
        res2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res2.json()["notificationPreferences"]["emailReportsEnabled"] is True

        # Toggle back to False
        patch2 = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailReportsEnabled": False}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert patch2.status_code == 200
        assert patch2.json()["notificationPreferences"]["emailReportsEnabled"] is False

        # Verify persisted
        res3 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res3.json()["notificationPreferences"]["emailReportsEnabled"] is False


# ---------------------------------------------------------------------------
# Test E: emailAlertsEnabled toggle (False -> True -> False)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_email_alerts_enabled_toggle():
    """Verify emailAlertsEnabled can be explicitly toggled from False to True and back to False."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        cg_data = await register_user(client, "caregiver")
        token = cg_data["access_token"]

        # Initial: False
        res1 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res1.json()["notificationPreferences"]["emailAlertsEnabled"] is False

        # Toggle to True
        patch1 = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailAlertsEnabled": True}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert patch1.status_code == 200
        assert patch1.json()["notificationPreferences"]["emailAlertsEnabled"] is True

        # Verify persisted
        res2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res2.json()["notificationPreferences"]["emailAlertsEnabled"] is True

        # Toggle back to False
        patch2 = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailAlertsEnabled": False}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert patch2.status_code == 200
        assert patch2.json()["notificationPreferences"]["emailAlertsEnabled"] is False


# ---------------------------------------------------------------------------
# Test F: medicationRemindersEnabled preserves compatibility
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_medication_reminders_enabled_compatibility():
    """Verify toggling email preferences does not alter medicationRemindersEnabled state."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_data = await register_user(client, "patient")
        token = user_data["access_token"]

        # 1. Turn medicationRemindersEnabled OFF
        p1 = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"medicationRemindersEnabled": False}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert p1.status_code == 200
        assert p1.json()["notificationPreferences"]["medicationRemindersEnabled"] is False

        # 2. Update emailReportsEnabled to True
        p2 = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailReportsEnabled": True}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert p2.status_code == 200
        prefs = p2.json()["notificationPreferences"]
        assert prefs["emailReportsEnabled"] is True
        # CRITICAL: medicationRemindersEnabled MUST remain False
        assert prefs["medicationRemindersEnabled"] is False
        assert prefs["emailAlertsEnabled"] is False


# ---------------------------------------------------------------------------
# Test G: Invalid non-boolean preference values and extra keys rejected
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_invalid_preference_types_and_extra_keys_rejected():
    """Verify non-boolean preference values and unknown keys return HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_data = await register_user(client, "patient")
        token = user_data["access_token"]

        # Non-boolean string
        res_str = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailReportsEnabled": "not_a_boolean"}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_str.status_code == 422

        # Non-boolean dictionary
        res_dict = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailAlertsEnabled": {"invalid": 123}}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_dict.status_code == 422

        # Arbitrary / unknown key forbidden
        res_extra = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"arbitraryKey": True}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_extra.status_code == 422


# ---------------------------------------------------------------------------
# Test H: Patient can update own preferences
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_patient_can_update_own_preferences():
    """Verify patient can update their own notification preferences and identity matches."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_data = await register_user(client, "patient")
        user_id = user_data["user"]["id"]
        token = user_data["access_token"]

        res = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailReportsEnabled": True}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        updated = res.json()
        assert updated["id"] == user_id
        assert updated["notificationPreferences"]["emailReportsEnabled"] is True


# ---------------------------------------------------------------------------
# Test I: Authentication is required
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_preference_update_requires_authentication():
    """Verify unauthenticated requests to profile endpoints return HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # GET /auth/me without token
        res_me = await client.get("/api/v1/auth/me")
        assert res_me.status_code == 401

        # PATCH /auth/profile without token
        res_patch = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailReportsEnabled": True}},
        )
        assert res_patch.status_code == 401

        # Invalid token
        res_inv = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"emailReportsEnabled": True}},
            headers={"Authorization": "Bearer invalid_token_abc"},
        )
        assert res_inv.status_code == 401


# ---------------------------------------------------------------------------
# Test J: No secrets or email credentials in API responses
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_no_email_credentials_or_secrets_in_api_response():
    """Verify passwordHash, SMTP secrets, or tokens are never leaked in profile responses."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_data = await register_user(client, "patient")
        token = user_data["access_token"]

        me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        data = me_res.json()

        for forbidden_key in ["password", "passwordHash", "smtp", "smtp_password", "jwt_secret", "cron_secret"]:
            assert forbidden_key not in data
            assert forbidden_key not in data.get("notificationPreferences", {})


# ---------------------------------------------------------------------------
# Test K: Caregiver profile and preferences continue working
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_caregiver_profile_and_preferences_continue_working():
    """Verify caregiver can update fullName, phone, and both email preferences while preserving role."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        cg_data = await register_user(client, "caregiver")
        token = cg_data["access_token"]

        res = await client.patch(
            "/api/v1/auth/profile",
            json={
                "fullName": "Caregiver Alice",
                "phone": "+1-555-4321",
                "notificationPreferences": {
                    "emailReportsEnabled": True,
                    "emailAlertsEnabled": True,
                },
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        updated = res.json()
        assert updated["role"] == "caregiver"
        assert updated["fullName"] == "Caregiver Alice"
        assert updated["phone"] == "+1-555-4321"
        prefs = updated["notificationPreferences"]
        assert prefs["emailReportsEnabled"] is True
        assert prefs["emailAlertsEnabled"] is True
        assert prefs["medicationRemindersEnabled"] is True
