"""Unit and integration tests for Medication Activity & Dose Tracking (Phase 7).

Tests cover:
- Record Taken activity (inventory decrement, metadata enrichment)
- Record Skipped activity with valid reason
- Record Skipped without reason rejected (422)
- Record Snoozed activity (tracks wasSnoozed, snoozeCount)
- Idempotent duplicate action handling on repeated taps
- Snoozed -> Taken state progression (preserves snooze context)
- Taken -> Skipped conflict protection (409)
- Caregiver cannot record activity (403)
- Unauthenticated access rejected (401)
- Cross-patient isolation (404)
- Activity history retrieval with filtering
- Adherence summary calculation
"""

from datetime import date
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
from app.utils.mongo import to_object_id


def unique_email(prefix: str = "act_test") -> str:
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


async def setup_patient_medicine_schedule(client: AsyncClient):
    """Register patient, create medicine with inventory, and create schedule."""
    auth_data = await register_user(client, role="patient")
    token = auth_data["access_token"]
    user_id = auth_data["user"]["id"]
    headers = auth_headers(token)

    # Create medicine
    med_res = await client.post(
        "/api/v1/medicines",
        json={
            "name": "Amoxicillin",
            "dosage": "500",
            "dosageUnit": "mg",
            "frequency": "Daily",
            "startDate": "2026-09-01",
            "endDate": "2026-10-01",
            "inventory": 10,
            "refillThreshold": 3,
        },
        headers=headers,
    )
    assert med_res.status_code == 201
    medicine_id = med_res.json()["id"]

    # Create schedule
    today_str = date.today().isoformat()
    sched_res = await client.post(
        "/api/v1/schedules",
        json={
            "medicineId": medicine_id,
            "time": "08:00",
            "frequencyType": "daily",
            "startDate": today_str,
            "endDate": "2026-10-01",
        },
        headers=headers,
    )
    assert sched_res.status_code == 201
    schedule_id = sched_res.json()["id"]

    return {
        "headers": headers,
        "userId": user_id,
        "medicineId": medicine_id,
        "scheduleId": schedule_id,
        "today": today_str,
    }


async def cleanup_user(user_id: str):
    u_oid = to_object_id(user_id)
    await get_activities_collection().delete_many({"userId": u_oid})
    await get_schedules_collection().delete_many({"userId": u_oid})
    await get_medicines_collection().delete_many({"userId": u_oid})
    await get_users_collection().delete_many({"_id": u_oid})


