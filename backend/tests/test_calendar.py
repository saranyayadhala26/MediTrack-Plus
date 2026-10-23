"""Unit and integration tests for Medication Calendar & Adherence Streaks (Phase 8).

Tests cover:
1. Daily schedule calendar occurrence
2. Weekly schedule occurrence
3. Custom schedule occurrence
4. Medicine date bounds (startDate / endDate)
5. Disabled schedule (no occurrences)
6. Date range filtering (startDate / endDate)
7. Pending occurrence (no activity record)
8. Taken occurrence
9. Skipped occurrence with clinical reason
10. Snoozed occurrence with snooze metadata
11. Patient isolation (cross-patient access returns 404)
12. Unauthenticated request (returns 401)
13. Caregiver permissions (active assignment allowed, unassigned receives 403)
14. Streak with consecutive adherent days
15. Streak broken by non-adherent day
16. Multiple doses per day (both must be taken for day adherence)
17. Multiple medicines on the same day
18. Future dates strictly excluded from streak calculation
19. Calendar day status aggregate rules (month view)
"""

from datetime import date, timedelta
import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.db.mongodb import (
    get_activities_collection,
    get_caregivers_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.main import app
from app.models.collections import create_caregiver_document
from app.utils.mongo import to_object_id


def unique_email(prefix: str = "cal_test") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_user(client: AsyncClient, role: str = "patient") -> dict:
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
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_daily_schedule_occurrence():
    """1. Verify a daily schedule creates an occurrence for each day in range."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        # Create medicine
        med_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Metformin",
                "dosage": "500",
                "dosageUnit": "mg",
                "frequency": "Daily",
                "startDate": "2026-09-01",
                "endDate": "2026-09-30",
            },
            headers=headers,
        )
        assert med_res.status_code == 201
        med_id = med_res.json()["id"]

        # Create daily schedule
        sched_res = await client.post(
            "/api/v1/schedules",
            json={
                "medicineId": med_id,
                "time": "08:00",
                "frequencyType": "daily",
                "enabled": True,
            },
            headers=headers,
        )
        assert sched_res.status_code == 201

        # Query calendar for 3 days
        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-12&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        data = cal_res.json()
        assert data["totalOccurrences"] == 3
        dates = [o["date"] for o in data["occurrences"]]
        assert dates == ["2026-09-10", "2026-09-11", "2026-09-12"]
        assert all(o["status"] == "Pending" for o in data["occurrences"])


@pytest.mark.asyncio
async def test_weekly_schedule_occurrence():
    """2. Verify weekly schedule only creates occurrences on specified days of week."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Vitamin D", "dosage": "1000", "dosageUnit": "unit", "frequency": "Weekly"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        # 2026-09-14 is Monday (schema_day=1), 2026-09-16 is Wednesday (schema_day=3)
        # Schedule on Mondays (1) and Wednesdays (3)
        sched_res = await client.post(
            "/api/v1/schedules",
            json={
                "medicineId": med_id,
                "time": "09:00",
                "frequencyType": "weekly",
                "daysOfWeek": [1, 3],
                "startDate": "2026-09-10",
                "enabled": True,
            },
            headers=headers,
        )
        assert sched_res.status_code == 201

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-14&endDate=2026-09-20&clientDate=2026-09-14",
            headers=headers,
        )
        assert cal_res.status_code == 200
        data = cal_res.json()
        # Mon (14th) and Wed (16th) in that week
        assert data["totalOccurrences"] == 2
        dates = [o["date"] for o in data["occurrences"]]
        assert dates == ["2026-09-14", "2026-09-16"]


@pytest.mark.asyncio
async def test_custom_schedule_occurrence():
    """3. Verify custom schedule only creates occurrences on specified custom dates."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "B12 Shot", "dosage": "1", "dosageUnit": "ml", "frequency": "Custom"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={
                "medicineId": med_id,
                "time": "10:00",
                "frequencyType": "custom",
                "startDate": "2026-09-10",
                "dates": ["2026-09-15", "2026-09-22"],
                "enabled": True,
            },
            headers=headers,
        )
        assert sched_res.status_code == 201

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-30&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        data = cal_res.json()
        assert data["totalOccurrences"] == 2
        dates = [o["date"] for o in data["occurrences"]]
        assert dates == ["2026-09-15", "2026-09-22"]


@pytest.mark.asyncio
async def test_medicine_date_bounds():
    """4. Verify medicine startDate and endDate clip calendar occurrences."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        # Medicine only valid between 2026-09-12 and 2026-09-14
        med_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Antibiotic",
                "dosage": "250",
                "dosageUnit": "mg",
                "frequency": "Daily",
                "startDate": "2026-09-12",
                "endDate": "2026-09-14",
            },
            headers=headers,
        )
        med_id = med_res.json()["id"]

        await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "08:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )

        # Query wider window: 2026-09-10 to 2026-09-16
        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-16&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        data = cal_res.json()
        # Should only have 12th, 13th, 14th
        assert data["totalOccurrences"] == 3
        dates = [o["date"] for o in data["occurrences"]]
        assert dates == ["2026-09-12", "2026-09-13", "2026-09-14"]


