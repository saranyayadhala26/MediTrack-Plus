"""Unit tests for the shared Medication Schedule Occurrence Engine (Phase 9.2.1).

Covers all business rules and boundary conditions:
1. Daily schedule generates occurrence
2. Disabled schedule excluded
3. Medicine startDate boundary (inclusive, before, after)
4. Medicine endDate boundary (inclusive, before, after)
5. Schedule startDate boundary (inclusive, before, after)
6. Schedule endDate boundary (inclusive, before, after)
7. Weekly matching day
8. Weekly non-matching day
9. Custom matching date
10. Custom non-matching date
11. Sunday=0 mapping (weekday conversion)
12. Saturday=6 mapping (weekday conversion)
13. Multiple schedules/times remain independent
14. Date parsing & validation (valid, invalid format, invalid date)
15. Reference today resolution (clientDate vs UTC today)
16. Range occurrence generation (get_occurrence_dates_for_schedule)
17. Backward compatibility aliases in app.routers.calendar
"""

from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi import HTTPException

from app.services.occurrence_engine import (
    date_to_schema_day,
    get_occurrence_dates_for_schedule,
    get_reference_today,
    is_schedule_occurrence,
    parse_date,
    python_weekday_to_schema_day,
    schema_day_to_python_weekday,
)
from app.routers.calendar import (
    _is_schedule_occurrence,
    _get_reference_today,
    _parse_date,
)


# ============================================================================
# 1. Daily Schedule
# ============================================================================

def test_daily_schedule_generates_occurrence():
    """Verify active daily schedule generates occurrence on any valid date."""
    med = {"name": "Lisinopril 10mg"}
    sched = {"frequencyType": "daily", "enabled": True}
    test_d = date(2026, 9, 10)

    assert is_schedule_occurrence(sched, med, test_d, "2026-09-10") is True
    # Verify curr_str default when omitted
    assert is_schedule_occurrence(sched, med, test_d) is True


# ============================================================================
# 2. Disabled Schedule
# ============================================================================

def test_disabled_schedule_excluded():
    """Verify disabled schedule produces False regardless of frequency or dates."""
    med = {"name": "Lisinopril 10mg"}
    sched = {"frequencyType": "daily", "enabled": False}
    test_d = date(2026, 9, 10)

    assert is_schedule_occurrence(sched, med, test_d, "2026-09-10") is False


# ============================================================================
# 3. Medicine startDate Boundary
# ============================================================================

def test_medicine_start_date_boundary():
    """Verify medicine startDate boundary is strictly respected and inclusive."""
    med = {"name": "Amoxicillin", "startDate": "2026-09-10"}
    sched = {"frequencyType": "daily", "enabled": True}

    # Day before startDate -> excluded
    assert is_schedule_occurrence(sched, med, date(2026, 9, 9), "2026-09-09") is False
    # Exactly on startDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 10), "2026-09-10") is True
    # Day after startDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 11), "2026-09-11") is True


# ============================================================================
# 4. Medicine endDate Boundary
# ============================================================================

def test_medicine_end_date_boundary():
    """Verify medicine endDate boundary is strictly respected and inclusive."""
    med = {"name": "Amoxicillin", "endDate": "2026-09-15"}
    sched = {"frequencyType": "daily", "enabled": True}

    # Day before endDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 14), "2026-09-14") is True
    # Exactly on endDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 15), "2026-09-15") is True
    # Day after endDate -> excluded
    assert is_schedule_occurrence(sched, med, date(2026, 9, 16), "2026-09-16") is False


# ============================================================================
# 5. Schedule startDate Boundary
# ============================================================================

def test_schedule_start_date_boundary():
    """Verify schedule startDate boundary is strictly respected and inclusive."""
    med = {"name": "Metformin"}
    sched = {"frequencyType": "daily", "enabled": True, "startDate": "2026-09-10"}

    # Day before schedule startDate -> excluded
    assert is_schedule_occurrence(sched, med, date(2026, 9, 9), "2026-09-09") is False
    # Exactly on schedule startDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 10), "2026-09-10") is True
    # Day after schedule startDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 11), "2026-09-11") is True