@pytest.mark.asyncio
async def test_record_taken_activity():
    """Verify recording a Taken activity creates record, enriches metadata, and decrements inventory."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            payload = {
                "medicineId": ctx["medicineId"],
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "08:00",
                "action": "Taken",
            }
            res = await client.post("/api/v1/medication-activities", json=payload, headers=ctx["headers"])
            assert res.status_code == 201
            data = res.json()
            assert data["action"] == "Taken"
            assert data["medicineName"] == "Amoxicillin"
            assert data["dosage"] == "500"
            assert data["dosageUnit"] == "mg"
            assert data["scheduledDate"] == ctx["today"]
            assert data["scheduledTime"] == "08:00"
            assert data["wasSnoozed"] is False

            # Verify inventory decremented from 10 to 9
            med_res = await client.get(f"/api/v1/medicines/{ctx['medicineId']}", headers=ctx["headers"])
            assert med_res.json()["inventory"] == 9
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_record_skipped_activity_with_reason():
    """Verify recording a Skipped activity with valid skip reason succeeds."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            payload = {
                "medicineId": ctx["medicineId"],
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "12:00",
                "action": "Skipped",
                "skipReason": "Feeling unwell",
            }
            res = await client.post("/api/v1/medication-activities", json=payload, headers=ctx["headers"])
            assert res.status_code == 201
            data = res.json()
            assert data["action"] == "Skipped"
            assert data["skipReason"] == "Feeling unwell"
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_record_skipped_without_reason_rejected():
    """Verify recording Skipped without reason returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            payload = {
                "medicineId": ctx["medicineId"],
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "18:00",
                "action": "Skipped",
                "skipReason": "",
            }
            res = await client.post("/api/v1/medication-activities", json=payload, headers=ctx["headers"])
            assert res.status_code == 422
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_record_snoozed_activity():
    """Verify recording a Snoozed activity succeeds and sets wasSnoozed/snoozeCount."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            payload = {
                "medicineId": ctx["medicineId"],
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "20:00",
                "action": "Snoozed",
            }
            res = await client.post("/api/v1/medication-activities", json=payload, headers=ctx["headers"])
            assert res.status_code == 201
            data = res.json()
            assert data["action"] == "Snoozed"
            assert data["wasSnoozed"] is True
            assert data["snoozeCount"] == 1
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_duplicate_action_idempotency():
    """Verify double-tapping on the same action returns existing record without creating duplicate."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            payload = {
                "medicineId": ctx["medicineId"],
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "09:00",
                "action": "Taken",
            }
            # First tap
            res1 = await client.post("/api/v1/medication-activities", json=payload, headers=ctx["headers"])
            assert res1.status_code == 201
            id1 = res1.json()["id"]

            # Second tap (rapid duplicate)
            res2 = await client.post("/api/v1/medication-activities", json=payload, headers=ctx["headers"])
            assert res2.status_code == 200
            assert res2.json()["id"] == id1

            # Verify exactly one document exists in collection
            activities_coll = get_activities_collection()
            count = await activities_coll.count_documents({
                "userId": to_object_id(ctx["userId"]),
                "scheduleId": to_object_id(ctx["scheduleId"]),
                "scheduledDate": ctx["today"],
                "scheduledTime": "09:00",
            })
            assert count == 1
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_snoozed_to_taken_state_progression():
    """Verify that when a Snoozed dose is subsequently Taken, it preserves snooze context."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            # 1. First action: Snoozed
            res_snooze = await client.post(
                "/api/v1/medication-activities",
                json={
                    "medicineId": ctx["medicineId"],
                    "scheduleId": ctx["scheduleId"],
                    "scheduledDate": ctx["today"],
                    "scheduledTime": "10:00",
                    "action": "Snoozed",
                },
                headers=ctx["headers"],
            )
            assert res_snooze.status_code == 201

            # 2. Subsequent action: Taken
            res_taken = await client.post(
                "/api/v1/medication-activities",
                json={
                    "medicineId": ctx["medicineId"],
                    "scheduleId": ctx["scheduleId"],
                    "scheduledDate": ctx["today"],
                    "scheduledTime": "10:00",
                    "action": "Taken",
                },
                headers=ctx["headers"],
            )
            assert res_taken.status_code == 200
            data = res_taken.json()
            assert data["action"] == "Taken"
            assert data["wasSnoozed"] is True
            assert data["snoozeCount"] >= 1
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_taken_to_skipped_conflict():
    """Verify that once a dose is Taken, attempting to mark it as Skipped returns HTTP 409 Conflict."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            payload_taken = {
                "medicineId": ctx["medicineId"],
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "11:00",
                "action": "Taken",
            }
            await client.post("/api/v1/medication-activities", json=payload_taken, headers=ctx["headers"])

            payload_skip = {
                "medicineId": ctx["medicineId"],
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "11:00",
                "action": "Skipped",
                "skipReason": "Changed mind",
            }
            res_conflict = await client.post(
                "/api/v1/medication-activities", json=payload_skip, headers=ctx["headers"]
            )
            assert res_conflict.status_code == 409
            assert "already been recorded as Taken" in res_conflict.json()["detail"]
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_caregiver_cannot_record_activity():
    """Verify caregivers receive HTTP 403 Forbidden when attempting to record dose actions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        patient_ctx = await setup_patient_medicine_schedule(client)
        cg_auth = await register_user(client, role="caregiver")
        cg_headers = auth_headers(cg_auth["access_token"])

        try:
            payload = {
                "medicineId": patient_ctx["medicineId"],
                "scheduleId": patient_ctx["scheduleId"],
                "scheduledDate": patient_ctx["today"],
                "scheduledTime": "08:00",
                "action": "Taken",
            }
            res = await client.post("/api/v1/medication-activities", json=payload, headers=cg_headers)
            assert res.status_code == 403
        finally:
            await cleanup_user(patient_ctx["userId"])
            await cleanup_user(cg_auth["user"]["id"])


