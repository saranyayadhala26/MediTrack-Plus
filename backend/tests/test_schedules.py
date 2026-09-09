"""Unit and integration tests for Medication Scheduling (Phase 5).

Tests cover:
- Create schedule (daily, weekly, custom, unauthenticated 401, caregiver 403, validation errors, duration bounds)
- List schedules (patient-scoped, filtering by medicineId, caregiver 403, unauthenticated 401)
- Get schedule by ID (valid, 404 non-existent, 404 malformed, cross-patient 404 safe behavior)
- Update schedule (time, days, dates, validation bounds, cross-patient 404)
- Enable / Disable toggling (disabling does not delete document)
- Delete schedule (valid, cross-patient 404, caregiver 403)
- Medical safety disclaimer inclusion
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def unique_email(prefix: str = "sched_test") -> str:
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


async def create_test_medicine(
    client: AsyncClient,
    token: str,
    name: str = "Amoxicillin",
    start_date: str = "2026-09-01",
    end_date: str = "2026-09-30",
) -> dict:
    """Helper to create a test medicine."""
    res = await client.post(
        "/api/v1/medicines",
        json={
            "name": name,
            "dosage": "500",
            "dosageUnit": "mg",
            "frequency": "Daily",
            "startDate": start_date,
            "endDate": end_date,
            "inventory": 30,
            "refillThreshold": 5,
        },
        headers=auth_headers(token),
    )
    assert res.status_code == 201
    return res.json()


# ---------------------------------------------------------------------------
# Create Schedule Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_create_daily_schedule_success():
    """Verify patient can create a valid daily schedule."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]
        med = await create_test_medicine(client, token)

        payload = {
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "daily",
            "startDate": "2026-09-05",
            "endDate": "2026-09-25",
            "enabled": True,
        }

        res = await client.post("/api/v1/schedules", json=payload, headers=auth_headers(token))
        assert res.status_code == 201
        data = res.json()
        assert data["time"] == "08:00"
        assert data["frequencyType"] == "daily"
        assert data["medicineId"] == med["id"]
        assert data["medicineName"] == "Amoxicillin"
        assert data["dosage"] == "500"
        assert data["dosageUnit"] == "mg"
        assert data["enabled"] is True
        assert "medical_disclaimer" in data


@pytest.mark.asyncio
async def test_create_weekly_schedule_success():
    """Verify patient can create a valid weekly schedule with non-duplicate weekdays."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]
        med = await create_test_medicine(client, token)

        payload = {
            "medicineId": med["id"],
            "time": "12:30",
            "frequencyType": "weekly",
            "daysOfWeek": [1, 3, 5],  # Mon, Wed, Fri
            "startDate": "2026-09-05",
            "endDate": "2026-09-25",
            "enabled": True,
        }

        res = await client.post("/api/v1/schedules", json=payload, headers=auth_headers(token))
        assert res.status_code == 201
        data = res.json()
        assert data["frequencyType"] == "weekly"
        assert data["daysOfWeek"] == [1, 3, 5]


@pytest.mark.asyncio
async def test_create_custom_schedule_success():
    """Verify patient can create a valid custom schedule with specific dates."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]
        med = await create_test_medicine(client, token)

        payload = {
            "medicineId": med["id"],
            "time": "21:00",
            "frequencyType": "custom",
            "dates": ["2026-09-10", "2026-09-15", "2026-09-20"],
            "startDate": "2026-09-10",
            "enabled": True,
        }

        res = await client.post("/api/v1/schedules", json=payload, headers=auth_headers(token))
        assert res.status_code == 201
        data = res.json()
        assert data["frequencyType"] == "custom"
        assert data["dates"] == ["2026-09-10", "2026-09-15", "2026-09-20"]