# ============================================================================
# 6. Schedule endDate Boundary
# ============================================================================

def test_schedule_end_date_boundary():
    """Verify schedule endDate boundary is strictly respected and inclusive."""
    med = {"name": "Metformin"}
    sched = {"frequencyType": "daily", "enabled": True, "endDate": "2026-09-20"}

    # Day before schedule endDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 19), "2026-09-19") is True
    # Exactly on schedule endDate -> included
    assert is_schedule_occurrence(sched, med, date(2026, 9, 20), "2026-09-20") is True
    # Day after schedule endDate -> excluded
    assert is_schedule_occurrence(sched, med, date(2026, 9, 21), "2026-09-21") is False


# ============================================================================
# 7 & 8. Weekly Matching & Non-Matching Days
# ============================================================================

def test_weekly_matching_day():
    """Verify weekly schedule matches designated day of week."""
    # 2026-09-10 is Thursday -> weekday() == 3 -> schema_day == (3+1)%7 == 4 (Thursday)
    med = {"name": "Vitamin D"}
    sched = {"frequencyType": "weekly", "daysOfWeek": [4], "enabled": True}
    thursday = date(2026, 9, 10)

    assert is_schedule_occurrence(sched, med, thursday, "2026-09-10") is True


def test_weekly_non_matching_day():
    """Verify weekly schedule rejects days not in daysOfWeek."""
    # 2026-09-11 is Friday -> schema_day == 5
    med = {"name": "Vitamin D"}
    sched = {"frequencyType": "weekly", "daysOfWeek": [4], "enabled": True}  # only Thursday
    friday = date(2026, 9, 11)

    assert is_schedule_occurrence(sched, med, friday, "2026-09-11") is False


# ============================================================================
# 9 & 10. Custom Matching & Non-Matching Dates
# ============================================================================

def test_custom_matching_date():
    """Verify custom schedule matches explicit date strings in dates list."""
    med = {"name": "B12 Injection"}
    sched = {
        "frequencyType": "custom",
        "dates": ["2026-09-10", "2026-09-24"],
        "enabled": True,
    }

    assert is_schedule_occurrence(sched, med, date(2026, 9, 10), "2026-09-10") is True
    assert is_schedule_occurrence(sched, med, date(2026, 9, 24), "2026-09-24") is True


def test_custom_non_matching_date():
    """Verify custom schedule rejects dates not in the dates list."""
    med = {"name": "B12 Injection"}
    sched = {
        "frequencyType": "custom",
        "dates": ["2026-09-10", "2026-09-24"],
        "enabled": True,
    }

    assert is_schedule_occurrence(sched, med, date(2026, 9, 11), "2026-09-11") is False


# ============================================================================
# 11 & 12. Sunday=0 and Saturday=6 Weekday Mapping
# ============================================================================

def test_sunday_zero_mapping():
    """Verify Sunday maps to schema day 0 (Python weekday 6 -> (6+1)%7 == 0)."""
    # 2026-09-13 is Sunday
    sunday = date(2026, 9, 13)
    assert sunday.weekday() == 6  # Python weekday for Sunday
    assert python_weekday_to_schema_day(sunday.weekday()) == 0
    assert date_to_schema_day(sunday) == 0
    assert schema_day_to_python_weekday(0) == 6

    med = {"name": "Weekly Pill"}
    sched = {"frequencyType": "weekly", "daysOfWeek": [0], "enabled": True}
    assert is_schedule_occurrence(sched, med, sunday, "2026-09-13") is True


def test_saturday_six_mapping():
    """Verify Saturday maps to schema day 6 (Python weekday 5 -> (5+1)%7 == 6)."""
    # 2026-09-12 is Saturday
    saturday = date(2026, 9, 12)
    assert saturday.weekday() == 5  # Python weekday for Saturday
    assert python_weekday_to_schema_day(saturday.weekday()) == 6
    assert date_to_schema_day(saturday) == 6
    assert schema_day_to_python_weekday(6) == 5

    med = {"name": "Weekly Pill"}
    sched = {"frequencyType": "weekly", "daysOfWeek": [6], "enabled": True}
    assert is_schedule_occurrence(sched, med, saturday, "2026-09-12") is True


