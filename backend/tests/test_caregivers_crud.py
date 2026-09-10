"""Unit and integration tests for Caregiver Management CRUD (Phase 9.1).

Tests cover:
1. Patient creates caregiver link successfully
2. Email is normalized (trim, lowercase)
3. Nonexistent caregiver email -> 404
4. Existing patient-role account -> 400
5. Self-link -> 400
6. Duplicate active relationship -> 409
7. Revoked relationship is reactivated in-place
8. Reactivation does not create a second document
9. Patient GET returns only own caregiver relationships
10. Patient DELETE changes status to revoked (soft revocation)
11. Cross-patient GET isolation
12. Cross-patient DELETE isolation (safe 404)
13. Caregiver cannot perform patient caregiver management (403)
14. Authentication required (401)
15. No sensitive authentication fields returned
16. Status filter on GET (/api/v1/caregivers?status=active|revoked)
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def unique_email(prefix: str = "cg_test") -> str:
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


# ---------------------------------------------------------------------------
# POST /api/v1/caregivers Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patient_create_caregiver_success():
    """Verify that a patient can successfully link a registered caregiver account."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")
        caregiver_auth = await register_user(client, role="caregiver")

        payload = {
            "caregiverName": "Dr. Sarah Smith",
            "caregiverEmail": caregiver_auth["user"]["email"],
            "caregiverPhone": "+1-555-0199",
            "relationship": "Daughter",
        }
        res = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res.status_code == 201
        data = res.json()
        assert data["caregiverName"] == "Dr. Sarah Smith"
        assert data["caregiverEmail"] == caregiver_auth["user"]["email"]
        assert data["caregiverPhone"] == "+1-555-0199"
        assert data["relationship"] == "Daughter"
        assert data["status"] == "active"
        assert data["patientId"] == patient_auth["user"]["id"]
        assert "id" in data
        assert len(data["id"]) == 24
        assert "permissionsNote" in data