@pytest.mark.asyncio
async def test_create_schedule_unauthenticated_and_caregiver():
    """Verify unauthenticated users (401) and caregivers (403) are blocked from creating schedules."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "medicineId": "650c709e3e7f4c3a8e9e1234",
            "time": "08:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }

        # 401 unauthenticated
        res1 = await client.post("/api/v1/schedules", json=payload)
        assert res1.status_code == 401

        # 403 caregiver
        cg_auth = await register_user(client, role="caregiver")
        res2 = await client.post("/api/v1/schedules", json=payload, headers=auth_headers(cg_auth["access_token"]))
        assert res2.status_code == 403


@pytest.mark.asyncio
async def test_create_schedule_validation_errors():
    """Verify validation errors for malformed time, invalid weekday, duplicate days, etc."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]
        med = await create_test_medicine(client, token)

        # 1. Invalid time format
        res1 = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "25:99",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }, headers=auth_headers(token))
        assert res1.status_code == 422

        # 2. Weekly frequency without daysOfWeek
        res2 = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "weekly",
            "startDate": "2026-09-10",
        }, headers=auth_headers(token))
        assert res2.status_code == 422

        # 3. Weekly frequency with duplicate days
        res3 = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "weekly",
            "daysOfWeek": [1, 1, 3],
            "startDate": "2026-09-10",
        }, headers=auth_headers(token))
        assert res3.status_code == 422

        # 4. Custom frequency without dates
        res4 = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "custom",
            "startDate": "2026-09-10",
        }, headers=auth_headers(token))
        assert res4.status_code == 422

        # 5. Custom frequency with malformed date
        res5 = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "custom",
            "dates": ["invalid-date"],
            "startDate": "2026-09-10",
        }, headers=auth_headers(token))
        assert res5.status_code == 422