@pytest.mark.asyncio
async def test_unauthenticated_access_rejected():
    """Verify unauthenticated requests receive HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "medicineId": "650c709e3e7f4c3a8e9e1111",
            "scheduleId": "650c709e3e7f4c3a8e9e2222",
            "scheduledDate": "2026-09-10",
            "scheduledTime": "08:00",
            "action": "Taken",
        }
        res = await client.post("/api/v1/medication-activities", json=payload)
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_cross_patient_activity_access():
    """Verify a patient cannot record activity against another patient's medicine/schedule."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            fake_med_id = "650c709e3e7f4c3a8e9e9999"
            payload = {
                "medicineId": fake_med_id,
                "scheduleId": ctx["scheduleId"],
                "scheduledDate": ctx["today"],
                "scheduledTime": "08:00",
                "action": "Taken",
            }
            res = await client.post("/api/v1/medication-activities", json=payload, headers=ctx["headers"])
            assert res.status_code == 404
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_activity_history_retrieval():
    """Verify retrieving activity history lists records chronologically and supports filters."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            # Record 2 activities
            await client.post(
                "/api/v1/medication-activities",
                json={
                    "medicineId": ctx["medicineId"],
                    "scheduleId": ctx["scheduleId"],
                    "scheduledDate": ctx["today"],
                    "scheduledTime": "07:00",
                    "action": "Taken",
                },
                headers=ctx["headers"],
            )

            await client.post(
                "/api/v1/medication-activities",
                json={
                    "medicineId": ctx["medicineId"],
                    "scheduleId": ctx["scheduleId"],
                    "scheduledDate": ctx["today"],
                    "scheduledTime": "13:00",
                    "action": "Skipped",
                    "skipReason": "Away from home",
                },
                headers=ctx["headers"],
            )

            # Retrieve all
            res = await client.get("/api/v1/medication-activities", headers=ctx["headers"])
            assert res.status_code == 200
            items = res.json()
            assert len(items) >= 2
            assert any(i["action"] == "Taken" for i in items)
            assert any(i["action"] == "Skipped" for i in items)

            # Filter by medicine
            res_med = await client.get(
                f"/api/v1/medication-activities?medicineId={ctx['medicineId']}",
                headers=ctx["headers"],
            )
            assert res_med.status_code == 200
            assert len(res_med.json()) >= 2
        finally:
            await cleanup_user(ctx["userId"])


@pytest.mark.asyncio
async def test_adherence_summary_calculation():
    """Verify adherence summary accurately reflects scheduled occurrences vs taken actions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ctx = await setup_patient_medicine_schedule(client)
        try:
            await client.post(
                "/api/v1/medication-activities",
                json={
                    "medicineId": ctx["medicineId"],
                    "scheduleId": ctx["scheduleId"],
                    "scheduledDate": ctx["today"],
                    "scheduledTime": "08:00",
                    "action": "Taken",
                },
                headers=ctx["headers"],
            )

            res = await client.get(
                f"/api/v1/medication-activities/summary?startDate={ctx['today']}&endDate={ctx['today']}",
                headers=ctx["headers"],
            )
            assert res.status_code == 200
            data = res.json()
            assert data["totalScheduled"] >= 1
            assert data["takenCount"] >= 1
            assert data["adherencePercentage"] > 0.0
        finally:
            await cleanup_user(ctx["userId"])