@pytest.mark.asyncio
async def test_caregiver_email_is_normalized():
    """Verify email with leading/trailing spaces and uppercase is normalized to lowercase."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")
        cg_email = unique_email("norm_cg").lower()
        await register_user(client, role="caregiver", email=cg_email)

        payload = {
            "caregiverName": "Dr. John Case",
            "caregiverEmail": f"  {cg_email.upper()}  ",
            "caregiverPhone": "+1-555-0188",
            "relationship": "Physician",
        }
        res = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res.status_code == 201
        data = res.json()
        assert data["caregiverEmail"] == cg_email


@pytest.mark.asyncio
async def test_create_caregiver_nonexistent_email_returns_404():
    """Verify that linking a nonexistent email returns HTTP 404."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")

        payload = {
            "caregiverName": "Ghost Caregiver",
            "caregiverEmail": "nonexistent_caregiver_xyz@example.com",
            "caregiverPhone": "+1-555-0000",
            "relationship": "Friend",
        }
        res = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res.status_code == 404
        assert "register an account first" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_caregiver_patient_role_account_returns_400():
    """Verify that attempting to link another user registered as patient returns HTTP 400."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_a = await register_user(client, role="patient")
        patient_b = await register_user(client, role="patient")

        payload = {
            "caregiverName": "Patient B",
            "caregiverEmail": patient_b["user"]["email"],
            "caregiverPhone": "+1-555-0002",
            "relationship": "Friend",
        }
        res = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_a["access_token"]),
        )
        assert res.status_code == 400
        assert "registered as a patient, not a caregiver" in res.json()["detail"]


@pytest.mark.asyncio
async def test_create_caregiver_self_link_returns_400():
    """Verify that a patient cannot link their own email address as caregiver."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")

        payload = {
            "caregiverName": "Self",
            "caregiverEmail": patient_auth["user"]["email"],
            "caregiverPhone": "+1-555-0003",
            "relationship": "Self",
        }
        res = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res.status_code == 400
        assert "cannot link themselves" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_caregiver_duplicate_active_returns_409():
    """Verify that attempting to link the same caregiver twice while active returns HTTP 409."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")
        caregiver_auth = await register_user(client, role="caregiver")

        payload = {
            "caregiverName": "Dr. Sarah Smith",
            "caregiverEmail": caregiver_auth["user"]["email"],
            "caregiverPhone": "+1-555-0199",
            "relationship": "Daughter",
        }
        res1 = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res1.status_code == 201

        res2 = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res2.status_code == 409
        assert "already exists" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_revoked_relationship_is_reactivated():
    """Verify that re-linking a previously revoked caregiver reactivates the same document."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")
        caregiver_auth = await register_user(client, role="caregiver")

        payload = {
            "caregiverName": "Dr. Sarah Smith",
            "caregiverEmail": caregiver_auth["user"]["email"],
            "caregiverPhone": "+1-555-0199",
            "relationship": "Daughter",
        }
        res_create = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res_create.status_code == 201
        created_id = res_create.json()["id"]

        # Revoke the caregiver link
        res_delete = await client.delete(
            f"/api/v1/caregivers/{created_id}",
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res_delete.status_code == 204

        # Re-link with updated phone and relationship
        reactivate_payload = {
            "caregiverName": "Sarah Jenkins, MD",
            "caregiverEmail": caregiver_auth["user"]["email"],
            "caregiverPhone": "+1-555-9999",
            "relationship": "Primary Caregiver",
        }
        res_reactivate = await client.post(
            "/api/v1/caregivers",
            json=reactivate_payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res_reactivate.status_code == 200
        reactivated_data = res_reactivate.json()
        assert reactivated_data["id"] == created_id  # SAME document ID preserved
        assert reactivated_data["status"] == "active"
        assert reactivated_data["caregiverName"] == "Sarah Jenkins, MD"
        assert reactivated_data["caregiverPhone"] == "+1-555-9999"
        assert reactivated_data["relationship"] == "Primary Caregiver"


@pytest.mark.asyncio
async def test_reactivation_does_not_create_second_document():
    """Verify that reactivation preserves single document cardinality for (patientId, caregiverEmail)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_auth = await register_user(client, role="patient")
        caregiver_auth = await register_user(client, role="caregiver")

        payload = {
            "caregiverName": "Nurse Nancy",
            "caregiverEmail": caregiver_auth["user"]["email"],
            "caregiverPhone": "+1-555-1234",
            "relationship": "Home Nurse",
        }
        res1 = await client.post(
            "/api/v1/caregivers",
            json=payload,
            headers=auth_headers(patient_auth["access_token"]),
        )
        assert res1.status_code == 201
        cid = res1.json()["id"]

        # Revoke
        await client.delete(f"/api/v1/caregivers/{cid}", headers=auth_headers(patient_auth["access_token"]))

        # Reactivate
        await client.post("/api/v1/caregivers", json=payload, headers=auth_headers(patient_auth["access_token"]))

        # Verify list returns exactly 1 item
        res_list = await client.get("/api/v1/caregivers", headers=auth_headers(patient_auth["access_token"]))
        assert res_list.status_code == 200
        items = res_list.json()
        assert len(items) == 1
        assert items[0]["id"] == cid
        assert items[0]["status"] == "active"


# ---------------------------------------------------------------------------
# GET /api/v1/caregivers Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patient_get_returns_only_own_caregiver_relationships():
    """Verify patient GET returns only their own linked caregivers."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_a = await register_user(client, role="patient")
        patient_b = await register_user(client, role="patient")
        cg1 = await register_user(client, role="caregiver")
        cg2 = await register_user(client, role="caregiver")

        # Patient A links CG1
        await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "CG1", "caregiverEmail": cg1["user"]["email"], "caregiverPhone": "+1-555-1111", "relationship": "Daughter"},
            headers=auth_headers(patient_a["access_token"]),
        )
        # Patient B links CG2
        await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "CG2", "caregiverEmail": cg2["user"]["email"], "caregiverPhone": "+1-555-2222", "relationship": "Son"},
            headers=auth_headers(patient_b["access_token"]),
        )

        res_a = await client.get("/api/v1/caregivers", headers=auth_headers(patient_a["access_token"]))
        assert res_a.status_code == 200
        items_a = res_a.json()
        assert len(items_a) == 1
        assert items_a[0]["caregiverEmail"] == cg1["user"]["email"]

        res_b = await client.get("/api/v1/caregivers", headers=auth_headers(patient_b["access_token"]))
        assert res_b.status_code == 200
        items_b = res_b.json()
        assert len(items_b) == 1
        assert items_b[0]["caregiverEmail"] == cg2["user"]["email"]