@pytest.mark.asyncio
async def test_disabled_schedule():
    """5. Verify disabled schedule produces zero calendar occurrences."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Aspirin", "dosage": "81", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        # Disabled schedule
        await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "08:00", "frequencyType": "daily", "enabled": False},
            headers=headers,
        )

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-15&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        assert cal_res.json()["totalOccurrences"] == 0


@pytest.mark.asyncio
async def test_date_range_filtering():
    """6. Verify calendar respects requested startDate and endDate strictly."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Statin", "dosage": "20", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "20:00", "frequencyType": "daily", "startDate": "2026-09-10", "enabled": True},
            headers=headers,
        )

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-11&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        assert cal_res.json()["totalOccurrences"] == 2


@pytest.mark.asyncio
async def test_pending_occurrence():
    """7. Verify unrecorded scheduled occurrence returns status Pending."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Lisinopril", "dosage": "10", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "09:00", "frequencyType": "daily", "startDate": "2026-09-10", "enabled": True},
            headers=headers,
        )

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-10&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        occ = cal_res.json()["occurrences"][0]
        assert occ["status"] == "Pending"
        assert occ["activityId"] is None


@pytest.mark.asyncio
async def test_taken_occurrence():
    """8. Verify occurrence with recorded activity reflects Taken status."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Metformin", "dosage": "500", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "08:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )
        sched_id = sched_res.json()["id"]

        # Record Taken
        act_res = await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-10",
                "scheduledTime": "08:00",
                "action": "Taken",
            },
            headers=headers,
        )
        assert act_res.status_code == 201

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-10&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        occ = cal_res.json()["occurrences"][0]
        assert occ["status"] == "Taken"
        assert occ["activityId"] is not None


@pytest.mark.asyncio
async def test_skipped_occurrence_with_reason():
    """9. Verify Skipped occurrence reflects Skipped status and clinical skipReason."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Metformin", "dosage": "500", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "12:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )
        sched_id = sched_res.json()["id"]

        # Record Skipped with reason
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-10",
                "scheduledTime": "12:00",
                "action": "Skipped",
                "skipReason": "Feeling unwell",
            },
            headers=headers,
        )

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-10&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        occ = cal_res.json()["occurrences"][0]
        assert occ["status"] == "Skipped"
        assert occ["skipReason"] == "Feeling unwell"


@pytest.mark.asyncio
async def test_snoozed_occurrence():
    """10. Verify Snoozed occurrence reflects Snoozed status and snooze count."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Thyroid Med", "dosage": "50", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "07:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )
        sched_id = sched_res.json()["id"]

        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-10",
                "scheduledTime": "07:00",
                "action": "Snoozed",
            },
            headers=headers,
        )

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-10&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        occ = cal_res.json()["occurrences"][0]
        assert occ["status"] == "Snoozed"
        assert occ["wasSnoozed"] is True
        assert occ["snoozeCount"] >= 1


@pytest.mark.asyncio
async def test_patient_isolation():
    """11. Verify cross-patient calendar access returns 404 (safe privacy)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient1 = await register_user(client, "patient")
        patient2 = await register_user(client, "patient")

        p1_headers = auth_headers(patient1["access_token"])
        p2_id = patient2["user"]["id"]

        # Patient 1 attempts to pass Patient 2's id
        res = await client.get(
            f"/api/v1/medication-calendar?patientId={p2_id}",
            headers=p1_headers,
        )
        assert res.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_request():
    """12. Verify unauthenticated requests return 401 Unauthorized."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/medication-calendar")
        assert res.status_code == 401

        streak_res = await client.get("/api/v1/medication-calendar/streaks")
        assert streak_res.status_code == 401


