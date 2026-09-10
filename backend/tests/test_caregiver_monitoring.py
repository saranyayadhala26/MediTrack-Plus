"""Unit and integration tests for Caregiver Monitoring APIs (Phase 9.2.5).

Covers all 32 required test scenarios:
- PATIENT LIST:
  1. Caregiver with one active patient
  2. Caregiver with multiple active patients
  3. Revoked relationship excluded
  4. No active relationships returns empty list
  5. Patient token denied (403)
  6. Non-caregiver token denied (401/403)

- SUMMARY:
  7. Active caregiver can access linked patient
  8. Caregiver cannot access unrelated patient (403)
  9. Revoked caregiver cannot access former patient (403)
  10. Invalid patient ID handled safely (404)
  11. Summary reuses Phase 8 behavior (calendar & streak adherence)
  12. Patient data isolation preserved

- ALERTS:
  13. Caregiver receives own alerts
  14. Caregiver cannot see another caregiver's alerts
  15. Only caregiver_alert type returned
  16. Empty alert list handled
  17. Alert metadata returned safely

- READ:
  18. Caregiver can mark own alert read
  19. Caregiver cannot mark another caregiver's alert read (404, doc unchanged)
  20. Repeated read operation is safe/idempotent
  21. Invalid alert ID handled safely (404)

- READ-ONLY GUARANTEE:
  22. Caregiver cannot create medicine (POST /api/v1/medicines -> 403)
  23. Caregiver cannot modify medicine (PATCH /api/v1/medicines/{id} -> 403)
  24. Caregiver cannot delete medicine (DELETE /api/v1/medicines/{id} -> 403)
  25. Caregiver cannot create schedule (POST /api/v1/schedules -> 403)
  26. Caregiver cannot modify schedule (PATCH /api/v1/schedules/{id} -> 403)
  27. Caregiver cannot delete schedule (DELETE /api/v1/schedules/{id} -> 403)
  28. Caregiver cannot log medication activity (POST /api/v1/medication-activities -> 403)

- PRIVACY & ISOLATION:
  29. Revoked relationship immediately loses monitoring access
  30. No passwordHash/JWT/auth secrets returned
  31. Cross-patient access does not leak existence
  32. Cross-caregiver alert access does not leak alert existence
"""

import uuid
from datetime import datetime, timezone
import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

from app.db.mongodb import get_notifications_collection
from app.main import app
from app.models.collections import create_notification_document, now_utc
from app.schemas.notification import NotificationType
from app.services.caregiver_alert_service import build_fingerprint


def unique_email(prefix: str = "cg_mon") -> str:
    """Generate a unique test email address."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def register_user(client: AsyncClient, role: str = "patient", email: str = None) -> dict:
    """Helper to register a user and return the auth response dictionary."""
    user_email = email or unique_email(role)
    password = "SecurePassword123!"
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "fullName": f"Test {role.capitalize()}",
            "email": user_email,
            "password": password,
            "confirmPassword": password,
            "role": role,
            "emergencyContact": "+1-555-9876",
        },
    )
    assert res.status_code == 201, f"Registration failed: {res.text}"
    return res.json()


def auth_headers(token: str) -> dict:
    """Helper to generate Authorization Bearer header."""
    return {"Authorization": f"Bearer {token}"}


async def link_patient_caregiver(
    client: AsyncClient,
    patient_token: str,
    caregiver_email: str,
    relationship: str = "Daughter",
) -> dict:
    """Helper for patient linking a caregiver."""
    res = await client.post(
        "/api/v1/caregivers",
        headers=auth_headers(patient_token),
        json={
            "caregiverName": "Assigned Caregiver",
            "caregiverEmail": caregiver_email,
            "caregiverPhone": "+1-555-0100",
            "relationship": relationship,
        },
    )
    assert res.status_code in (200, 201), f"Linking failed: {res.text}"
    return res.json()


# ==============================================================================
# PATIENT LIST TESTS (Scenarios 1 - 6)
# ==============================================================================

@pytest.mark.asyncio
async def test_patient_list_caregiver_with_one_active_patient():
    """1. Caregiver with one active linked patient sees that patient in /patients."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")
        caregiver_auth = await register_user(client, role="caregiver")

        await link_patient_caregiver(client, patient_auth["access_token"], caregiver_auth["user"]["email"])

        res = await client.get("/api/v1/caregivers/patients", headers=auth_headers(caregiver_auth["access_token"]))
        assert res.status_code == 200
        patients = res.json()
        assert len(patients) == 1
        assert patients[0]["patientId"] == patient_auth["user"]["id"]
        assert patients[0]["fullName"] == patient_auth["user"]["fullName"]
        assert patients[0]["status"] == "active"