@pytest.mark.asyncio
async def test_list_caregivers_status_filter():
    """Verify status query parameter filters by active or revoked status."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        cg_active = await register_user(client, role="caregiver")
        cg_revoked = await register_user(client, role="caregiver")

        # Link both
        res1 = await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "Active CG", "caregiverEmail": cg_active["user"]["email"], "caregiverPhone": "+1-555-3333", "relationship": "Sister"},
            headers=auth_headers(patient["access_token"]),
        )
        res2 = await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "Revoked CG", "caregiverEmail": cg_revoked["user"]["email"], "caregiverPhone": "+1-555-4444", "relationship": "Brother"},
            headers=auth_headers(patient["access_token"]),
        )
        revoked_id = res2.json()["id"]

        # Revoke second
        await client.delete(f"/api/v1/caregivers/{revoked_id}", headers=auth_headers(patient["access_token"]))

        # Filter active
        res_act = await client.get("/api/v1/caregivers?status=active", headers=auth_headers(patient["access_token"]))
        assert res_act.status_code == 200
        active_items = res_act.json()
        assert len(active_items) == 1
        assert active_items[0]["caregiverEmail"] == cg_active["user"]["email"]

        # Filter revoked
        res_rev = await client.get("/api/v1/caregivers?status=revoked", headers=auth_headers(patient["access_token"]))
        assert res_rev.status_code == 200
        revoked_items = res_rev.json()
        assert len(revoked_items) == 1
        assert revoked_items[0]["caregiverEmail"] == cg_revoked["user"]["email"]


# ---------------------------------------------------------------------------
# DELETE /api/v1/caregivers/{caregiver_id} Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_patient_delete_changes_status_to_revoked():
    """Verify that deleting a caregiver performs a soft revocation (status='revoked')."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        res_create = await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "CG", "caregiverEmail": cg["user"]["email"], "caregiverPhone": "+1-555-5555", "relationship": "Spouse"},
            headers=auth_headers(patient["access_token"]),
        )
        cid = res_create.json()["id"]

        res_del = await client.delete(f"/api/v1/caregivers/{cid}", headers=auth_headers(patient["access_token"]))
        assert res_del.status_code == 204

        # Verify status is revoked
        res_list = await client.get("/api/v1/caregivers", headers=auth_headers(patient["access_token"]))
        assert res_list.status_code == 200
        items = res_list.json()
        assert len(items) == 1
        assert items[0]["status"] == "revoked"


