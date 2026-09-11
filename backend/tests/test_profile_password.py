"""Unit and integration tests for Profile Management & Change Password (Phase 10.1)."""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.db.mongodb import (
    get_activities_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.main import app
from app.models.collections import (
    create_activity_document,
    create_medicine_document,
    create_schedule_document,
)
from app.utils.mongo import to_object_id


def unique_email(prefix: str = "profile") -> str:
    """Generate a unique test email address."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_user(client: AsyncClient, email: str, role: str = "patient", password: str = "Password123!"):
    """Helper to register a user and return response data."""
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


@pytest.mark.asyncio
async def test_get_profile_authenticated():
    """Verify GET /api/v1/auth/me returns current user profile with phone and notification preferences."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("get_prof")
        reg = await register_user(client, email, "patient")
        token = reg["access_token"]

        res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == email
        assert data["fullName"] == "Test Patient"
        assert data["role"] == "patient"
        assert data["phone"] == "+1-555-0100"
        assert data["emergencyContact"] == "+1-555-0199"
        assert "notificationPreferences" in data
        assert data["notificationPreferences"]["medicationRemindersEnabled"] is True
        assert "password" not in data
        assert "passwordHash" not in data


@pytest.mark.asyncio
async def test_update_profile_patient_fields():
    """Verify patient can update fullName, phone, and emergencyContact via PATCH /auth/profile."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("upd_pat")
        reg = await register_user(client, email, "patient")
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/profile",
            json={
                "fullName": "Jane Doe Patient",
                "phone": "+1-555-9876",
                "emergencyContact": "+1-555-4321",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        updated = res.json()
        assert updated["fullName"] == "Jane Doe Patient"
        assert updated["phone"] == "+1-555-9876"
        assert updated["emergencyContact"] == "+1-555-4321"
        assert updated["role"] == "patient"
        assert updated["email"] == email


@pytest.mark.asyncio
async def test_update_profile_caregiver():
    """Verify caregiver can update fullName and phone while preserving role."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("upd_cg")
        reg = await register_user(client, email, "caregiver")
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/profile",
            json={
                "fullName": "Primary Caregiver John",
                "phone": "+1-555-7777",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        updated = res.json()
        assert updated["fullName"] == "Primary Caregiver John"
        assert updated["phone"] == "+1-555-7777"
        assert updated["role"] == "caregiver"


@pytest.mark.asyncio
async def test_notification_preference_default_and_toggle():
    """Verify default medicationRemindersEnabled=True, and can toggle OFF then ON."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("notif_pref")
        reg = await register_user(client, email, "patient")
        token = reg["access_token"]

        # Default check
        me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.json()["notificationPreferences"]["medicationRemindersEnabled"] is True

        # Toggle OFF
        off_res = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"medicationRemindersEnabled": False}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert off_res.status_code == 200
        assert off_res.json()["notificationPreferences"]["medicationRemindersEnabled"] is False

        # Verify persisted on GET /me
        me_res2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res2.json()["notificationPreferences"]["medicationRemindersEnabled"] is False

        # Toggle back ON
        on_res = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"medicationRemindersEnabled": True}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert on_res.status_code == 200
        assert on_res.json()["notificationPreferences"]["medicationRemindersEnabled"] is True


@pytest.mark.asyncio
async def test_notification_preference_does_not_modify_schedules_or_activities():
    """Verify updating notification preferences preserves all existing schedules and activities."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("preserve_data")
        reg = await register_user(client, email, "patient")
        user_id = reg["user"]["id"]
        token = reg["access_token"]

        user_oid = to_object_id(user_id)

        # Insert a medicine
        med_doc = create_medicine_document(
            user_id=user_oid,
            name="Metformin",
            dosage="500",
            dosage_unit="mg",
            frequency="daily",
        )
        med_coll = get_medicines_collection()
        await med_coll.insert_one(med_doc)

        # Insert a schedule
        sched_doc = create_schedule_document(
            user_id=user_oid,
            medicine_id=med_doc["_id"],
            time="08:00",
            frequency_type="daily",
            days_of_week=[],
            start_date="2026-09-01",
        )
        sched_coll = get_schedules_collection()
        await sched_coll.insert_one(sched_doc)

        # Insert an activity
        act_doc = create_activity_document(
            user_id=user_oid,
            medicine_id=med_doc["_id"],
            schedule_id=sched_doc["_id"],
            scheduled_date="2026-09-10",
            scheduled_time="08:00",
            action="taken",
        )
        act_coll = get_activities_collection()
        await act_coll.insert_one(act_doc)

        # Now update profile notification preference
        res = await client.patch(
            "/api/v1/auth/profile",
            json={"notificationPreferences": {"medicationRemindersEnabled": False}},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200

        # Verify schedules and activities exist unchanged
        persisted_sched = await sched_coll.find_one({"_id": sched_doc["_id"]})
        assert persisted_sched is not None
        assert persisted_sched["time"] == "08:00"

        persisted_act = await act_coll.find_one({"_id": act_doc["_id"]})
        assert persisted_act is not None
        assert persisted_act["action"] == "taken"


@pytest.mark.asyncio
async def test_update_profile_empty_name_rejected():
    """Verify empty fullName string returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("empty_name")
        reg = await register_user(client, email, "patient")
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/profile",
            json={"fullName": "   "},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_update_profile_unauthenticated_rejected():
    """Verify calling PATCH /auth/profile without Bearer token returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.patch(
            "/api/v1/auth/profile",
            json={"fullName": "Unauthorized Name"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_change_password_success():
    """Verify valid password change succeeds and old password can no longer login."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("pwd_ok")
        old_pwd = "InitialPassword123!"
        new_pwd = "UpdatedPassword456!"
        reg = await register_user(client, email, "patient", password=old_pwd)
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/password",
            json={
                "currentPassword": old_pwd,
                "newPassword": new_pwd,
                "confirmNewPassword": new_pwd,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        assert res.json()["message"] == "Password updated successfully."

        # Login with old password must fail with 401
        old_login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": old_pwd},
        )
        assert old_login.status_code == 401

        # Login with new password must succeed with 200
        new_login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": new_pwd},
        )
        assert new_login.status_code == 200
        assert "access_token" in new_login.json()


@pytest.mark.asyncio
async def test_change_password_wrong_current_rejected_401():
    """Verify incorrect current password returns HTTP 401 Unauthorized."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("wrong_cur")
        reg = await register_user(client, email, "patient", password="RealPassword123!")
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/password",
            json={
                "currentPassword": "WrongCurrentPassword999!",
                "newPassword": "NewValidPassword789!",
                "confirmNewPassword": "NewValidPassword789!",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401
        assert "incorrect" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_change_password_mismatched_confirmation_rejected_422():
    """Verify mismatched confirmation password returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("mismatch_pwd")
        reg = await register_user(client, email, "patient", password="RealPassword123!")
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/password",
            json={
                "currentPassword": "RealPassword123!",
                "newPassword": "BrandNewPassword123!",
                "confirmNewPassword": "MismatchPassword456!",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_change_password_same_as_current_rejected_422():
    """Verify new password identical to current password returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("same_pwd")
        pwd = "IdenticalPassword123!"
        reg = await register_user(client, email, "patient", password=pwd)
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/password",
            json={
                "currentPassword": pwd,
                "newPassword": pwd,
                "confirmNewPassword": pwd,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_change_password_too_short_rejected_422():
    """Verify new password under 6 characters returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email = unique_email("short_pwd")
        reg = await register_user(client, email, "patient", password="OriginalPassword123!")
        token = reg["access_token"]

        res = await client.patch(
            "/api/v1/auth/password",
            json={
                "currentPassword": "OriginalPassword123!",
                "newPassword": "12345",
                "confirmNewPassword": "12345",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_change_password_unauthenticated_rejected_401():
    """Verify calling PATCH /auth/password without Bearer token returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.patch(
            "/api/v1/auth/password",
            json={
                "currentPassword": "OldPassword123!",
                "newPassword": "NewPassword456!",
                "confirmNewPassword": "NewPassword456!",
            },
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_cross_user_password_protection():
    """Verify that User A's token cannot change User B's password."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        email_a = unique_email("user_a")
        email_b = unique_email("user_b")
        pwd_a = "PasswordUserA123!"
        pwd_b = "PasswordUserB123!"

        reg_a = await register_user(client, email_a, "patient", password=pwd_a)
        reg_b = await register_user(client, email_b, "patient", password=pwd_b)

        token_a = reg_a["access_token"]

        # User A changes password using their token
        res = await client.patch(
            "/api/v1/auth/password",
            json={
                "currentPassword": pwd_a,
                "newPassword": "NewPasswordForA123!",
                "confirmNewPassword": "NewPasswordForA123!",
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res.status_code == 200

        # User B's credentials must remain intact and unchanged
        login_b = await client.post(
            "/api/v1/auth/login",
            json={"email": email_b, "password": pwd_b},
        )
        assert login_b.status_code == 200