@pytest.mark.asyncio
async def test_caregiver_permissions():
    """13. Verify active caregiver can view calendar, while unassigned caregiver is rejected with 403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_data = await register_user(client, "patient")
        caregiver_data = await register_user(client, "caregiver")
        unassigned_caregiver = await register_user(client, "caregiver")

        patient_id = patient_data["user"]["id"]
        cg_headers = auth_headers(caregiver_data["access_token"])
        unassigned_headers = auth_headers(unassigned_caregiver["access_token"])

        # Unassigned caregiver -> 403
        bad_res = await client.get(
            f"/api/v1/medication-calendar?patientId={patient_id}",
            headers=unassigned_headers,
        )
        assert bad_res.status_code == 403

        # Assign caregiver
        caregivers_coll = get_caregivers_collection()
        doc = create_caregiver_document(
            patient_id=to_object_id(patient_id),
            caregiver_name="Caring Relative",
            caregiver_email=caregiver_data["user"]["email"],
            caregiver_phone="+1-555-4321",
            relationship="Child",
            status="active",
        )
        await caregivers_coll.insert_one(doc)

        # Assigned caregiver -> 200 OK
        good_res = await client.get(
            f"/api/v1/medication-calendar?patientId={patient_id}",
            headers=cg_headers,
        )
        assert good_res.status_code == 200


@pytest.mark.asyncio
async def test_streak_consecutive_adherent_days():
    """14. Verify consecutive adherent days correctly increment currentStreak and longestStreak."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Daily Statin", "dosage": "20", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "08:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )
        sched_id = sched_res.json()["id"]

        # Days: 2026-09-08, 2026-09-09, 2026-09-10 (all taken)
        for day_str in ["2026-09-08", "2026-09-09", "2026-09-10"]:
            await client.post(
                "/api/v1/medication-activities",
                json={
                    "medicineId": med_id,
                    "scheduleId": sched_id,
                    "scheduledDate": day_str,
                    "scheduledTime": "08:00",
                    "action": "Taken",
                },
                headers=headers,
            )

        streak_res = await client.get(
            "/api/v1/medication-calendar/streaks?clientDate=2026-09-10",
            headers=headers,
        )
        assert streak_res.status_code == 200
        streak = streak_res.json()
        assert streak["currentStreak"] >= 3
        assert streak["longestStreak"] >= 3
        assert streak["totalAdherentDays"] >= 3


@pytest.mark.asyncio
async def test_streak_broken_by_non_adherent_day():
    """15. Verify a skipped dose on a past day breaks the streak."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Blood Pressure", "dosage": "5", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "09:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )
        sched_id = sched_res.json()["id"]

        # 2026-09-08: Taken
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-08",
                "scheduledTime": "09:00",
                "action": "Taken",
            },
            headers=headers,
        )
        # 2026-09-09: Skipped
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-09",
                "scheduledTime": "09:00",
                "action": "Skipped",
                "skipReason": "Forgot",
            },
            headers=headers,
        )
        # 2026-09-10: Taken
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-10",
                "scheduledTime": "09:00",
                "action": "Taken",
            },
            headers=headers,
        )

        streak_res = await client.get(
            "/api/v1/medication-calendar/streaks?clientDate=2026-09-10",
            headers=headers,
        )
        assert streak_res.status_code == 200
        streak = streak_res.json()
        # Today (10th) is Taken, but 9th was Skipped, so currentStreak is only 1!
        assert streak["currentStreak"] == 1


@pytest.mark.asyncio
async def test_streak_multiple_doses_per_day():
    """16. Verify that if 2 doses are scheduled on a day, taking only 1 does NOT make the day adherent."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Twice Daily Med", "dosage": "500", "dosageUnit": "mg", "frequency": "Twice daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        # Sched 1: 08:00
        sched1 = (await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "08:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )).json()["id"]

        # Sched 2: 20:00
        sched2 = (await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "20:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )).json()["id"]

        # Day 2026-09-09 (past day): Dose 1 Taken, Dose 2 Skipped
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched1,
                "scheduledDate": "2026-09-09",
                "scheduledTime": "08:00",
                "action": "Taken",
            },
            headers=headers,
        )
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched2,
                "scheduledDate": "2026-09-09",
                "scheduledTime": "20:00",
                "action": "Skipped",
                "skipReason": "Forgot",
            },
            headers=headers,
        )

        streak_res = await client.get(
            "/api/v1/medication-calendar/streaks?clientDate=2026-09-10",
            headers=headers,
        )
        assert streak_res.status_code == 200
        streak = streak_res.json()
        # 2026-09-09 is non-adherent because 1 dose was skipped
        assert streak["totalAdherentDays"] == 0