@pytest.mark.asyncio
async def test_cross_patient_delete_isolation_returns_safe_404():
    """Verify that attempting to delete another patient's caregiver returns safe HTTP 404."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient_a = await register_user(client, role="patient")
        patient_b = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        res_create = await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "CG", "caregiverEmail": cg["user"]["email"], "caregiverPhone": "+1-555-6666", "relationship": "Son"},
            headers=auth_headers(patient_a["access_token"]),
        )
        cid_a = res_create.json()["id"]

        # Patient B tries to delete Patient A's link
        res_del = await client.delete(f"/api/v1/caregivers/{cid_a}", headers=auth_headers(patient_b["access_token"]))
        assert res_del.status_code == 404
        assert "not found" in res_del.json()["detail"].lower()

        # Verify Patient A's caregiver is still active
        res_a = await client.get("/api/v1/caregivers", headers=auth_headers(patient_a["access_token"]))
        assert res_a.json()[0]["status"] == "active"


# ---------------------------------------------------------------------------
# Authorization & Security Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_caregiver_cannot_perform_patient_caregiver_management():
    """Verify that a user with role=caregiver is rejected with HTTP 403 on patient caregiver endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        caregiver = await register_user(client, role="caregiver")

        # POST rejected
        res_post = await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "X", "caregiverEmail": "x@example.com", "caregiverPhone": "123", "relationship": "R"},
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_post.status_code == 403
        assert "Patient role required" in res_post.json()["detail"]

        # GET rejected
        res_get = await client.get(
            "/api/v1/caregivers",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_get.status_code == 403

        # DELETE rejected
        fake_id = "650c709e3e7f4c3a8e9e1234"
        res_del = await client.delete(
            f"/api/v1/caregivers/{fake_id}",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_del.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_requests_return_401():
    """Verify unauthenticated requests return HTTP 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/api/v1/caregivers", json={})
        assert res1.status_code == 401

        res2 = await client.get("/api/v1/caregivers")
        assert res2.status_code == 401

        res3 = await client.delete("/api/v1/caregivers/650c709e3e7f4c3a8e9e1234")
        assert res3.status_code == 401


@pytest.mark.asyncio
async def test_no_sensitive_authentication_fields_returned():
    """Verify responses do not leak password hashes, tokens, or sensitive auth data."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        res = await client.post(
            "/api/v1/caregivers",
            json={"caregiverName": "Dr. Safe", "caregiverEmail": cg["user"]["email"], "caregiverPhone": "+1-555-7777", "relationship": "Doctor"},
            headers=auth_headers(patient["access_token"]),
        )
        assert res.status_code == 201
        data = res.json()

        forbidden_fields = ["hashedPassword", "password", "token", "access_token", "accessToken", "refreshToken"]
        for field in forbidden_fields:
            assert field not in data, f"Found sensitive field '{field}' in response"


@pytest.mark.asyncio
async def test_create_caregiver_unknown_or_missing_role_returns_400():
    """Verify that attempting to link a user with unknown, missing, or non-caregiver role returns HTTP 400."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        other_user = await register_user(client, role="patient")

        from app.db.mongodb import get_users_collection
        from app.utils.mongo import to_object_id
        users_coll = get_users_collection()
        await users_coll.update_one(
            {"_id": to_object_id(other_user["user"]["id"])},
            {"$set": {"role": "unknown_role"}}
        )

        res = await client.post(
            "/api/v1/caregivers",
            json={
                "caregiverName": "Unknown Role User",
                "caregiverEmail": other_user["user"]["email"],
                "caregiverPhone": "+1-555-8888",
                "relationship": "Friend",
            },
            headers=auth_headers(patient["access_token"]),
        )
        assert res.status_code == 400
        assert "Only caregiver accounts can be linked" in res.json()["detail"]


@pytest.mark.asyncio
async def test_create_caregiver_race_condition_duplicate_key_error_returns_409():
    """Verify that a concurrent DuplicateKeyError from MongoDB is safely translated to HTTP 409 Conflict."""
    from unittest.mock import AsyncMock, patch
    import pymongo.errors

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        cg = await register_user(client, role="caregiver")

        mock_coll = AsyncMock()
        mock_coll.find_one.return_value = None
        mock_coll.insert_one.side_effect = pymongo.errors.DuplicateKeyError("E11000 duplicate key error")

        with patch("app.routers.caregivers.get_caregivers_collection", return_value=mock_coll):
            res = await client.post(
                "/api/v1/caregivers",
                json={
                    "caregiverName": "Race Condition CG",
                    "caregiverEmail": cg["user"]["email"],
                    "caregiverPhone": "+1-555-9999",
                    "relationship": "Sister",
                },
                headers=auth_headers(patient["access_token"]),
            )
            assert res.status_code == 409
            assert "already exists" in res.json()["detail"].lower()


