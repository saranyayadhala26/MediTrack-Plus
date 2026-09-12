"""Medication Adherence Reports Router for MediTrack+ (Phase 11 Step 8).

Exposes REST API endpoints for weekly and monthly adherence reports in JSON and PDF formats:
- GET /api/v1/reports/weekly: Authenticated patient weekly JSON report
- GET /api/v1/reports/monthly: Authenticated patient monthly JSON report
- GET /api/v1/reports/weekly/pdf: Authenticated patient weekly PDF report
- GET /api/v1/reports/monthly/pdf: Authenticated patient monthly PDF report
- GET /api/v1/reports/patients/{patient_id}/weekly: Caregiver linked-patient weekly JSON report
- GET /api/v1/reports/patients/{patient_id}/monthly: Caregiver linked-patient monthly JSON report
- GET /api/v1/reports/patients/{patient_id}/weekly/pdf: Caregiver linked-patient weekly PDF report
- GET /api/v1/reports/patients/{patient_id}/monthly/pdf: Caregiver linked-patient monthly PDF report

Security & Architecture:
- Strict role-based authorization (patient vs caregiver).
- Active caregiver relationship strictly verified via MongoDB Caregivers collection.
- Revoked links and cross-patient requests rejected with HTTP 403.
- Malformed patient IDs rejected safely with HTTP 404.
- Zero report calculation logic in the router (pure delegation to ReportService & PdfService).
- PDFs generated entirely in memory (never persisted in DB or filesystem).
"""

from datetime import date, timedelta
import logging
from typing import Any, Dict, Optional, Tuple

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.dependencies import get_current_caregiver, get_current_patient
from app.db.mongodb import get_caregivers_collection
from app.models.collections import now_utc
from app.schemas.caregiver import CaregiverStatus
from app.schemas.report import MedicationReportResponse, ReportPeriod
from app.services.pdf_service import pdf_service
from app.services.report_service import (
    PatientNotFoundError,
    ReportService,
    ReportValidationError,
)
from app.services.scheduled_report_service import (
    get_completed_monthly_period,
    get_completed_weekly_period,
)
from app.utils.mongo import is_valid_object_id, to_object_id

logger = logging.getLogger("meditrack.routers.reports")

router = APIRouter(tags=["Adherence Reports"])


# ============================================================================
# Helpers
# ============================================================================

def resolve_report_period_dates(
    period: ReportPeriod,
    end_date_str: Optional[str] = None,
    reference_today: Optional[date] = None,
) -> Tuple[date, date]:
    """Resolve and validate the start and end dates for a report request.

    Rules:
    - If endDate is omitted: defaults to the latest completed period (prior week or month).
    - If endDate is supplied:
      - Must be valid YYYY-MM-DD.
      - Must be strictly prior to reference_today (current incomplete period rejected).
      - Weekly report must end on a Sunday (Monday through Sunday period).
      - Monthly report must end on the last calendar day of the month.
    """
    ref = reference_today or now_utc().date()

    if end_date_str is None:
        if period == ReportPeriod.WEEKLY:
            return get_completed_weekly_period(ref)
        else:
            return get_completed_monthly_period(ref)

    try:
        end_d = date.fromisoformat(end_date_str.strip())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="endDate must be a valid calendar date in YYYY-MM-DD format.",
        )

    # Incomplete / future period check
    if end_d >= ref:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Incomplete or future report period cannot be generated. endDate ({end_d}) must be prior to today ({ref}).",
        )

    if period == ReportPeriod.WEEKLY:
        if end_d.weekday() != 6:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Weekly report must end on a Sunday (Monday through Sunday). Provided date {end_d} is a {end_d.strftime('%A')}.",
            )
        start_d = end_d - timedelta(days=6)
        return start_d, end_d
    else:  # MONTHLY
        next_day = end_d + timedelta(days=1)
        if next_day.day != 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Monthly report must end on the last day of a calendar month. Provided date {end_d} is not the month end.",
            )
        start_d = end_d.replace(day=1)
        return start_d, end_d


async def _verify_active_caregiver_relationship(
    caregiver_user: Dict[str, Any],
    patient_id_str: str,
) -> ObjectId:
    """Verify that the authenticated caregiver has an active relationship with the target patient.

    Security:
    - Rejects malformed patient ID with safe 404.
    - Rejects revoked or absent caregiver assignment with 403 without leaking patient existence.
    """
    if not is_valid_object_id(patient_id_str):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient records not found.",
        )

    patient_oid = to_object_id(patient_id_str)
    cg_email = caregiver_user.get("email", "").strip().lower()

    caregivers_coll = get_caregivers_collection()
    assignment = await caregivers_coll.find_one({
        "caregiverEmail": cg_email,
        "patientId": patient_oid,
        "status": CaregiverStatus.ACTIVE.value,
    })

    if not assignment:
        logger.warning(
            "Caregiver %s denied report for patient %s (no active assignment)",
            cg_email,
            patient_id_str,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Active caregiver relationship required.",
        )

    return patient_oid