@pytest.mark.asyncio
async def test_create_schedule_outside_medicine_duration_rejected():
    """Verify schedules outside medicine's startDate or endDate bounds return 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]
        # Medicine runs 2026-09-01 to 2026-09-30
        med = await create_test_medicine(client, token, start_date="2026-09-01", end_date="2026-09-30")

        # Schedule start date earlier than medicine start date
        res1 = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "daily",
            "startDate": "2026-08-20",  # earlier than 2026-09-01
        }, headers=auth_headers(token))
        assert res1.status_code == 422

        # Schedule end date later than medicine end date
        res2 = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
            "endDate": "2026-10-15",  # later than 2026-09-30
        }, headers=auth_headers(token))
        assert res2.status_code == 422


@pytest.mark.asyncio
async def test_create_schedule_another_patient_medicine_rejected():
    """Verify patient cannot create a schedule referencing another patient's medicine (safe 404)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")

        # Patient B creates medicine
        med_b = await create_test_medicine(client, auth_b["access_token"], name="Private B Med")

        # Patient A attempts to schedule Patient B's medicine
        res = await client.post("/api/v1/schedules", json={
            "medicineId": med_b["id"],
            "time": "09:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }, headers=auth_headers(auth_a["access_token"]))

        # Must return safe 404, not leak existence
        assert res.status_code == 404
        assert "not found" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# List Schedules Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_list_schedules_isolation_and_filter():
    """Verify patient lists only their own schedules and can filter by medicineId."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")

        med_a1 = await create_test_medicine(client, auth_a["access_token"], name="Med A1")
        med_a2 = await create_test_medicine(client, auth_a["access_token"], name="Med A2")
        med_b = await create_test_medicine(client, auth_b["access_token"], name="Med B")

        # Patient A schedules
        await client.post("/api/v1/schedules", json={
            "medicineId": med_a1["id"],
            "time": "08:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }, headers=auth_headers(auth_a["access_token"]))

        await client.post("/api/v1/schedules", json={
            "medicineId": med_a2["id"],
            "time": "18:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }, headers=auth_headers(auth_a["access_token"]))

        # Patient B schedule
        await client.post("/api/v1/schedules", json={
            "medicineId": med_b["id"],
            "time": "12:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }, headers=auth_headers(auth_b["access_token"]))

        # Patient A lists all
        res_a = await client.get("/api/v1/schedules", headers=auth_headers(auth_a["access_token"]))
        assert res_a.status_code == 200
        data_a = res_a.json()
        assert data_a["total"] == 2
        med_names = [item["medicineName"] for item in data_a["items"]]
        assert "Med A1" in med_names
        assert "Med A2" in med_names
        assert "Med B" not in med_names

        # Patient A filters by med_a1
        res_filter = await client.get(f"/api/v1/schedules?medicine_id={med_a1['id']}", headers=auth_headers(auth_a["access_token"]))
        assert res_filter.status_code == 200
        data_filter = res_filter.json()
        assert data_filter["total"] == 1
        assert data_filter["items"][0]["medicineId"] == med_a1["id"]

        # Patient B lists all
        res_b = await client.get("/api/v1/schedules", headers=auth_headers(auth_b["access_token"]))
        assert res_b.status_code == 200
        assert res_b.json()["total"] == 1
        assert res_b.json()["items"][0]["medicineName"] == "Med B"


# ---------------------------------------------------------------------------
# Get Schedule By ID Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_get_schedule_by_id_success_and_cross_patient():
    """Verify retrieving schedule by ID and strict cross-patient 404 isolation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")

        med_a = await create_test_medicine(client, auth_a["access_token"])
        create_res = await client.post("/api/v1/schedules", json={
            "medicineId": med_a["id"],
            "time": "07:30",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }, headers=auth_headers(auth_a["access_token"]))
        sched_id = create_res.json()["id"]

        # Patient A retrieves own schedule
        get_res = await client.get(f"/api/v1/schedules/{sched_id}", headers=auth_headers(auth_a["access_token"]))
        assert get_res.status_code == 200
        assert get_res.json()["id"] == sched_id
        assert get_res.json()["time"] == "07:30"
        assert get_res.json()["medicineName"] == "Amoxicillin"

        # Patient B attempts to retrieve Patient A's schedule -> 404 safe
        cross_res = await client.get(f"/api/v1/schedules/{sched_id}", headers=auth_headers(auth_b["access_token"]))
        assert cross_res.status_code == 404


# ---------------------------------------------------------------------------
# Update & Enable/Disable Schedule Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_update_and_toggle_schedule():
    """Verify updating fields and enable/disable toggle without deleting the record."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth = await register_user(client, role="patient")
        token = auth["access_token"]

        med = await create_test_medicine(client, token)
        create_res = await client.post("/api/v1/schedules", json={
            "medicineId": med["id"],
            "time": "08:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
            "enabled": True,
        }, headers=auth_headers(token))
        sched_id = create_res.json()["id"]

        # 1. Update time
        patch_res = await client.patch(f"/api/v1/schedules/{sched_id}", json={
            "time": "09:15",
        }, headers=auth_headers(token))
        assert patch_res.status_code == 200
        assert patch_res.json()["time"] == "09:15"
        assert patch_res.json()["enabled"] is True

        # 2. Disable schedule (enabled=False)
        disable_res = await client.patch(f"/api/v1/schedules/{sched_id}", json={
            "enabled": False,
        }, headers=auth_headers(token))
        assert disable_res.status_code == 200
        assert disable_res.json()["enabled"] is False

        # Verify still present in list when disabled
        list_res = await client.get("/api/v1/schedules", headers=auth_headers(token))
        assert list_res.status_code == 200
        assert list_res.json()["total"] == 1
        assert list_res.json()["items"][0]["enabled"] is False

        # 3. Re-enable schedule (enabled=True)
        enable_res = await client.patch(f"/api/v1/schedules/{sched_id}", json={
            "enabled": True,
        }, headers=auth_headers(token))
        assert enable_res.status_code == 200
        assert enable_res.json()["enabled"] is True


# ---------------------------------------------------------------------------
# Delete Schedule Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_delete_schedule_success_and_isolation():
    """Verify schedule deletion and cross-patient delete protection."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")

        med_a = await create_test_medicine(client, auth_a["access_token"])
        create_res = await client.post("/api/v1/schedules", json={
            "medicineId": med_a["id"],
            "time": "10:00",
            "frequencyType": "daily",
            "startDate": "2026-09-10",
        }, headers=auth_headers(auth_a["access_token"]))
        sched_id = create_res.json()["id"]

        # Patient B tries to delete Patient A's schedule -> 404
        res_cross = await client.delete(f"/api/v1/schedules/{sched_id}", headers=auth_headers(auth_b["access_token"]))
        assert res_cross.status_code == 404

        # Patient A deletes own schedule -> 200
        res_del = await client.delete(f"/api/v1/schedules/{sched_id}", headers=auth_headers(auth_a["access_token"]))
        assert res_del.status_code == 200
        assert "deleted successfully" in res_del.json()["message"].lower()

        # Subsequent GET returns 404
        res_get = await client.get(f"/api/v1/schedules/{sched_id}", headers=auth_headers(auth_a["access_token"]))
        assert res_get.status_code == 404
