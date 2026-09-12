"""Medication Calendar and Adherence Streaks Router (Phase 8).

Endpoints:
- GET /api/v1/medication-calendar: Retrieve scheduled medication occurrences and day-level statuses
- GET /api/v1/medication-calendar/streaks: Compute real adherence streaks based on actual scheduled doses

Enforces:
- Strict patient isolation and safe cross-patient privacy
- Active caregiver read-only permissions
- Explicit timezone consistency via clientDate query param
- Multi-dose and multi-medicine aggregate status per day
- Clinically sound, non-fabricated streaks with neutral rest-day handling
"""

import calendar
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from bson import ObjectId
import pymongo

from app.core.dependencies import get_current_user
from app.db.mongodb import (
    get_activities_collection,
    get_caregivers_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.schemas.calendar import (
    CalendarOccurrence,
    CalendarResponse,
    CalendarStatus,
    DayAggregateStatus,
    DaySummary,
    StreakResponse,
)
from app.schemas.user import UserRole
from app.utils.mongo import is_valid_object_id, to_object_id

logger = logging.getLogger("meditrack.calendar")
router = APIRouter(tags=["Medication Calendar & Streaks"])

from app.services.occurrence_engine import (
    DATE_REGEX,
    date_to_schema_day,
    get_occurrence_dates_for_schedule,
    get_reference_today,
    is_schedule_occurrence,
    parse_date,
    python_weekday_to_schema_day,
    schema_day_to_python_weekday,
)
from app.services.adherence_service import (
    build_calendar_response,
    build_streak_response,
)

# Backward-compatible aliases
_DATE_REGEX = DATE_REGEX
_parse_date = parse_date
_get_reference_today = get_reference_today
_is_schedule_occurrence = is_schedule_occurrence


async def _resolve_target_patient(
    current_user: Dict[str, Any],
    patient_id_param: Optional[str],
) -> ObjectId:
    """
    Resolve and authorize the target patient ObjectId.

    Rules:
    - Patient users:
      - Always derive identity from JWT (current_user["id"]).
      - If patient_id_param is supplied and does NOT match caller:
        Raise safe 404 (consistent with MediTrack+ resource isolation).
    - Caregiver users:
      - patient_id_param is mandatory.
      - Check active caregiver assignment in 'caregivers' collection.
      - Unassigned / inactive caregivers receive 403 Forbidden.
    """
    user_role = current_user.get("role")
    caller_id_str = current_user.get("id")

    if user_role == UserRole.PATIENT.value or user_role == UserRole.PATIENT:
        # Patient caller
        if patient_id_param and patient_id_param != caller_id_str:
            logger.warning(
                "Cross-patient calendar access attempt: caller %s requested patient %s",
                caller_id_str,
                patient_id_param,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient records not found.",
            )
        return to_object_id(caller_id_str)

    if user_role == UserRole.CAREGIVER.value or user_role == UserRole.CAREGIVER:
        # Caregiver caller
        if not patient_id_param:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patientId query parameter is required for caregiver access.",
            )
        if not is_valid_object_id(patient_id_param):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient records not found.",
            )

        target_patient_oid = to_object_id(patient_id_param)
        caregivers_coll = get_caregivers_collection()
        assignment = await caregivers_coll.find_one({
            "caregiverEmail": current_user.get("email", "").strip().lower(),
            "patientId": target_patient_oid,
            "status": "active",
        })

        if not assignment:
            logger.warning(
                "Caregiver %s denied access to patient %s (no active assignment)",
                current_user.get("email"),
                patient_id_param,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: Active caregiver assignment required.",
            )

        return target_patient_oid

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access forbidden: Invalid user role.",
    )


@router.get(
    "",
    response_model=CalendarResponse,
    summary="Retrieve medication calendar occurrences and day statuses",
)
async def get_medication_calendar(
    startDate: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    endDate: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    clientDate: Optional[str] = Query(None, description="Client reference today (YYYY-MM-DD)"),
    patientId: Optional[str] = Query(None, description="Target patient ID (caregivers only)"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> CalendarResponse:
    """
    Retrieve all scheduled medication occurrences and aggregate daily adherence
    statuses for a requested date range.
    """
    patient_oid = await _resolve_target_patient(current_user, patientId)
    today = _get_reference_today(clientDate)

    # Establish date range (default to full current month of reference today)
    if startDate:
        start_d = _parse_date(startDate, "startDate")
    else:
        start_d = date(today.year, today.month, 1)

    if endDate:
        end_d = _parse_date(endDate, "endDate")
    else:
        _, last_day = calendar.monthrange(today.year, today.month)
        end_d = date(today.year, today.month, last_day)

    if start_d > end_d:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="startDate cannot be after endDate.",
        )

    return await build_calendar_response(patient_oid, start_d, end_d, today)


@router.get(
    "/streaks",
    response_model=StreakResponse,
    summary="Calculate actual medication adherence streak",
)
async def get_adherence_streaks(
    clientDate: Optional[str] = Query(None, description="Client reference today (YYYY-MM-DD)"),
    patientId: Optional[str] = Query(None, description="Target patient ID (caregivers only)"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> StreakResponse:
    """
    Compute real, non-fabricated medication adherence streaks based on scheduled doses.

    Rules:
    - Only historical days up to clientDate (today) are evaluated. Future dates are excluded.
    - Days with no doses scheduled are neutral (do not break streak, do not increment streak).
    - An adherent day requires ALL scheduled doses for that day to be Taken.
    - If today has pending doses and no skipped doses, it is in-progress (streak evaluated from yesterday).
    - If today has a skipped dose, the streak is broken (currentStreak = 0).
    """
    patient_oid = await _resolve_target_patient(current_user, patientId)
    today = _get_reference_today(clientDate)
    return await build_streak_response(patient_oid, today)
