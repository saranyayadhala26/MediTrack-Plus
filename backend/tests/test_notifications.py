"""Unit and integration tests for Notifications & Reminders (Phase 6).

Tests cover:
- Create notification (patient-scoped, disclaimer inclusion)
- List notifications with unread counts
- Get notification by ID (valid, 404 non-existent, cross-patient 404 safe behavior)
- Mark notification as read (status update)
- Caregiver 403 Forbidden
- Unauthenticated 401 Unauthorized
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def unique_email(prefix: str = "notif_test") -> str:
    """Generate a unique test email address."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_user(client: AsyncClient, role: str = "patient") -> dict:
    """Helper to register a user and return the auth response dictionary."""
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


def auth_headers(token: str) -> dict:
    """Helper to generate Authorization Bearer header."""
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_and_list_notifications():
    """Verify patient can create, list, and observe unread counts for notifications."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth = await register_user(client, role="patient")
        token = auth["access_token"]

        # Create notification 1
        res1 = await client.post(
            "/api/v1/notifications",
            json={
                "type": "reminder",
                "title": "Medication Reminder",
                "message": "It's time to take Metformin 500mg",
            },
            headers=auth_headers(token),
        )
        assert res1.status_code == 201
        notif1 = res1.json()
        assert notif1["title"] == "Medication Reminder"
        assert notif1["status"] == "unread"
        assert "medical_disclaimer" in notif1

        # Create notification 2
        res2 = await client.post(
            "/api/v1/notifications",
            json={
                "type": "system",
                "title": "Supply Low",
                "message": "Refill threshold reached for Amoxicillin",
            },
            headers=auth_headers(token),
        )
        assert res2.status_code == 201

        # List notifications
        list_res = await client.get("/api/v1/notifications", headers=auth_headers(token))
        assert list_res.status_code == 200
        data = list_res.json()
        assert data["total"] == 2
        assert data["unreadCount"] == 2
        assert len(data["items"]) == 2
        assert "medical_disclaimer" in data


@pytest.mark.asyncio
async def test_get_and_mark_notification_read():
    """Verify retrieving notification and marking it as read."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth = await register_user(client, role="patient")
        token = auth["access_token"]

        create_res = await client.post(
            "/api/v1/notifications",
            json={
                "type": "reminder",
                "title": "Time for Aspirin",
                "message": "81mg daily",
            },
            headers=auth_headers(token),
        )
        notif_id = create_res.json()["id"]

        # Get notification
        get_res = await client.get(f"/api/v1/notifications/{notif_id}", headers=auth_headers(token))
        assert get_res.status_code == 200
        assert get_res.json()["id"] == notif_id
        assert get_res.json()["status"] == "unread"

        # Mark read
        patch_res = await client.patch(f"/api/v1/notifications/{notif_id}/read", headers=auth_headers(token))
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "read"

        # Check unread count decreased
        list_res = await client.get("/api/v1/notifications", headers=auth_headers(token))
        assert list_res.status_code == 200
        assert list_res.json()["unreadCount"] == 0


@pytest.mark.asyncio
async def test_notification_cross_patient_isolation_and_roles():
    """Verify cross-patient isolation (404 safe) and role enforcement."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")
        cg_auth = await register_user(client, role="caregiver")

        create_res = await client.post(
            "/api/v1/notifications",
            json={
                "type": "reminder",
                "title": "Private Notice A",
                "message": "Only for patient A",
            },
            headers=auth_headers(auth_a["access_token"]),
        )
        notif_id = create_res.json()["id"]

        # Patient B tries to get Patient A's notification -> 404
        res_cross_get = await client.get(
            f"/api/v1/notifications/{notif_id}",
            headers=auth_headers(auth_b["access_token"]),
        )
        assert res_cross_get.status_code == 404

        # Patient B tries to mark read -> 404
        res_cross_patch = await client.patch(
            f"/api/v1/notifications/{notif_id}/read",
            headers=auth_headers(auth_b["access_token"]),
        )
        assert res_cross_patch.status_code == 404

        # Caregiver blocked -> 403
        res_cg = await client.get(
            "/api/v1/notifications",
            headers=auth_headers(cg_auth["access_token"]),
        )
        assert res_cg.status_code == 403

        # Unauthenticated blocked -> 401
        res_unauth = await client.get("/api/v1/notifications")
        assert res_unauth.status_code == 401