# ============================================================================
# 13. Multiple Schedules / Times Remain Independent
# ============================================================================

def test_multiple_schedules_remain_independent():
    """Verify multiple schedules for the same medicine evaluate independently."""
    med = {"name": "Metformin 500mg"}
    # Schedule 1: Morning daily
    sched_morning = {"_id": "s1", "time": "08:00", "frequencyType": "daily", "enabled": True}
    # Schedule 2: Evening weekly (Fridays only)
    sched_evening = {"_id": "s2", "time": "20:00", "frequencyType": "weekly", "daysOfWeek": [5], "enabled": True}

    # On Thursday (2026-09-10):
    thursday = date(2026, 9, 10)
    assert is_schedule_occurrence(sched_morning, med, thursday, "2026-09-10") is True
    assert is_schedule_occurrence(sched_evening, med, thursday, "2026-09-10") is False

    # On Friday (2026-09-11):
    friday = date(2026, 9, 11)
    assert is_schedule_occurrence(sched_morning, med, friday, "2026-09-11") is True
    assert is_schedule_occurrence(sched_evening, med, friday, "2026-09-11") is True


# ============================================================================
# 14. Date Parsing and Validation
# ============================================================================

def test_parse_date_valid():
    """Verify parse_date parses ISO format date string."""
    parsed = parse_date("2026-09-10", "testParam")
    assert parsed == date(2026, 9, 10)


def test_parse_date_invalid_format():
    """Verify parse_date rejects non-YYYY-MM-DD format with 422."""
    with pytest.raises(HTTPException) as exc_info:
        parse_date("10-09-2026", "startDate")
    assert exc_info.value.status_code == 422
    assert "startDate must be in YYYY-MM-DD format" in exc_info.value.detail


def test_parse_date_invalid_calendar_date():
    """Verify parse_date rejects non-existent dates (e.g. Feb 30) with 422."""
    with pytest.raises(HTTPException) as exc_info:
        parse_date("2026-02-30", "startDate")
    assert exc_info.value.status_code == 422
    assert "invalid calendar date" in exc_info.value.detail


# ============================================================================
# 15. Reference Today Resolution
# ============================================================================

def test_get_reference_today_with_client_date():
    """Verify clientDate string correctly sets reference date."""
    ref = get_reference_today("2026-09-10")
    assert ref == date(2026, 9, 10)


def test_get_reference_today_defaults_to_utc():
    """Verify omitting clientDate defaults to current UTC date."""
    ref = get_reference_today(None)
    expected_utc = datetime.now(timezone.utc).date()
    assert ref == expected_utc


# ============================================================================
# 16. Range Occurrence Generator Helper
# ============================================================================

def test_get_occurrence_dates_for_schedule_range():
    """Verify helper returns all occurrence dates within [start_date, end_date]."""
    med = {"name": "Lisinopril"}
    # MWF schedule: Monday=1, Wednesday=3, Friday=5
    sched = {"frequencyType": "weekly", "daysOfWeek": [1, 3, 5], "enabled": True}

    # Week of Sept 14 (Mon) to Sept 20 (Sun), 2026
    start_d = date(2026, 9, 14)
    end_d = date(2026, 9, 20)

    dates = get_occurrence_dates_for_schedule(sched, med, start_d, end_d)
    assert len(dates) == 3
    assert dates == [date(2026, 9, 14), date(2026, 9, 16), date(2026, 9, 18)]


# ============================================================================
# 17. Backward Compatibility Aliases
# ============================================================================

def test_calendar_router_backward_compatibility_aliases():
    """Verify calendar.py continues to export backward-compatible aliases."""
    med = {"name": "Aspirin"}
    sched = {"frequencyType": "daily", "enabled": True}
    d = date(2026, 9, 10)

    # Verify _is_schedule_occurrence alias
    assert _is_schedule_occurrence(sched, med, d, "2026-09-10") is True

    # Verify _get_reference_today alias
    assert _get_reference_today("2026-09-10") == d

    # Verify _parse_date alias
    assert _parse_date("2026-09-10", "param") == d
