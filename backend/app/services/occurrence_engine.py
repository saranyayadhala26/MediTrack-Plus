"""Medication Schedule Occurrence Engine.

Single source of truth for schedule occurrence calculations across:
- Phase 8 Medication Calendar
- Phase 8 Adherence Streaks
- Phase 9.2 Missed-Dose Evaluation Service

Provides:
- Date string validation and parsing (YYYY-MM-DD)
- Consistent timezone reference date determination (clientDate vs UTC today)
- Occurrence determination based on:
  * Schedule enabled/disabled status
  * Medicine course boundaries (startDate, endDate)
  * Schedule duration boundaries (startDate, endDate)
  * Frequency types: daily, weekly (Sunday=0 to Saturday=6), custom
- Range generation helper for schedule occurrences
- Weekday mapping helpers
"""

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status

DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def python_weekday_to_schema_day(python_weekday: int) -> int:
    """
    Convert Python's date.weekday() (0=Monday ... 6=Sunday)
    to MediTrack+ schema daysOfWeek (0=Sunday, 1=Monday ... 6=Saturday).
    """
    return (python_weekday + 1) % 7


def schema_day_to_python_weekday(schema_day: int) -> int:
    """
    Convert MediTrack+ schema daysOfWeek (0=Sunday, 1=Monday ... 6=Saturday)
    to Python's date.weekday() (0=Monday ... 6=Sunday).
    """
    return (schema_day - 1) % 7


def date_to_schema_day(d: date) -> int:
    """Return MediTrack+ schema day of week (0=Sunday ... 6=Saturday) for a date."""
    return python_weekday_to_schema_day(d.weekday())


def parse_date(date_str: str, param_name: str = "date") -> date:
    """
    Validate and parse a YYYY-MM-DD date string.
    Raises HTTPException(422) on invalid format or date value.
    """
    if not date_str or not DATE_REGEX.match(date_str.strip()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{param_name} must be in YYYY-MM-DD format.",
        )
    try:
        return date.fromisoformat(date_str.strip())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{param_name} contains an invalid calendar date: '{date_str}'.",
        )


def get_reference_today(client_date_param: Optional[str] = None) -> date:
    """
    Establish consistent timezone reference date for 'today'.
    Defaults to UTC today if clientDate is not supplied.
    """
    if client_date_param:
        return parse_date(client_date_param, "clientDate")
    return datetime.now(timezone.utc).date()


def is_schedule_occurrence(
    sched: Dict[str, Any],
    med: Dict[str, Any],
    curr_date: date,
    curr_str: Optional[str] = None,
) -> bool:
    """
    Check if a schedule generates an occurrence on a specific date.

    Business Rules:
    1. Schedule must be active (enabled != False)
    2. Medicine course boundaries (startDate, endDate)
    3. Schedule duration boundaries (startDate, endDate)
    4. Frequency type evaluation:
       - 'daily': Generates an occurrence every active day
       - 'weekly': Checks schema day (0=Sunday ... 6=Saturday) in daysOfWeek list
       - 'custom': Checks if YYYY-MM-DD date is in dates list
    """
    # 1. Schedule must be active
    if not sched.get("enabled", True):
        return False

    if curr_str is None:
        curr_str = curr_date.isoformat()

    # 2. Medicine course boundaries
    med_start = med.get("startDate")
    med_end = med.get("endDate")
    if med_start and curr_str < med_start:
        return False
    if med_end and curr_str > med_end:
        return False

    # 3. Schedule duration boundaries
    s_start = sched.get("startDate")
    s_end = sched.get("endDate")
    if s_start and curr_str < s_start:
        return False
    if s_end and curr_str > s_end:
        return False

    # 4. Frequency type evaluation
    freq = sched.get("frequencyType", "daily")
    if freq == "daily":
        return True

    if freq == "weekly":
        # Schema definition: 0=Sunday, 1=Monday ... 6=Saturday
        schema_day = date_to_schema_day(curr_date)
        return schema_day in (sched.get("daysOfWeek") or [])

    if freq == "custom":
        return curr_str in (sched.get("dates") or [])

    return False


def get_occurrence_dates_for_schedule(
    sched: Dict[str, Any],
    med: Dict[str, Any],
    start_date: date,
    end_date: date,
) -> List[date]:
    """
    Generate all dates in [start_date, end_date] where the schedule produces an occurrence.
    """
    occurrences: List[date] = []
    curr = start_date
    day_step = timedelta(days=1)
    while curr <= end_date:
        if is_schedule_occurrence(sched, med, curr, curr.isoformat()):
            occurrences.append(curr)
        curr += day_step
    return occurrences