@pytest.mark.asyncio
async def test_patient_list_caregiver_with_multiple_active_patients():
    """2. Caregiver linked to multiple patients sees all active patients."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt1 = await register_user(client, role="patient")
        pt2 = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        await link_patient_caregiver(client, pt1["access_token"], cg["user"]["email"])
        await link_patient_caregiver(client, pt2["access_token"], cg["user"]["email"])

        res = await client.get("/api/v1/caregivers/patients", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 200
        patients = res.json()
        assert len(patients) == 2
        p_ids = {p["patientId"] for p in patients}
        assert pt1["user"]["id"] in p_ids
        assert pt2["user"]["id"] in p_ids


@pytest.mark.asyncio
async def test_patient_list_revoked_relationship_excluded():
    """3. Revoked relationship is immediately excluded from /caregivers/patients."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        link_data = await link_patient_caregiver(client, pt["access_token"], cg["user"]["email"])

        # Revoke the link as patient
        del_res = await client.delete(f"/api/v1/caregivers/{link_data['id']}", headers=auth_headers(pt["access_token"]))
        assert del_res.status_code == 204

        # Caregiver checks patient list
        res = await client.get("/api/v1/caregivers/patients", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 200
        assert res.json() == []


@pytest.mark.asyncio
async def test_patient_list_no_active_relationships_returns_empty_list():
    """4. Caregiver with no linked patients receives an empty list."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.get("/api/v1/caregivers/patients", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 200
        assert res.json() == []


@pytest.mark.asyncio
async def test_patient_list_patient_token_denied():
    """5. Patient caller is rejected with 403 Forbidden."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")

        res = await client.get("/api/v1/caregivers/patients", headers=auth_headers(pt["access_token"]))
        assert res.status_code == 403
        assert "Caregiver role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_patient_list_non_caregiver_token_denied():
    """6. Unauthenticated caller is rejected with 401 Unauthorized."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/caregivers/patients")
        assert res.status_code == 401


# ==============================================================================
# SUMMARY TESTS (Scenarios 7 - 12)
# ==============================================================================

@pytest.mark.asyncio
async def test_summary_active_caregiver_can_access_linked_patient():
    """7. Active caregiver can access monitoring summary of linked patient."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")
        await link_patient_caregiver(client, pt["access_token"], cg["user"]["email"])

        res = await client.get(
            f"/api/v1/caregivers/patients/{pt['user']['id']}/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["patientId"] == pt["user"]["id"]
        assert "adherencePercentage" in data
        assert "totalScheduledToday" in data
        assert "takenToday" in data
        assert "recentAlerts" in data
        assert "Read-only access" in data["permissionsNote"]


@pytest.mark.asyncio
async def test_summary_caregiver_cannot_access_unrelated_patient():
    """8. Caregiver cannot access monitoring summary of an unlinked patient (403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt_unrelated = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        res = await client.get(
            f"/api/v1/caregivers/patients/{pt_unrelated['user']['id']}/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 403
        assert "Active caregiver assignment required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_summary_revoked_caregiver_cannot_access_former_patient():
    """9. Caregiver whose link was revoked cannot access former patient summary (403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")
        link_data = await link_patient_caregiver(client, pt["access_token"], cg["user"]["email"])

        # Revoke
        await client.delete(f"/api/v1/caregivers/{link_data['id']}", headers=auth_headers(pt["access_token"]))

        res = await client.get(
            f"/api/v1/caregivers/patients/{pt['user']['id']}/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 403
        assert "Active caregiver assignment required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_summary_invalid_patient_id_handled_safely():
    """10. Malformed patient ID receives safe 404 without leaking internal state."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.get(
            "/api/v1/caregivers/patients/invalid-patient-id/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 404
        assert res.json()["detail"] == "Patient records not found."


@pytest.mark.asyncio
async def test_summary_reuses_phase8_behavior():
    """11. Summary reuses Phase 8 calendar and streak adherence logic."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")
        await link_patient_caregiver(client, pt["access_token"], cg["user"]["email"])

        # Create medicine and daily schedule for patient
        med_res = await client.post(
            "/api/v1/medicines",
            headers=auth_headers(pt["access_token"]),
            json={"name": "Atenolol", "dosage": "50", "dosageUnit": "mg", "frequency": "daily"},
        )
        assert med_res.status_code == 201
        med_id = med_res.json()["id"]

        today_str = "2026-09-10"
        sched_res = await client.post(
            "/api/v1/schedules",
            headers=auth_headers(pt["access_token"]),
            json={
                "medicineId": med_id,
                "frequencyType": "daily",
                "time": "08:00",
                "startDate": today_str,
                "dosageQuantity": 1,
            },
        )
        assert sched_res.status_code == 201

        # Check summary for today
        res = await client.get(
            f"/api/v1/caregivers/patients/{pt['user']['id']}/summary?clientDate={today_str}",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 200
        summary = res.json()
        assert summary["totalScheduledToday"] >= 1
        assert summary["takenToday"] == 0


@pytest.mark.asyncio
async def test_summary_patient_data_isolation_preserved():
    """12. Strict isolation: Caregiver A cannot view Patient B's data."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt_b = await register_user(client, role="patient")
        cg_a = await register_user(client, role="caregiver")

        res = await client.get(
            f"/api/v1/caregivers/patients/{pt_b['user']['id']}/summary",
            headers=auth_headers(cg_a["access_token"]),
        )
        assert res.status_code == 403


# ==============================================================================
# ALERTS TESTS (Scenarios 13 - 17)
# ==============================================================================

@pytest.mark.asyncio
async def test_alerts_caregiver_receives_own_alerts():
    """13. Caregiver receives alerts addressed to them via /caregivers/alerts."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        cg_oid = ObjectId(cg["user"]["id"])
        pt_oid = ObjectId(pt["user"]["id"])

        # Insert a caregiver alert directly
        notif_coll = get_notifications_collection()
        fp = build_fingerprint(pt_oid, ObjectId(), ObjectId(), "2026-09-10", "08:00", "RULE_A")
        doc = create_notification_document(
            user_id=cg_oid,
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title="Adherence alert",
            message="Missed dose detected",
            caregiver_id=cg_oid,
            patient_id=pt_oid,
            alert_type="RULE_A",
            fingerprint=fp,
            metadata={"medicineName": "Aspirin"},
        )
        await notif_coll.insert_one(doc)

        res = await client.get("/api/v1/caregivers/alerts", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 200
        alerts = res.json()
        assert len(alerts) >= 1
        assert alerts[0]["alertType"] == "RULE_A"
        assert alerts[0]["caregiverId"] == str(cg_oid)


@pytest.mark.asyncio
async def test_alerts_caregiver_cannot_see_another_caregiver_alerts():
    """14. Caregiver A cannot see Caregiver B's alerts."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg_a = await register_user(client, role="caregiver")
        cg_b = await register_user(client, role="caregiver")

        cg_b_oid = ObjectId(cg_b["user"]["id"])
        pt_oid = ObjectId(pt["user"]["id"])

        notif_coll = get_notifications_collection()
        fp = build_fingerprint(pt_oid, ObjectId(), ObjectId(), "2026-09-10", "08:00", "RULE_B")
        doc = create_notification_document(
            user_id=cg_b_oid,
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title="Adherence alert for B",
            message="Missed dose detected",
            caregiver_id=cg_b_oid,
            patient_id=pt_oid,
            alert_type="RULE_B",
            fingerprint=fp,
        )
        await notif_coll.insert_one(doc)

        res = await client.get("/api/v1/caregivers/alerts", headers=auth_headers(cg_a["access_token"]))
        assert res.status_code == 200
        alerts = res.json()
        # Caregiver A sees none of Caregiver B's alerts
        for a in alerts:
            assert a["caregiverId"] != str(cg_b_oid)


@pytest.mark.asyncio
async def test_alerts_only_caregiver_alert_type_returned():
    """15. Only notifications with type='caregiver_alert' are returned."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")
        cg_oid = ObjectId(cg["user"]["id"])

        notif_coll = get_notifications_collection()
        # Insert a reminder type for the caregiver
        reminder_doc = create_notification_document(
            user_id=cg_oid,
            notification_type="reminder",
            title="Personal Reminder",
            message="Time for your own medication",
            caregiver_id=cg_oid,
        )
        await notif_coll.insert_one(reminder_doc)

        res = await client.get("/api/v1/caregivers/alerts", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 200
        for a in res.json():
            assert a["type"] == NotificationType.CAREGIVER_ALERT.value


@pytest.mark.asyncio
async def test_alerts_empty_alert_list_handled():
    """16. Empty alert list handled smoothly (returns [])."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.get("/api/v1/caregivers/alerts", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 200
        assert res.json() == []


@pytest.mark.asyncio
async def test_alerts_alert_metadata_returned_safely():
    """17. Alert metadata is returned with non-sensitive adherence fields."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        cg_oid = ObjectId(cg["user"]["id"])
        pt_oid = ObjectId(pt["user"]["id"])

        notif_coll = get_notifications_collection()
        fp = build_fingerprint(pt_oid, ObjectId(), ObjectId(), "2026-09-10", "12:00", "RULE_A_B")
        doc = create_notification_document(
            user_id=cg_oid,
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title="Combined alert",
            message="Dose missed",
            caregiver_id=cg_oid,
            patient_id=pt_oid,
            alert_type="RULE_A_B",
            fingerprint=fp,
            metadata={"medicineName": "Metformin", "scheduledTime": "12:00"},
        )
        await notif_coll.insert_one(doc)

        res = await client.get("/api/v1/caregivers/alerts", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 200
        alerts = [a for a in res.json() if a["fingerprint"] == fp]
        assert len(alerts) == 1
        assert alerts[0]["metadata"]["medicineName"] == "Metformin"


# ==============================================================================
# READ TESTS (Scenarios 18 - 21)
# ==============================================================================

@pytest.mark.asyncio
async def test_read_caregiver_can_mark_own_alert_read():
    """18. Caregiver can mark their own alert as read."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        cg_oid = ObjectId(cg["user"]["id"])
        pt_oid = ObjectId(pt["user"]["id"])

        notif_coll = get_notifications_collection()
        doc = create_notification_document(
            user_id=cg_oid,
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title="Adherence alert",
            message="Missed dose",
            caregiver_id=cg_oid,
            patient_id=pt_oid,
            alert_type="RULE_A",
            fingerprint=f"{pt_oid}:m:s:2026-09-10:08:00:RULE_A",
        )
        insert_res = await notif_coll.insert_one(doc)
        alert_id = str(insert_res.inserted_id)

        res = await client.patch(
            f"/api/v1/caregivers/alerts/{alert_id}/read",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 200
        assert res.json()["status"] == "read"


@pytest.mark.asyncio
async def test_read_caregiver_cannot_mark_another_caregiver_alert_read():
    """19. Caregiver A cannot mark Caregiver B's alert as read (returns 404, does not mutate)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg_a = await register_user(client, role="caregiver")
        cg_b = await register_user(client, role="caregiver")

        cg_b_oid = ObjectId(cg_b["user"]["id"])
        pt_oid = ObjectId(pt["user"]["id"])

        notif_coll = get_notifications_collection()
        doc = create_notification_document(
            user_id=cg_b_oid,
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title="Alert for B",
            message="Missed dose",
            caregiver_id=cg_b_oid,
            patient_id=pt_oid,
            alert_type="RULE_A",
            fingerprint=f"{pt_oid}:m:s:2026-09-10:08:00:RULE_A_B",
            status="unread",
        )
        insert_res = await notif_coll.insert_one(doc)
        alert_id = str(insert_res.inserted_id)

        # Caregiver A attempts to read Caregiver B's alert
        res = await client.patch(
            f"/api/v1/caregivers/alerts/{alert_id}/read",
            headers=auth_headers(cg_a["access_token"]),
        )
        assert res.status_code == 404

        # Verify B's document was NOT modified
        fresh_doc = await notif_coll.find_one({"_id": insert_res.inserted_id})
        assert fresh_doc["status"] == "unread"


@pytest.mark.asyncio
async def test_read_repeated_read_operation_is_safe_idempotent():
    """20. Repeated read operation is safe and idempotent."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        cg_oid = ObjectId(cg["user"]["id"])
        notif_coll = get_notifications_collection()
        doc = create_notification_document(
            user_id=cg_oid,
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title="Adherence alert",
            message="Missed dose",
            caregiver_id=cg_oid,
            patient_id=ObjectId(pt["user"]["id"]),
            alert_type="RULE_B",
            fingerprint=f"{pt['user']['id']}:m:s:2026-09-10:08:00:RULE_B",
        )
        insert_res = await notif_coll.insert_one(doc)
        alert_id = str(insert_res.inserted_id)

        # Mark read 1
        res1 = await client.patch(f"/api/v1/caregivers/alerts/{alert_id}/read", headers=auth_headers(cg["access_token"]))
        assert res1.status_code == 200
        assert res1.json()["status"] == "read"

        # Mark read 2
        res2 = await client.patch(f"/api/v1/caregivers/alerts/{alert_id}/read", headers=auth_headers(cg["access_token"]))
        assert res2.status_code == 200
        assert res2.json()["status"] == "read"


@pytest.mark.asyncio
async def test_read_invalid_alert_id_handled_safely():
    """21. Invalid alert ID receives safe 404 response."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.patch("/api/v1/caregivers/alerts/invalid-alert-id/read", headers=auth_headers(cg["access_token"]))
        assert res.status_code == 404
        assert res.json()["detail"] == "Alert not found."


# ==============================================================================
# READ-ONLY GUARANTEE TESTS (Scenarios 22 - 28)
# ==============================================================================

@pytest.mark.asyncio
async def test_read_only_caregiver_cannot_create_medicine():
    """22. Caregiver cannot create medicines (POST /api/v1/medicines -> 403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.post(
            "/api/v1/medicines",
            headers=auth_headers(cg["access_token"]),
            json={"name": "Ibuprofen", "dosage": "400", "dosageUnit": "mg"},
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_read_only_caregiver_cannot_modify_medicine():
    """23. Caregiver cannot modify medicines (PATCH /api/v1/medicines/{id} -> 403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.patch(
            f"/api/v1/medicines/{ObjectId()}",
            headers=auth_headers(cg["access_token"]),
            json={"name": "Modified Name"},
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_read_only_caregiver_cannot_delete_medicine():
    """24. Caregiver cannot delete medicines (DELETE /api/v1/medicines/{id} -> 403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.delete(
            f"/api/v1/medicines/{ObjectId()}",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_read_only_caregiver_cannot_create_schedule():
    """25. Caregiver cannot create schedules (POST /api/v1/schedules -> 403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.post(
            "/api/v1/schedules",
            headers=auth_headers(cg["access_token"]),
            json={
                "medicineId": str(ObjectId()),
                "frequencyType": "daily",
                "time": "08:00",
                "startDate": "2026-09-10",
                "dosageQuantity": 1,
            },
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_read_only_caregiver_cannot_modify_schedule():
    """26. Caregiver cannot modify schedules (PATCH /api/v1/schedules/{id} -> 403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.patch(
            f"/api/v1/schedules/{ObjectId()}",
            headers=auth_headers(cg["access_token"]),
            json={"time": "09:00"},
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_read_only_caregiver_cannot_delete_schedule():
    """27. Caregiver cannot delete schedules (DELETE /api/v1/schedules/{id} -> 403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.delete(
            f"/api/v1/schedules/{ObjectId()}",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_read_only_caregiver_cannot_log_medication_activity():
    """28. Caregiver cannot log Taken/Skipped/Snoozed (POST /api/v1/medication-activities -> 403)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")

        res = await client.post(
            "/api/v1/medication-activities",
            headers=auth_headers(cg["access_token"]),
            json={
                "scheduleId": str(ObjectId()),
                "action": "Taken",
                "scheduledDate": "2026-09-10",
                "scheduledTime": "08:00",
            },
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]


# ==============================================================================
# PRIVACY & ISOLATION TESTS (Scenarios 29 - 32)
# ==============================================================================

@pytest.mark.asyncio
async def test_privacy_revoked_relationship_loses_access():
    """29. Revoking caregiver link immediately terminates all monitoring access."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")
        link_data = await link_patient_caregiver(client, pt["access_token"], cg["user"]["email"])

        # Active -> 200
        res_before = await client.get(
            f"/api/v1/caregivers/patients/{pt['user']['id']}/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res_before.status_code == 200

        # Patient revokes caregiver
        await client.delete(f"/api/v1/caregivers/{link_data['id']}", headers=auth_headers(pt["access_token"]))

        # Revoked -> 403
        res_after = await client.get(
            f"/api/v1/caregivers/patients/{pt['user']['id']}/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res_after.status_code == 403


@pytest.mark.asyncio
async def test_privacy_no_auth_secrets_returned():
    """30. No passwordHash, salt, JWT, or auth secrets in any caregiver monitoring response."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")
        await link_patient_caregiver(client, pt["access_token"], cg["user"]["email"])

        # Check /patients response
        res_patients = await client.get("/api/v1/caregivers/patients", headers=auth_headers(cg["access_token"]))
        assert res_patients.status_code == 200
        text_patients = res_patients.text.lower()
        for forbidden in ("password", "hashedpassword", "passwordhash", "secret", "jwt", "access_token"):
            assert forbidden not in text_patients, f"Found sensitive key {forbidden} in /patients response"

        # Check /summary response
        res_summary = await client.get(
            f"/api/v1/caregivers/patients/{pt['user']['id']}/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res_summary.status_code == 200
        text_summary = res_summary.text.lower()
        for forbidden in ("password", "hashedpassword", "passwordhash", "secret", "jwt", "access_token"):
            assert forbidden not in text_summary, f"Found sensitive key {forbidden} in /summary response"


@pytest.mark.asyncio
async def test_privacy_cross_patient_access_does_not_leak_existence():
    """31. Accessing unlinked patient produces uniform 403 Forbidden without leaking existence."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cg = await register_user(client, role="caregiver")
        unlinked_pt_id = str(ObjectId())

        res = await client.get(
            f"/api/v1/caregivers/patients/{unlinked_pt_id}/summary",
            headers=auth_headers(cg["access_token"]),
        )
        assert res.status_code == 403
        assert res.json()["detail"] == "Access forbidden: Active caregiver assignment required."


@pytest.mark.asyncio
async def test_privacy_cross_caregiver_alert_access_does_not_leak_existence():
    """32. Querying or patching another caregiver's alert produces 404 without leaking its existence."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        pt = await register_user(client, role="patient")
        cg_a = await register_user(client, role="caregiver")
        cg_b = await register_user(client, role="caregiver")

        notif_coll = get_notifications_collection()
        doc = create_notification_document(
            user_id=ObjectId(cg_b["user"]["id"]),
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title="Confidential Alert",
            message="Sensitive missed dose",
            caregiver_id=ObjectId(cg_b["user"]["id"]),
            patient_id=ObjectId(pt["user"]["id"]),
            alert_type="RULE_A",
            fingerprint=f"{pt['user']['id']}:m:s:2026-09-10:08:00:RULE_A_SEC",
        )
        insert_res = await notif_coll.insert_one(doc)
        alert_id = str(insert_res.inserted_id)

        # Caregiver A tries to mark B's alert read
        res = await client.patch(
            f"/api/v1/caregivers/alerts/{alert_id}/read",
            headers=auth_headers(cg_a["access_token"]),
        )
        assert res.status_code == 404
        assert res.json()["detail"] == "Alert not found."
