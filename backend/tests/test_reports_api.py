"""Unit and integration tests for Medication Adherence Reports API (Phase 11 Step 8).

Comprehensive verification of:
1. Patient weekly report success
2. Patient monthly report success
3. Patient cannot request another patient (JWT-bound identity)
4. Caregiver weekly report success for linked patient
5. Caregiver monthly report success for linked patient
6. Caregiver cannot access unrelated patient (403)
7. Revoked caregiver denied (403)
8. Patient cannot use caregiver endpoint (403)
9. Caregiver cannot use patient endpoint (403)
10. Malformed patient ID handled safely (404)
11. Malformed date returns 422
12. Invalid/incomplete report period rejected (422)
13. Default latest completed weekly period (omitted endDate)
14. Default latest completed monthly period (omitted endDate)
15. Historical report uses correct endDate and historical streak
16. Weekly PDF response is application/pdf with valid headers and bytes
17. Monthly PDF response is application/pdf with valid headers and bytes
18. Caregiver weekly PDF authorization (linked 200, unlinked 403)
19. Caregiver monthly PDF authorization (linked 200, unlinked 403)
20. PDF contains report content and does not expose secrets
21. No arbitrary targetEmail parameter allowed
22. No arbitrary patient recipient override allowed
23. Report JSON matches ReportService calculation
24. No report calculation duplicated in router (AST inspection)
25. Unauthenticated requests return 401
26. Caregiver linked to deleted patient returns 404
"""

import ast
import base64
from datetime import date, datetime, timedelta, timezone
import inspect
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid
import zlib

from bson import ObjectId
from httpx import ASGITransport, AsyncClient
import pytest