async def _generate_report_response(
    patient_id: ObjectId,
    period: ReportPeriod,
    end_date_str: Optional[str],
) -> MedicationReportResponse:
    """Delegate report calculation to ReportService with clean domain exception mapping."""
    start_d, end_d = resolve_report_period_dates(period, end_date_str)
    service = ReportService()
    try:
        return await service.calculate_report(
            patient_id=patient_id,
            period=period,
            start_date=start_d,
            end_date=end_d,
        )
    except ReportValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except PatientNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient records not found.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Internal error generating report for patient %s: %s", patient_id, str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate adherence report.",
        )


async def _generate_pdf_response(
    patient_id: ObjectId,
    period: ReportPeriod,
    end_date_str: Optional[str],
) -> Response:
    """Generate adherence report PDF in-memory and return application/pdf response."""
    report = await _generate_report_response(patient_id, period, end_date_str)
    try:
        pdf_bytes = pdf_service.generate_report_pdf(report)
    except Exception as e:
        logger.error("Internal error rendering PDF for patient %s: %s", patient_id, str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to render adherence report PDF.",
        )

    if period == ReportPeriod.WEEKLY:
        filename = f"MediTrack_Weekly_Report_{report.endDate}.pdf"
    else:
        month_str = report.endDate[:7]
        filename = f"MediTrack_Monthly_Report_{month_str}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Type": "application/pdf",
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


# ============================================================================
# Patient Endpoints
# ============================================================================

@router.get(
    "/weekly",
    response_model=MedicationReportResponse,
    summary="Get patient weekly adherence report",
)
async def get_patient_weekly_report(
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> MedicationReportResponse:
    """Retrieve the weekly medication adherence report for the authenticated patient."""
    patient_oid = to_object_id(current_user["id"])
    return await _generate_report_response(patient_oid, ReportPeriod.WEEKLY, endDate)


@router.get(
    "/monthly",
    response_model=MedicationReportResponse,
    summary="Get patient monthly adherence report",
)
async def get_patient_monthly_report(
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> MedicationReportResponse:
    """Retrieve the monthly medication adherence report for the authenticated patient."""
    patient_oid = to_object_id(current_user["id"])
    return await _generate_report_response(patient_oid, ReportPeriod.MONTHLY, endDate)


@router.get(
    "/weekly/pdf",
    summary="Download patient weekly adherence report PDF",
)
async def get_patient_weekly_pdf(
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Response:
    """Render and download the weekly adherence report as a PDF for the authenticated patient."""
    patient_oid = to_object_id(current_user["id"])
    return await _generate_pdf_response(patient_oid, ReportPeriod.WEEKLY, endDate)


@router.get(
    "/monthly/pdf",
    summary="Download patient monthly adherence report PDF",
)
async def get_patient_monthly_pdf(
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_patient),
) -> Response:
    """Render and download the monthly adherence report as a PDF for the authenticated patient."""
    patient_oid = to_object_id(current_user["id"])
    return await _generate_pdf_response(patient_oid, ReportPeriod.MONTHLY, endDate)


# ============================================================================
# Caregiver Endpoints
# ============================================================================

@router.get(
    "/patients/{patient_id}/weekly",
    response_model=MedicationReportResponse,
    summary="Get caregiver linked-patient weekly adherence report",
)
async def get_caregiver_patient_weekly_report(
    patient_id: str,
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> MedicationReportResponse:
    """Retrieve the weekly adherence report for an actively linked patient."""
    patient_oid = await _verify_active_caregiver_relationship(current_user, patient_id)
    return await _generate_report_response(patient_oid, ReportPeriod.WEEKLY, endDate)


@router.get(
    "/patients/{patient_id}/monthly",
    response_model=MedicationReportResponse,
    summary="Get caregiver linked-patient monthly adherence report",
)
async def get_caregiver_patient_monthly_report(
    patient_id: str,
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> MedicationReportResponse:
    """Retrieve the monthly adherence report for an actively linked patient."""
    patient_oid = await _verify_active_caregiver_relationship(current_user, patient_id)
    return await _generate_report_response(patient_oid, ReportPeriod.MONTHLY, endDate)


@router.get(
    "/patients/{patient_id}/weekly/pdf",
    summary="Download caregiver linked-patient weekly adherence report PDF",
)
async def get_caregiver_patient_weekly_pdf(
    patient_id: str,
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> Response:
    """Render and download the weekly adherence report PDF for an actively linked patient."""
    patient_oid = await _verify_active_caregiver_relationship(current_user, patient_id)
    return await _generate_pdf_response(patient_oid, ReportPeriod.WEEKLY, endDate)


@router.get(
    "/patients/{patient_id}/monthly/pdf",
    summary="Download caregiver linked-patient monthly adherence report PDF",
)
async def get_caregiver_patient_monthly_pdf(
    patient_id: str,
    endDate: Optional[str] = Query(None, description="Report end date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_caregiver),
) -> Response:
    """Render and download the monthly adherence report PDF for an actively linked patient."""
    patient_oid = await _verify_active_caregiver_relationship(current_user, patient_id)
    return await _generate_pdf_response(patient_oid, ReportPeriod.MONTHLY, endDate)