@pytest.mark.asyncio
async def test_multiple_medicines_same_day():
    """17. Verify occurrences from multiple medicines on the same day are aggregated correctly."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        # Med 1: Metformin
        m1 = (await client.post(
            "/api/v1/medicines",
            json={"name": "Metformin", "dosage": "500", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )).json()["id"]

        # Med 2: Lisinopril
        m2 = (await client.post(
            "/api/v1/medicines",
            json={"name": "Lisinopril", "dosage": "10", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )).json()["id"]

        await client.post(
            "/api/v1/schedules",
            json={"medicineId": m1, "time": "08:00", "frequencyType": "daily", "startDate": "2026-09-10", "enabled": True},
            headers=headers,
        )
        await client.post(
            "/api/v1/schedules",
            json={"medicineId": m2, "time": "09:00", "frequencyType": "daily", "startDate": "2026-09-10", "enabled": True},
            headers=headers,
        )

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-10&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        data = cal_res.json()
        assert data["totalOccurrences"] == 2
        med_names = {o["medicineName"] for o in data["occurrences"]}
        assert med_names == {"Metformin", "Lisinopril"}


@pytest.mark.asyncio
async def test_future_dates_excluded_from_streak():
    """18. Verify future dates (D > clientDate) are strictly excluded from streak calculation."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Multivitamin", "dosage": "1", "dosageUnit": "tablet", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={"medicineId": med_id, "time": "08:00", "frequencyType": "daily", "enabled": True},
            headers=headers,
        )
        sched_id = sched_res.json()["id"]

        # Even if someone somehow recorded a future activity (e.g. 2026-09-25)
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-25",
                "scheduledTime": "08:00",
                "action": "Taken",
            },
            headers=headers,
        )

        # Reference date is 2026-09-10
        streak_res = await client.get(
            "/api/v1/medication-calendar/streaks?clientDate=2026-09-10",
            headers=headers,
        )
        assert streak_res.status_code == 200
        streak = streak_res.json()
        # Future date cannot make streak positive
        assert streak["currentStreak"] == 0
        assert streak["totalAdherentDays"] == 0


@pytest.mark.asyncio
async def test_calendar_day_status_aggregate():
    """19. Verify day-level status aggregate rule (Correction 4)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_data = await register_user(client, "patient")
        headers = auth_headers(auth_data["access_token"])

        med_res = await client.post(
            "/api/v1/medicines",
            json={"name": "Thyroxine", "dosage": "100", "dosageUnit": "mg", "frequency": "Daily"},
            headers=headers,
        )
        med_id = med_res.json()["id"]

        sched_res = await client.post(
            "/api/v1/schedules",
            json={
                "medicineId": med_id,
                "time": "07:00",
                "frequencyType": "daily",
                "startDate": "2026-09-10",
                "enabled": True,
            },
            headers=headers,
        )
        sched_id = sched_res.json()["id"]

        # Day 1: Taken -> Adherent
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-10",
                "scheduledTime": "07:00",
                "action": "Taken",
            },
            headers=headers,
        )

        # Day 2: Skipped -> Skipped
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-11",
                "scheduledTime": "07:00",
                "action": "Skipped",
                "skipReason": "Away from home",
            },
            headers=headers,
        )

        # Day 3: Snoozed -> Snoozed
        await client.post(
            "/api/v1/medication-activities",
            json={
                "medicineId": med_id,
                "scheduleId": sched_id,
                "scheduledDate": "2026-09-12",
                "scheduledTime": "07:00",
                "action": "Snoozed",
            },
            headers=headers,
        )

        # Day 4: Pending (no activity) -> Pending

        cal_res = await client.get(
            "/api/v1/medication-calendar?startDate=2026-09-10&endDate=2026-09-13&clientDate=2026-09-10",
            headers=headers,
        )
        assert cal_res.status_code == 200
        days = {d["date"]: d["status"] for d in cal_res.json()["days"]}
        assert days["2026-09-10"] == "Adherent"
        assert days["2026-09-11"] == "Skipped"
        assert days["2026-09-12"] == "Snoozed"
        assert days["2026-09-13"] == "Pending"