from app.core.config import settings
from app.db.mongodb import (
    get_activities_collection,
    get_caregivers_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.main import app
import app.routers.reports as reports_module
from app.models.collections import (
    create_activity_document,
    create_caregiver_document,
    create_medicine_document,
    create_schedule_document,
    now_utc,
)
from app.schemas.caregiver import CaregiverStatus
from app.schemas.report import (
    MedicationReportResponse,
    ReportPeriod,
)
from app.services.report_service import ReportService
from app.services.scheduled_report_service import (
    get_completed_monthly_period,
    get_completed_weekly_period,
)
from app.utils.mongo import to_object_id


# ============================================================================
# Helpers
# ============================================================================

def unique_email(prefix: str = "rpt_test") -> str:
    """Generate a unique email address for test isolation."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def auth_headers(token: str) -> Dict[str, str]:
    """Helper to generate Authorization Bearer header."""
    return {"Authorization": f"Bearer {token}"}


async def register_user(
    client: AsyncClient,
    role: str = "patient",
    email: Optional[str] = None,
    full_name: Optional[str] = None,
    password: str = "SecurePassword123!",
) -> Dict[str, Any]:
    """Helper to register a user and return the auth response payload."""
    user_email = email or unique_email(role)
    name = full_name or f"Test {role.capitalize()}"
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "fullName": name,
            "email": user_email,
            "password": password,
            "confirmPassword": password,
            "role": role,
            "emergencyContact": "+1-555-9876",
        },
    )
    assert res.status_code == 201, f"Registration failed: {res.text}"
    return res.json()


async def link_caregiver(
    patient_id: ObjectId,
    caregiver_email: str,
    caregiver_name: str = "Test Caregiver",
    relationship: str = "Family",
    status: CaregiverStatus = CaregiverStatus.ACTIVE,
) -> ObjectId:
    """Helper to insert an explicit caregiver record into the database."""
    coll = get_caregivers_collection()
    doc = create_caregiver_document(
        patient_id=patient_id,
        caregiver_name=caregiver_name,
        caregiver_email=caregiver_email.strip().lower(),
        caregiver_phone="+1-555-0199",
        relationship=relationship,
        status=status.value if hasattr(status, "value") else str(status),
    )
    res = await coll.insert_one(doc)
    return res.inserted_id


def decode_pdf_text_streams(pdf_bytes: bytes) -> bytes:
    """Helper to extract decompressed text streams from a ReportLab PDF."""
    parts = pdf_bytes.split(b"stream\n")
    all_decompressed = b""
    for seg in parts[1:]:
        end_marker = seg.find(b"~>")
        if end_marker != -1:
            a85_data = seg[: end_marker + 2]
            try:
                dec = zlib.decompress(base64.a85decode(a85_data, adobe=True))
                all_decompressed += dec + b"\n"
            except Exception:
                pass
        else:
            raw_end = seg.find(b"\nendstream")
            if raw_end != -1:
                stream_raw = seg[:raw_end]
                try:
                    dec = zlib.decompress(stream_raw)
                    all_decompressed += dec + b"\n"
                except Exception:
                    all_decompressed += stream_raw + b"\n"
    return all_decompressed


# ============================================================================
# Tests: Scenarios 1 to 24
# ============================================================================

@pytest.mark.asyncio
async def test_01_patient_weekly_report_success():
    """Scenario 1: Authenticated patient requests weekly report -> 200 OK, valid schema."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        reg = await register_user(client, role="patient", full_name="Alice Patient")
        token = reg["access_token"]
        patient_id = reg["user"]["id"]

        # Insert a medicine and schedule
        med_doc = create_medicine_document(
            user_id=to_object_id(patient_id),
            name="Atorvastatin",
            dosage="20mg",
            dosage_unit="tablet",
            frequency="daily",
            instructions="Take daily with water",
        )
        med_res = await get_medicines_collection().insert_one(med_doc)
        med_id = med_res.inserted_id

        sched_doc = create_schedule_document(
            user_id=to_object_id(patient_id),
            medicine_id=med_id,
            time="08:00",
            frequency_type="daily",
            days_of_week=[],
        )
        await get_schedules_collection().insert_one(sched_doc)

        # GET /api/v1/reports/weekly without endDate (defaults to latest completed week)
        res = await client.get(
            "/api/v1/reports/weekly",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()

        # Validate response schema
        report = MedicationReportResponse(**data)
        assert report.reportType == ReportPeriod.WEEKLY
        assert report.patientId == patient_id
        assert report.patientName == "Alice Patient"
        assert report.startDate < report.endDate
        assert report.summary.totalScheduled > 0
        assert report.summary.adherencePercentage >= 0.0
        assert len(report.medicines) >= 1
        assert report.medicines[0].medicineName == "Atorvastatin"
        assert len(report.dailySummaries) == 7
        assert report.streak is not None


@pytest.mark.asyncio
async def test_02_patient_monthly_report_success():
    """Scenario 2: Authenticated patient requests monthly report -> 200 OK, valid schema."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        reg = await register_user(client, role="patient", full_name="Bob Patient")
        token = reg["access_token"]
        patient_id = reg["user"]["id"]

        # GET /api/v1/reports/monthly without endDate (defaults to latest completed month)
        res = await client.get(
            "/api/v1/reports/monthly",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()

        report = MedicationReportResponse(**data)
        assert report.reportType == ReportPeriod.MONTHLY
        assert report.patientId == patient_id
        assert report.patientName == "Bob Patient"
        # Confirm start date is day 1 and end date is last day of the month
        start_d = date.fromisoformat(report.startDate)
        end_d = date.fromisoformat(report.endDate)
        assert start_d.day == 1
        next_day = end_d + timedelta(days=1)
        assert next_day.day == 1
        assert 28 <= len(report.dailySummaries) <= 31


@pytest.mark.asyncio
async def test_03_patient_cannot_request_another_patient():
    """Scenario 3: Patient endpoint derives identity purely from JWT; query params cannot override patient."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient1 = await register_user(client, role="patient", full_name="Patient One")
        patient2 = await register_user(client, role="patient", full_name="Patient Two")

        # Patient 1 tries to supply patientId query param pointing to Patient 2
        res = await client.get(
            f"/api/v1/reports/weekly?patientId={patient2['user']['id']}",
            headers=auth_headers(patient1["access_token"]),
        )
        assert res.status_code == 200
        data = res.json()
        # MUST return Patient 1's report, NOT Patient 2
        assert data["patientId"] == patient1["user"]["id"]
        assert data["patientName"] == "Patient One"
        assert data["patientId"] != patient2["user"]["id"]


@pytest.mark.asyncio
async def test_04_caregiver_weekly_report_success_for_linked_patient():
    """Scenario 4: Caregiver with active link requests linked patient weekly report -> 200 OK."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Linked Patient")
        caregiver = await register_user(client, role="caregiver", full_name="Dr. Caregiver")

        # Create active caregiver link in DB
        await link_caregiver(
            patient_id=to_object_id(patient["user"]["id"]),
            caregiver_email=caregiver["user"]["email"],
            status=CaregiverStatus.ACTIVE,
        )

        res = await client.get(
            f"/api/v1/reports/patients/{patient['user']['id']}/weekly",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["patientId"] == patient["user"]["id"]
        assert data["patientName"] == "Linked Patient"
        assert data["reportType"] == "weekly"


@pytest.mark.asyncio
async def test_05_caregiver_monthly_report_success_for_linked_patient():
    """Scenario 5: Caregiver with active link requests linked patient monthly report -> 200 OK."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Linked Patient M")
        caregiver = await register_user(client, role="caregiver", full_name="Dr. Caregiver M")

        await link_caregiver(
            patient_id=to_object_id(patient["user"]["id"]),
            caregiver_email=caregiver["user"]["email"],
            status=CaregiverStatus.ACTIVE,
        )

        res = await client.get(
            f"/api/v1/reports/patients/{patient['user']['id']}/monthly",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["patientId"] == patient["user"]["id"]
        assert data["patientName"] == "Linked Patient M"
        assert data["reportType"] == "monthly"


@pytest.mark.asyncio
async def test_06_caregiver_cannot_access_unrelated_patient():
    """Scenario 6: Caregiver attempts to access report for an unlinked patient -> 403 Forbidden."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        unrelated_patient = await register_user(client, role="patient", full_name="Unrelated Patient")
        caregiver = await register_user(client, role="caregiver")

        # Caregiver has NO link to unrelated_patient
        res = await client.get(
            f"/api/v1/reports/patients/{unrelated_patient['user']['id']}/weekly",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res.status_code == 403
        assert "Active caregiver relationship required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_07_revoked_caregiver_denied():
    """Scenario 7: Caregiver whose link is REVOKED is denied access -> 403 Forbidden."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Patient With Revoked CG")
        caregiver = await register_user(client, role="caregiver")

        # Create REVOKED caregiver link
        await link_caregiver(
            patient_id=to_object_id(patient["user"]["id"]),
            caregiver_email=caregiver["user"]["email"],
            status=CaregiverStatus.REVOKED,
        )

        res = await client.get(
            f"/api/v1/reports/patients/{patient['user']['id']}/weekly",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res.status_code == 403
        assert "Active caregiver relationship required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_08_patient_cannot_use_caregiver_endpoint():
    """Scenario 8: Patient role token used on caregiver endpoint -> 403 Forbidden."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        other_id = str(ObjectId())

        res = await client.get(
            f"/api/v1/reports/patients/{other_id}/weekly",
            headers=auth_headers(patient["access_token"]),
        )
        assert res.status_code == 403
        assert "Caregiver role required" in res.json()["detail"]


@pytest.mark.asyncio
async def test_09_caregiver_cannot_use_patient_endpoint():
    """Scenario 9: Caregiver role token used on patient endpoint -> 403 Forbidden."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        caregiver = await register_user(client, role="caregiver")

        res = await client.get(
            "/api/v1/reports/weekly",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res.status_code == 403
        assert "Patient role required" in res.json()["detail"]

        res_monthly = await client.get(
            "/api/v1/reports/monthly",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_monthly.status_code == 403


@pytest.mark.asyncio
async def test_10_malformed_patient_id_handled_safely():
    """Scenario 10: Caregiver endpoint called with malformed patient ID -> safe 404."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        caregiver = await register_user(client, role="caregiver")

        for bad_id in ["not-an-objectid", "12345", "invalid_id_!!", "64b00000000000000000000z"]:
            res = await client.get(
                f"/api/v1/reports/patients/{bad_id}/weekly",
                headers=auth_headers(caregiver["access_token"]),
            )
            assert res.status_code == 404
            assert res.json()["detail"] == "Patient records not found."


@pytest.mark.asyncio
async def test_11_malformed_date_returns_422():
    """Scenario 11: Supplying malformed date returns HTTP 422 Unprocessable Entity."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        token = patient["access_token"]

        for bad_date in ["not-a-date", "2026-13-45", "2026/08/10", "2026-02-31"]:
            res = await client.get(
                f"/api/v1/reports/weekly?endDate={bad_date}",
                headers=auth_headers(token),
            )
            assert res.status_code == 422
            assert "endDate must be a valid calendar date" in res.json()["detail"]


@pytest.mark.asyncio
async def test_12_invalid_incomplete_report_period_rejected():
    """Scenario 12: Invalid or incomplete report periods are rejected with HTTP 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        token = patient["access_token"]
        today = now_utc().date()

        # 1. Weekly report ending on non-Sunday (e.g. Wednesday 2026-08-12)
        res_non_sunday = await client.get(
            "/api/v1/reports/weekly?endDate=2026-08-12",
            headers=auth_headers(token),
        )
        assert res_non_sunday.status_code == 422
        assert "Weekly report must end on a Sunday" in res_non_sunday.json()["detail"]

        # 2. Monthly report ending on non-month-end (e.g. 2026-08-15)
        res_non_monthend = await client.get(
            "/api/v1/reports/monthly?endDate=2026-08-15",
            headers=auth_headers(token),
        )
        assert res_non_monthend.status_code == 422
        assert "Monthly report must end on the last day of a calendar month" in res_non_monthend.json()["detail"]

        # 3. Future date or today rejected (incomplete / future period)
        future_date = (today + timedelta(days=7)).isoformat()
        res_future = await client.get(
            f"/api/v1/reports/weekly?endDate={future_date}",
            headers=auth_headers(token),
        )
        assert res_future.status_code == 422
        assert "Incomplete or future report period cannot be generated" in res_future.json()["detail"]

        today_str = today.isoformat()
        res_today = await client.get(
            f"/api/v1/reports/weekly?endDate={today_str}",
            headers=auth_headers(token),
        )
        assert res_today.status_code == 422
        assert "Incomplete or future report period cannot be generated" in res_today.json()["detail"]


@pytest.mark.asyncio
async def test_13_default_latest_completed_weekly_period():
    """Scenario 13: Omission of endDate defaults to latest completed Monday-Sunday period."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        res = await client.get(
            "/api/v1/reports/weekly",
            headers=auth_headers(patient["access_token"]),
        )
        assert res.status_code == 200
        data = res.json()

        today = now_utc().date()
        expected_start, expected_end = get_completed_weekly_period(today)

        assert data["startDate"] == expected_start.isoformat()
        assert data["endDate"] == expected_end.isoformat()
        assert date.fromisoformat(data["endDate"]).weekday() == 6  # Sunday
        assert (date.fromisoformat(data["endDate"]) - date.fromisoformat(data["startDate"])).days == 6


@pytest.mark.asyncio
async def test_14_default_latest_completed_monthly_period():
    """Scenario 14: Omission of endDate defaults to latest completed calendar month."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient")
        res = await client.get(
            "/api/v1/reports/monthly",
            headers=auth_headers(patient["access_token"]),
        )
        assert res.status_code == 200
        data = res.json()

        today = now_utc().date()
        expected_start, expected_end = get_completed_monthly_period(today)

        assert data["startDate"] == expected_start.isoformat()
        assert data["endDate"] == expected_end.isoformat()
        assert date.fromisoformat(data["startDate"]).day == 1
        assert (date.fromisoformat(data["endDate"]) + timedelta(days=1)).day == 1


@pytest.mark.asyncio
async def test_15_historical_report_uses_correct_end_date_and_streak():
    """Scenario 15: Historical report uses specified endDate and calculates historical streak as of that endDate."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        reg = await register_user(client, role="patient", full_name="Historical Patient")
        token = reg["access_token"]
        patient_id = to_object_id(reg["user"]["id"])

        # Insert a medicine and daily schedule
        med_doc = create_medicine_document(
            user_id=patient_id,
            name="Metformin",
            dosage="500mg",
            dosage_unit="tablet",
            frequency="daily",
        )
        med_res = await get_medicines_collection().insert_one(med_doc)
        med_id = med_res.inserted_id

        sched_doc = create_schedule_document(
            user_id=patient_id,
            medicine_id=med_id,
            time="09:00",
            frequency_type="daily",
            days_of_week=[],
        )
        sched_res = await get_schedules_collection().insert_one(sched_doc)
        sched_id = sched_res.inserted_id

        # Choose a historical Sunday 3 weeks ago
        today = now_utc().date()
        latest_sun = today - timedelta(days=today.weekday() + 1)
        hist_sun = latest_sun - timedelta(days=14)
        hist_mon = hist_sun - timedelta(days=6)

        # Create taken activities for 3 consecutive days leading up to hist_sun:
        # hist_sun - 2 days, hist_sun - 1 day, hist_sun
        for offset in [2, 1, 0]:
            d = hist_sun - timedelta(days=offset)
            act_doc = create_activity_document(
                user_id=patient_id,
                medicine_id=med_id,
                schedule_id=sched_id,
                scheduled_date=d.isoformat(),
                scheduled_time="09:00",
                action="Taken",
                action_time=datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc),
            )
            await get_activities_collection().insert_one(act_doc)

        res = await client.get(
            f"/api/v1/reports/weekly?endDate={hist_sun.isoformat()}",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()

        assert data["startDate"] == hist_mon.isoformat()
        assert data["endDate"] == hist_sun.isoformat()
        # Verify streak evaluates as of hist_sun (at least 3 days streak as of that date)
        assert data["streak"]["currentStreak"] >= 3


@pytest.mark.asyncio
async def test_16_weekly_pdf_response_is_application_pdf():
    """Scenario 16: Weekly PDF response has application/pdf content type, correct header, and PDF bytes."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="PDF Patient")
        token = patient["access_token"]

        res = await client.get(
            "/api/v1/reports/weekly/pdf",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"
        assert "Content-Disposition" in res.headers
        assert "inline;" in res.headers["Content-Disposition"]
        assert "MediTrack_Weekly_Report_" in res.headers["Content-Disposition"]
        assert res.headers["Content-Disposition"].endswith('.pdf"')

        # Binary check
        content = res.content
        assert content.startswith(b"%PDF")
        assert len(content) > 500


@pytest.mark.asyncio
async def test_17_monthly_pdf_response_is_application_pdf():
    """Scenario 17: Monthly PDF response has application/pdf content type, correct header, and PDF bytes."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="PDF Patient M")
        token = patient["access_token"]

        res = await client.get(
            "/api/v1/reports/monthly/pdf",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"
        assert "Content-Disposition" in res.headers
        assert "inline;" in res.headers["Content-Disposition"]
        assert "MediTrack_Monthly_Report_" in res.headers["Content-Disposition"]
        assert res.headers["Content-Disposition"].endswith('.pdf"')

        content = res.content
        assert content.startswith(b"%PDF")
        assert len(content) > 500


@pytest.mark.asyncio
async def test_18_caregiver_weekly_pdf_authorization():
    """Scenario 18: Caregiver linked patient weekly PDF succeeds (200); unlinked returns 403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Patient CG PDF")
        other_patient = await register_user(client, role="patient", full_name="Other Patient CG PDF")
        caregiver = await register_user(client, role="caregiver")

        # Link caregiver to patient ONLY
        await link_caregiver(
            patient_id=to_object_id(patient["user"]["id"]),
            caregiver_email=caregiver["user"]["email"],
            status=CaregiverStatus.ACTIVE,
        )

        # 1. Linked patient weekly PDF -> 200 OK
        res_ok = await client.get(
            f"/api/v1/reports/patients/{patient['user']['id']}/weekly/pdf",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_ok.status_code == 200
        assert res_ok.headers["content-type"] == "application/pdf"
        assert res_ok.content.startswith(b"%PDF")

        # 2. Unlinked patient weekly PDF -> 403 Forbidden
        res_denied = await client.get(
            f"/api/v1/reports/patients/{other_patient['user']['id']}/weekly/pdf",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_denied.status_code == 403


@pytest.mark.asyncio
async def test_19_caregiver_monthly_pdf_authorization():
    """Scenario 19: Caregiver linked patient monthly PDF succeeds (200); unlinked returns 403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Patient CG Month PDF")
        other_patient = await register_user(client, role="patient", full_name="Other Patient CG Month PDF")
        caregiver = await register_user(client, role="caregiver")

        await link_caregiver(
            patient_id=to_object_id(patient["user"]["id"]),
            caregiver_email=caregiver["user"]["email"],
            status=CaregiverStatus.ACTIVE,
        )

        # 1. Linked patient monthly PDF -> 200 OK
        res_ok = await client.get(
            f"/api/v1/reports/patients/{patient['user']['id']}/monthly/pdf",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_ok.status_code == 200
        assert res_ok.headers["content-type"] == "application/pdf"
        assert res_ok.content.startswith(b"%PDF")

        # 2. Unlinked patient monthly PDF -> 403 Forbidden
        res_denied = await client.get(
            f"/api/v1/reports/patients/{other_patient['user']['id']}/monthly/pdf",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res_denied.status_code == 403


@pytest.mark.asyncio
async def test_20_pdf_contains_report_content_and_no_secrets():
    """Scenario 20: PDF content contains clinical report details and does NOT contain secrets."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Eleanor Vance")
        token = patient["access_token"]
        patient_id = to_object_id(patient["user"]["id"])

        # Insert a medicine
        med_doc = create_medicine_document(
            user_id=patient_id,
            name="Levothyroxine",
            dosage="50mcg",
            dosage_unit="tablet",
            frequency="daily",
            instructions="Morning empty stomach",
        )
        med_res = await get_medicines_collection().insert_one(med_doc)
        sched_doc = create_schedule_document(
            user_id=patient_id,
            medicine_id=med_res.inserted_id,
            time="07:00",
            frequency_type="daily",
            days_of_week=[],
        )
        await get_schedules_collection().insert_one(sched_doc)

        res = await client.get(
            "/api/v1/reports/weekly/pdf",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        pdf_bytes = res.content

        # Decompress text streams
        decompressed_text = decode_pdf_text_streams(pdf_bytes)

        # Verify clinical content is present
        assert b"Eleanor Vance" in decompressed_text
        assert b"Levothyroxine" in decompressed_text
        assert b"MediTrack" in decompressed_text

        # Verify NO secrets are leaked
        assert b"Bearer " not in decompressed_text
        assert b"password" not in decompressed_text.lower()
        assert b"secret" not in decompressed_text.lower()
        if hasattr(settings, "JWT_SECRET_KEY") and settings.JWT_SECRET_KEY:
            assert settings.JWT_SECRET_KEY.encode() not in pdf_bytes
        if hasattr(settings, "CRON_SECRET_KEY") and settings.CRON_SECRET_KEY:
            assert settings.CRON_SECRET_KEY.encode() not in pdf_bytes
        if hasattr(settings, "MONGODB_URI") and settings.MONGODB_URI:
            assert b"mongodb" not in decompressed_text.lower()


@pytest.mark.asyncio
async def test_21_no_arbitrary_target_email():
    """Scenario 21: Endpoint does not accept arbitrary targetEmail parameters and dispatches no emails."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Security Patient")
        token = patient["access_token"]

        # Attempt to inject targetEmail in query
        res = await client.get(
            "/api/v1/reports/weekly?targetEmail=attacker@malicious.com",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        data = res.json()
        # Report is returned in the HTTP response; no email sent or leaked
        assert data["patientId"] == patient["user"]["id"]
        assert "targetEmail" not in data


@pytest.mark.asyncio
async def test_22_no_arbitrary_patient_recipient_override():
    """Scenario 22: Caregiver endpoint does not accept arbitrary recipient override parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Target Patient")
        caregiver = await register_user(client, role="caregiver", full_name="Linked Caregiver")

        await link_caregiver(
            patient_id=to_object_id(patient["user"]["id"]),
            caregiver_email=caregiver["user"]["email"],
            status=CaregiverStatus.ACTIVE,
        )

        res = await client.get(
            f"/api/v1/reports/patients/{patient['user']['id']}/weekly?recipientEmail=attacker@evil.com&override=true",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["patientId"] == patient["user"]["id"]
        assert "recipientEmail" not in data
        assert "override" not in data


@pytest.mark.asyncio
async def test_23_report_json_matches_report_service_calculation():
    """Scenario 23: Report JSON returned by API exactly matches direct ReportService calculation."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="Calculation Test Patient")
        token = patient["access_token"]
        patient_oid = to_object_id(patient["user"]["id"])

        # Insert a medicine
        med_doc = create_medicine_document(
            user_id=patient_oid,
            name="Lisinopril",
            dosage="10mg",
            dosage_unit="tablet",
            frequency="daily",
        )
        med_res = await get_medicines_collection().insert_one(med_doc)
        sched_doc = create_schedule_document(
            user_id=patient_oid,
            medicine_id=med_res.inserted_id,
            time="08:00",
            frequency_type="daily",
            days_of_week=[],
        )
        await get_schedules_collection().insert_one(sched_doc)

        # 1. Direct service calculation
        service = ReportService()
        today = now_utc().date()
        start_d, end_d = get_completed_weekly_period(today)
        direct_report = await service.calculate_report(
            patient_id=patient_oid,
            period=ReportPeriod.WEEKLY,
            start_date=start_d,
            end_date=end_d,
        )

        # 2. API call
        res = await client.get(
            "/api/v1/reports/weekly",
            headers=auth_headers(token),
        )
        assert res.status_code == 200
        api_report = MedicationReportResponse(**res.json())

        # Assert identical results
        assert api_report.reportType == direct_report.reportType
        assert api_report.startDate == direct_report.startDate
        assert api_report.endDate == direct_report.endDate
        assert api_report.patientId == direct_report.patientId
        assert api_report.patientName == direct_report.patientName
        assert api_report.summary.adherencePercentage == direct_report.summary.adherencePercentage
        assert api_report.summary.totalScheduled == direct_report.summary.totalScheduled
        assert api_report.summary.takenCount == direct_report.summary.takenCount
        assert api_report.summary.missedCount == direct_report.summary.missedCount
        assert api_report.summary.skippedCount == direct_report.summary.skippedCount
        assert len(api_report.medicines) == len(direct_report.medicines)
        assert len(api_report.dailySummaries) == len(direct_report.dailySummaries)
        assert api_report.streak.currentStreak == direct_report.streak.currentStreak


def test_24_no_report_calculation_duplicated_in_router():
    """Scenario 24: Verify architectural cleanliness - no adherence calculation or loops in router."""
    router_source_path = Path(inspect.getfile(reports_module))
    tree = ast.parse(router_source_path.read_text(encoding="utf-8"))

    # Inspect all function definitions in the router file
    router_func_names = [
        node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]

    assert "get_patient_weekly_report" in router_func_names
    assert "get_patient_monthly_report" in router_func_names
    assert "get_patient_weekly_pdf" in router_func_names
    assert "get_patient_monthly_pdf" in router_func_names
    assert "get_caregiver_patient_weekly_report" in router_func_names
    assert "get_caregiver_patient_monthly_report" in router_func_names
    assert "get_caregiver_patient_weekly_pdf" in router_func_names
    assert "get_caregiver_patient_monthly_pdf" in router_func_names

    # Ensure no calculation methods from ReportService were copied into router
    assert "calculate_report" not in router_func_names
    assert "classify_occurrence" not in router_func_names
    assert "is_schedule_occurrence" not in router_func_names
    assert "build_streak_response" not in router_func_names

    # Check source text does not contain adherence percentage calculation formula
    source_text = router_source_path.read_text(encoding="utf-8")
    assert "takenCount /" not in source_text
    assert "totalScheduled" not in source_text
    assert "OccurrenceClassification" not in source_text


# ============================================================================
# Additional Authorization & Error Handling Scenarios
# ============================================================================

@pytest.mark.asyncio
async def test_25_unauthenticated_requests_return_401():
    """Verify unauthenticated requests return 401 Unauthorized across all reports endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        dummy_id = str(ObjectId())
        endpoints = [
            "/api/v1/reports/weekly",
            "/api/v1/reports/monthly",
            "/api/v1/reports/weekly/pdf",
            "/api/v1/reports/monthly/pdf",
            f"/api/v1/reports/patients/{dummy_id}/weekly",
            f"/api/v1/reports/patients/{dummy_id}/monthly",
            f"/api/v1/reports/patients/{dummy_id}/weekly/pdf",
            f"/api/v1/reports/patients/{dummy_id}/monthly/pdf",
        ]
        for ep in endpoints:
            res = await client.get(ep)
            assert res.status_code == 401, f"Expected 401 on {ep}, got {res.status_code}"


@pytest.mark.asyncio
async def test_26_caregiver_linked_to_deleted_patient_returns_404():
    """Verify that if a caregiver is linked to a patient whose account was deleted, 404 is returned."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        patient = await register_user(client, role="patient", full_name="To Delete Patient")
        caregiver = await register_user(client, role="caregiver")
        patient_oid = to_object_id(patient["user"]["id"])

        await link_caregiver(
            patient_id=patient_oid,
            caregiver_email=caregiver["user"]["email"],
            status=CaregiverStatus.ACTIVE,
        )

        # Delete the patient user document
        await get_users_collection().delete_one({"_id": patient_oid})

        res = await client.get(
            f"/api/v1/reports/patients/{patient['user']['id']}/weekly",
            headers=auth_headers(caregiver["access_token"]),
        )
        assert res.status_code == 404
        assert res.json()["detail"] == "Patient records not found."
