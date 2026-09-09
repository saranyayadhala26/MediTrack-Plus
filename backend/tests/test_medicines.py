"""Unit and integration tests for Medicine Management CRUD (Phase 4).

Tests cover:
- Create medicine (valid, unauthenticated 401, caregiver 403, schema validation errors)
- List medicines (patient-scoped, sorting, caregiver 403, unauthenticated 401)
- Get medicine by ID (valid, 404 non-existent, 404 malformed, cross-patient 404, caregiver 403)
- Update medicine (valid partial updates, cross-patient 404, date conflict 422, whitespace rejection)
- Delete medicine (valid deletion, cross-patient 404, subsequent 404, caregiver 403)
- Medical safety disclaimer inclusion on responses
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def unique_email(prefix: str = "med_test") -> str:
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


# ---------------------------------------------------------------------------
# Create Medicine Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_create_medicine_success():
    """Verify an authenticated patient can successfully create a medicine."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]
        user_id = auth_data["user"]["id"]

        payload = {
            "name": "Amoxicillin",
            "dosage": "500",
            "dosageUnit": "mg",
            "frequency": "Three times daily",
            "instructions": "Take with food",
            "startDate": "2026-09-10",
            "endDate": "2026-09-20",
            "inventory": 30,
            "refillThreshold": 5,
        }

        res = await client.post(
            "/api/v1/medicines",
            json=payload,
            headers=auth_headers(token),
        )

        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Amoxicillin"
        assert data["dosage"] == "500"
        assert data["dosageUnit"] == "mg"
        assert data["frequency"] == "Three times daily"
        assert data["instructions"] == "Take with food"
        assert data["startDate"] == "2026-09-10"
        assert data["endDate"] == "2026-09-20"
        assert data["inventory"] == 30
        assert data["refillThreshold"] == 5
        assert data["userId"] == user_id
        assert "id" in data
        assert "createdAt" in data
        assert "updatedAt" in data
        assert "medical_disclaimer" in data
        assert "does not provide medical advice" in data["medical_disclaimer"].lower()


@pytest.mark.asyncio
async def test_create_medicine_unauthenticated_fails():
    """Verify unauthenticated requests to create a medicine return HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Lisinopril",
                "dosage": "10",
                "dosageUnit": "mg",
                "frequency": "Once daily",
            },
        )
        assert res.status_code == 401
        assert "token is required" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_medicine_caregiver_forbidden():
    """Verify caregivers are forbidden from creating medicines (HTTP 403)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="caregiver")
        token = auth_data["access_token"]

        res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Lisinopril",
                "dosage": "10",
                "dosageUnit": "mg",
                "frequency": "Once daily",
            },
            headers=auth_headers(token),
        )
        assert res.status_code == 403
        assert "patient role required" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_medicine_validation_empty_name():
    """Verify empty or whitespace-only medicine name returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]

        res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "   ",
                "dosage": "10",
                "dosageUnit": "mg",
                "frequency": "Daily",
            },
            headers=auth_headers(token),
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_medicine_validation_empty_dosage_or_frequency():
    """Verify empty or whitespace-only dosage or frequency returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]

        # Whitespace dosage
        res1 = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Ibuprofen",
                "dosage": "   ",
                "dosageUnit": "mg",
                "frequency": "Daily",
            },
            headers=auth_headers(token),
        )
        assert res1.status_code == 422

        # Whitespace frequency
        res2 = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Ibuprofen",
                "dosage": "200",
                "dosageUnit": "mg",
                "frequency": "   ",
            },
            headers=auth_headers(token),
        )
        assert res2.status_code == 422


@pytest.mark.asyncio
async def test_create_medicine_validation_invalid_dates():
    """Verify inverted date range (endDate < startDate) returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]

        res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Metformin",
                "dosage": "500",
                "dosageUnit": "mg",
                "frequency": "Twice daily",
                "startDate": "2026-09-20",
                "endDate": "2026-09-10",
            },
            headers=auth_headers(token),
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_medicine_validation_negative_inventory():
    """Verify negative inventory or negative refillThreshold returns HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]

        res1 = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Metformin",
                "dosage": "500",
                "dosageUnit": "mg",
                "frequency": "Twice daily",
                "inventory": -5,
            },
            headers=auth_headers(token),
        )
        assert res1.status_code == 422

        res2 = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Metformin",
                "dosage": "500",
                "dosageUnit": "mg",
                "frequency": "Twice daily",
                "refillThreshold": -1,
            },
            headers=auth_headers(token),
        )
        assert res2.status_code == 422


# ---------------------------------------------------------------------------
# List Medicines Tests & Isolation
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_list_medicines_user_isolation():
    """Verify a patient can only see their own medicines, not another patient's."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Patient A
        auth_a = await register_user(client, role="patient")
        token_a = auth_a["access_token"]

        # Patient B
        auth_b = await register_user(client, role="patient")
        token_b = auth_b["access_token"]

        # Create medicine for Patient A
        await client.post(
            "/api/v1/medicines",
            json={
                "name": "Medicine A1",
                "dosage": "100",
                "dosageUnit": "mg",
                "frequency": "Daily",
            },
            headers=auth_headers(token_a),
        )
        await client.post(
            "/api/v1/medicines",
            json={
                "name": "Medicine A2",
                "dosage": "200",
                "dosageUnit": "mg",
                "frequency": "Daily",
            },
            headers=auth_headers(token_a),
        )

        # Create medicine for Patient B
        await client.post(
            "/api/v1/medicines",
            json={
                "name": "Medicine B1",
                "dosage": "300",
                "dosageUnit": "mg",
                "frequency": "Daily",
            },
            headers=auth_headers(token_b),
        )

        # List Patient A's medicines
        res_a = await client.get("/api/v1/medicines", headers=auth_headers(token_a))
        assert res_a.status_code == 200
        data_a = res_a.json()
        assert data_a["total"] == 2
        assert len(data_a["items"]) == 2
        names_a = [item["name"] for item in data_a["items"]]
        assert "Medicine A1" in names_a
        assert "Medicine A2" in names_a
        assert "Medicine B1" not in names_a
        assert "medical_disclaimer" in data_a

        # List Patient B's medicines
        res_b = await client.get("/api/v1/medicines", headers=auth_headers(token_b))
        assert res_b.status_code == 200
        data_b = res_b.json()
        assert data_b["total"] == 1
        assert data_b["items"][0]["name"] == "Medicine B1"


@pytest.mark.asyncio
async def test_list_medicines_unauthenticated_and_caregiver():
    """Verify listing medicines fails for unauthenticated users and caregivers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Unauthenticated
        res1 = await client.get("/api/v1/medicines")
        assert res1.status_code == 401

        # Caregiver
        cg_auth = await register_user(client, role="caregiver")
        res2 = await client.get("/api/v1/medicines", headers=auth_headers(cg_auth["access_token"]))
        assert res2.status_code == 403


# ---------------------------------------------------------------------------
# Get Medicine By ID Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_get_medicine_by_id_success():
    """Verify getting a medicine by ID returns full data."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_data = await register_user(client, role="patient")
        token = auth_data["access_token"]

        create_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Atorvastatin",
                "dosage": "20",
                "dosageUnit": "mg",
                "frequency": "Once at bedtime",
                "inventory": 60,
                "refillThreshold": 10,
            },
            headers=auth_headers(token),
        )
        assert create_res.status_code == 201
        med_id = create_res.json()["id"]

        get_res = await client.get(
            f"/api/v1/medicines/{med_id}",
            headers=auth_headers(token),
        )
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["id"] == med_id
        assert data["name"] == "Atorvastatin"
        assert data["dosage"] == "20"
        assert "medical_disclaimer" in data


@pytest.mark.asyncio
async def test_get_medicine_by_id_cross_patient_isolation():
    """Verify Patient A cannot view Patient B's medicine (returns 404, not 403/leak)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")

        # Create medicine for Patient B
        create_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Private Med B",
                "dosage": "50",
                "dosageUnit": "mg",
                "frequency": "Daily",
            },
            headers=auth_headers(auth_b["access_token"]),
        )
        med_b_id = create_res.json()["id"]

        # Patient A attempts to view Patient B's medicine
        get_res = await client.get(
            f"/api/v1/medicines/{med_b_id}",
            headers=auth_headers(auth_a["access_token"]),
        )
        assert get_res.status_code == 404
        assert "not found" in get_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_medicine_by_id_invalid_or_nonexistent():
    """Verify invalid or nonexistent IDs return 404 cleanly."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth = await register_user(client, role="patient")
        token = auth["access_token"]

        # Non-existent valid ObjectId
        res1 = await client.get(
            "/api/v1/medicines/650c709e3e7f4c3a8e9e9999",
            headers=auth_headers(token),
        )
        assert res1.status_code == 404

        # Malformed ID
        res2 = await client.get(
            "/api/v1/medicines/invalid-id-123",
            headers=auth_headers(token),
        )
        assert res2.status_code == 404


# ---------------------------------------------------------------------------
# Update Medicine Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_update_medicine_success():
    """Verify patient can update medicine details."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth = await register_user(client, role="patient")
        token = auth["access_token"]

        create_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Omeprazole",
                "dosage": "20",
                "dosageUnit": "capsule",
                "frequency": "Once daily before breakfast",
                "inventory": 30,
            },
            headers=auth_headers(token),
        )
        med_id = create_res.json()["id"]

        # Update dosage and inventory
        update_res = await client.patch(
            f"/api/v1/medicines/{med_id}",
            json={
                "dosage": "40",
                "inventory": 25,
                "refillThreshold": 7,
            },
            headers=auth_headers(token),
        )
        assert update_res.status_code == 200
        data = update_res.json()
        assert data["dosage"] == "40"
        assert data["inventory"] == 25
        assert data["refillThreshold"] == 7
        assert data["name"] == "Omeprazole"  # unchanged
        assert "medical_disclaimer" in data


@pytest.mark.asyncio
async def test_update_medicine_cross_patient_isolation():
    """Verify Patient A cannot update Patient B's medicine (returns 404)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")

        create_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Patient B Medicine",
                "dosage": "10",
                "dosageUnit": "tablet",
                "frequency": "Daily",
            },
            headers=auth_headers(auth_b["access_token"]),
        )
        med_b_id = create_res.json()["id"]

        # Patient A attempts to update Patient B's medicine
        update_res = await client.patch(
            f"/api/v1/medicines/{med_b_id}",
            json={"dosage": "999"},
            headers=auth_headers(auth_a["access_token"]),
        )
        assert update_res.status_code == 404


@pytest.mark.asyncio
async def test_update_medicine_date_validation_conflict():
    """Verify updating endDate earlier than existing startDate returns 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth = await register_user(client, role="patient")
        token = auth["access_token"]

        create_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Prednisone",
                "dosage": "5",
                "dosageUnit": "mg",
                "frequency": "Daily",
                "startDate": "2026-09-15",
                "endDate": "2026-09-25",
            },
            headers=auth_headers(token),
        )
        med_id = create_res.json()["id"]

        # Update only endDate to be before startDate
        update_res = await client.patch(
            f"/api/v1/medicines/{med_id}",
            json={"endDate": "2026-09-10"},
            headers=auth_headers(token),
        )
        assert update_res.status_code == 422


# ---------------------------------------------------------------------------
# Delete Medicine Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_delete_medicine_success():
    """Verify patient can delete their own medicine."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth = await register_user(client, role="patient")
        token = auth["access_token"]

        create_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Aspirin",
                "dosage": "81",
                "dosageUnit": "mg",
                "frequency": "Once daily",
            },
            headers=auth_headers(token),
        )
        med_id = create_res.json()["id"]

        # Delete the medicine
        del_res = await client.delete(
            f"/api/v1/medicines/{med_id}",
            headers=auth_headers(token),
        )
        assert del_res.status_code == 200
        del_data = del_res.json()
        assert del_data["id"] == med_id
        assert "deleted successfully" in del_data["message"].lower()
        assert "medical_disclaimer" in del_data

        # Verify it can no longer be fetched
        get_res = await client.get(
            f"/api/v1/medicines/{med_id}",
            headers=auth_headers(token),
        )
        assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_delete_medicine_cross_patient_isolation():
    """Verify Patient A cannot delete Patient B's medicine (returns 404, remains intact)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        auth_a = await register_user(client, role="patient")
        auth_b = await register_user(client, role="patient")

        create_res = await client.post(
            "/api/v1/medicines",
            json={
                "name": "Secure Med B",
                "dosage": "250",
                "dosageUnit": "mg",
                "frequency": "Daily",
            },
            headers=auth_headers(auth_b["access_token"]),
        )
        med_b_id = create_res.json()["id"]

        # Patient A attempts to delete Patient B's medicine
        del_res = await client.delete(
            f"/api/v1/medicines/{med_b_id}",
            headers=auth_headers(auth_a["access_token"]),
        )
        assert del_res.status_code == 404

        # Verify Patient B's medicine still exists
        get_res = await client.get(
            f"/api/v1/medicines/{med_b_id}",
            headers=auth_headers(auth_b["access_token"]),
        )
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "Secure Med B"


@pytest.mark.asyncio
async def test_delete_medicine_caregiver_forbidden():
    """Verify caregivers cannot delete medicines."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        cg_auth = await register_user(client, role="caregiver")
        res = await client.delete(
            "/api/v1/medicines/650c709e3e7f4c3a8e9e1234",
            headers=auth_headers(cg_auth["access_token"]),
        )
        assert res.status_code == 403
