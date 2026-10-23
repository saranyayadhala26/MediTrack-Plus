"""Automated Test Matrix for MediTrack+ Medication Adherence Calculation.

Verifies the mathematical and clinical adherence rule:
    Adherence Percentage = (Taken Due Doses / Total Due Scheduled Doses) * 100

Covers all 10 required scenarios from the Adherence Calculation Audit Specification:
- TEST 1: 10 due, 10 Taken -> 100.0%
- TEST 2: 10 due, 7 Taken, 2 Missed, 1 Skipped -> 70.0%
- TEST 3: 10 due, 7 Taken, 3 Skipped -> 70.0%
- TEST 4: 10 due, 7 Taken, 3 Missed -> 70.0%
- TEST 5: 10 due, 7 Taken, 1 Snoozed -> Taken, 2 Skipped -> 80.0% (counted once)
- TEST 6: 10 due, 7 Taken, 1 Snoozed unresolved, 2 Skipped -> 70.0% (does not inflate adherence)
- TEST 7: 22 scheduled today, 18 Taken, 2 Skipped, 2 future Pending -> 90.0% (NOT 81.8%)
- TEST 8: 0 due scheduled doses -> safe zero-denominator behavior (0.0%, hasScheduledDoses=False)
- TEST 9: Multiple medicines (Med A: 3/3, Med B: 1/2) -> 80.0% (NOT average 75.0%)
- TEST 10: Duplicate activity records for same occurrence -> counted exactly once
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import pytest
from bson import ObjectId

from app.services.adherence_service import calculate_adherence_summary


class MockAsyncCollection:
    """In-memory mock for PyMongo Async Collection."""

    def __init__(self, documents: Optional[List[Dict[str, Any]]] = None):
        self.docs = documents or []

    async def find_one(self, query: Dict[str, Any], **kwargs) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                return d
        return None

    def find(self, query: Dict[str, Any], **kwargs):
        filtered = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if k == "userId" and d.get("userId") != v:
                    match = False
                elif k == "enabled" and d.get("enabled") != v:
                    match = False
                elif k == "scheduledDate":
                    val = d.get("scheduledDate")
                    if isinstance(v, dict):
                        gte = v.get("$gte")
                        lte = v.get("$lte")
                        if gte and val < gte:
                            match = False
                        if lte and val > lte:
                            match = False
                    elif val != v:
                        match = False
            if match:
                filtered.append(d)

        class Cursor:
            def __init__(self, items):
                self.items = items

            async def to_list(self, length=None):
                return self.items

        return Cursor(filtered)


def make_medicine(med_id: ObjectId, user_id: ObjectId, name: str = "Test Med") -> Dict[str, Any]:
    return {
        "_id": med_id,
        "userId": user_id,
        "name": name,
        "dosage": "500",
        "dosageUnit": "mg",
        "frequency": "daily",
        "inventory": 50,
        "refillThreshold": 5,
    }


def make_schedule(
    sched_id: ObjectId,
    user_id: ObjectId,
    med_id: ObjectId,
    time_str: str = "08:00",
    frequency_type: str = "daily",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "_id": sched_id,
        "userId": user_id,
        "medicineId": med_id,
        "time": time_str,
        "frequencyType": frequency_type,
        "startDate": start_date or "2026-08-01",
        "endDate": end_date or "2026-12-31",
        "enabled": True,
    }


def make_activity(
    user_id: ObjectId,
    sched_id: ObjectId,
    med_id: ObjectId,
    sched_date: str,
    sched_time: str,
    action: str,
    action_time: Optional[datetime] = None,
    was_snoozed: bool = False,
    snooze_count: int = 0,
    skip_reason: Optional[str] = None,
) -> Dict[str, Any]:
    act_dt = action_time or datetime.fromisoformat(f"{sched_date}T{sched_time}:00+00:00")
    return {
        "_id": ObjectId(),
        "userId": user_id,
        "medicineId": med_id,
        "scheduleId": sched_id,
        "scheduledDate": sched_date,
        "scheduledTime": sched_time,
        "action": action,
        "actionTime": act_dt,
        "createdAt": act_dt,
        "wasSnoozed": was_snoozed,
        "snoozeCount": snooze_count,
        "skipReason": skip_reason or ("Side effects" if action == "Skipped" else None),
    }


# ============================================================================
# TEST 1: 10 due, 10 Taken -> Expected: 100%
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_1_all_ten_taken():
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()

    med = make_medicine(med_id, user_id)
    sched = make_schedule(sched_id, user_id, med_id, "08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 10)  # 10 days, 1 dose/day

    activities = []
    curr = start_d
    while curr <= end_d:
        activities.append(make_activity(user_id, sched_id, med_id, curr.isoformat(), "08:00", "Taken"))
        curr += timedelta(days=1)

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
    )

    assert result["totalScheduled"] == 10
    assert result["dueCount"] == 10
    assert result["takenCount"] == 10
    assert result["skippedCount"] == 0
    assert result["missedCount"] == 0
    assert result["pendingCount"] == 0
    assert result["adherencePercentage"] == 100.0


# ============================================================================
# TEST 2: 10 due, 7 Taken, 2 Missed, 1 Skipped -> Expected: 70%
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_2_seven_taken_two_missed_one_skipped():
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()

    med = make_medicine(med_id, user_id)
    sched = make_schedule(sched_id, user_id, med_id, "08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 10)  # 10 days

    activities = []
    # Days 1-7: Taken
    for i in range(7):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Taken"))
    # Day 8: Skipped
    d_skip = (start_d + timedelta(days=7)).isoformat()
    activities.append(make_activity(user_id, sched_id, med_id, d_skip, "08:00", "Skipped"))
    # Days 9-10: No activity recorded (Missed)

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
    )

    assert result["totalScheduled"] == 10
    assert result["dueCount"] == 10
    assert result["takenCount"] == 7
    assert result["skippedCount"] == 1
    assert result["missedCount"] == 2
    assert result["adherencePercentage"] == 70.0


# ============================================================================
# TEST 3: 10 due, 7 Taken, 3 Skipped -> Expected: 70%
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_3_seven_taken_three_skipped():
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()

    med = make_medicine(med_id, user_id)
    sched = make_schedule(sched_id, user_id, med_id, "08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 10)

    activities = []
    for i in range(7):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Taken"))
    for i in range(7, 10):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Skipped"))

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
    )

    assert result["totalScheduled"] == 10
    assert result["dueCount"] == 10
    assert result["takenCount"] == 7
    assert result["skippedCount"] == 3
    assert result["missedCount"] == 0
    assert result["adherencePercentage"] == 70.0


# ============================================================================
# TEST 4: 10 due, 7 Taken, 3 Missed -> Expected: 70%
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_4_seven_taken_three_missed():
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()

    med = make_medicine(med_id, user_id)
    sched = make_schedule(sched_id, user_id, med_id, "08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 10)

    activities = []
    for i in range(7):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Taken"))
    # Days 8, 9, 10 unacted -> Missed

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
    )

    assert result["totalScheduled"] == 10
    assert result["dueCount"] == 10
    assert result["takenCount"] == 7
    assert result["skippedCount"] == 0
    assert result["missedCount"] == 3
    assert result["adherencePercentage"] == 70.0


# ============================================================================
# TEST 5: 10 due, 7 Taken, 1 Snoozed -> Taken, 2 Skipped -> Expected: 80%
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_5_snoozed_then_taken_counted_once():
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()

    med = make_medicine(med_id, user_id)
    sched = make_schedule(sched_id, user_id, med_id, "08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 10)

    activities = []
    # Days 1-7: Taken directly
    for i in range(7):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Taken"))

    # Day 8: First Snoozed at 08:02, then Taken at 08:12
    d8_str = (start_d + timedelta(days=7)).isoformat()
    snooze_act = make_activity(
        user_id, sched_id, med_id, d8_str, "08:00", "Snoozed",
        action_time=datetime.fromisoformat(f"{d8_str}T08:02:00+00:00")
    )
    taken_act = make_activity(
        user_id, sched_id, med_id, d8_str, "08:00", "Taken",
        action_time=datetime.fromisoformat(f"{d8_str}T08:12:00+00:00"),
        was_snoozed=True, snooze_count=1
    )
    activities.extend([snooze_act, taken_act])

    # Days 9-10: Skipped
    for i in range(8, 10):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Skipped"))

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
    )

    # 7 direct taken + 1 (snoozed->taken) = 8 taken
    # 2 skipped
    # Total due = 10
    # Adherence = 8 / 10 = 80.0%
    assert result["totalScheduled"] == 10
    assert result["dueCount"] == 10
    assert result["takenCount"] == 8
    assert result["skippedCount"] == 2
    assert result["missedCount"] == 0
    assert result["adherencePercentage"] == 80.0


# ============================================================================
# TEST 6: 10 due, 7 Taken, 1 Snoozed unresolved, 2 Skipped -> Expected: 70%
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_6_unresolved_snooze_does_not_inflate_adherence():
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()

    med = make_medicine(med_id, user_id)
    sched = make_schedule(sched_id, user_id, med_id, "08:00")

    start_d = date(2026, 8, 1)
    end_d = date(2026, 8, 10)

    activities = []
    # Days 1-7: Taken
    for i in range(7):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Taken"))

    # Day 8: Snoozed at 08:00, never resolved (eventually expired to Missed)
    d8_str = (start_d + timedelta(days=7)).isoformat()
    activities.append(make_activity(
        user_id, sched_id, med_id, d8_str, "08:00", "Snoozed",
        action_time=datetime.fromisoformat(f"{d8_str}T08:00:00+00:00")
    ))

    # Days 9-10: Skipped
    for i in range(8, 10):
        d_str = (start_d + timedelta(days=i)).isoformat()
        activities.append(make_activity(user_id, sched_id, med_id, d_str, "08:00", "Skipped"))

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date=start_d,
        end_date=end_d,
        reference_time=datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
    )

    # Taken: 7, Skipped: 2, Missed/Unresolved Snooze: 1
    # Due: 10
    # Adherence = 7 / 10 = 70.0% (NOT 7/9 = 77.8%)
    assert result["totalScheduled"] == 10
    assert result["dueCount"] == 10
    assert result["takenCount"] == 7
    assert result["skippedCount"] == 2
    assert result["missedCount"] == 1
    assert result["adherencePercentage"] == 70.0


# ============================================================================
# TEST 7: 22 scheduled today, 18 Taken, 2 Skipped, 2 future Pending -> Expected: 90%
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_7_future_pending_does_not_depress_adherence():
    user_id = ObjectId()
    med_id = ObjectId()

    med = make_medicine(med_id, user_id)
    today = date(2026, 10, 8)
    today_str = today.isoformat()

    # 22 schedules today:
    # 20 scheduled at 08:00 (past relative to 10:00 AM)
    # 2 scheduled in the future: 20:00 and 22:00
    schedules = []
    activities = []

    for i in range(20):
        s_id = ObjectId()
        schedules.append(make_schedule(s_id, user_id, med_id, time_str="08:00", start_date=today_str, end_date=today_str))
        if i < 18:
            # 18 Taken
            activities.append(make_activity(user_id, s_id, med_id, today_str, "08:00", "Taken"))
        else:
            # 2 Skipped
            activities.append(make_activity(user_id, s_id, med_id, today_str, "08:00", "Skipped"))

    # 2 Future schedules (20:00 and 22:00) with NO activity recorded
    s_fut1 = ObjectId()
    s_fut2 = ObjectId()
    schedules.append(make_schedule(s_fut1, user_id, med_id, time_str="20:00", start_date=today_str, end_date=today_str))
    schedules.append(make_schedule(s_fut2, user_id, med_id, time_str="22:00", start_date=today_str, end_date=today_str))

    # Evaluate at 10:00 AM UTC (after 08:00 doses are due, before 20:00 and 22:00)
    ref_time = datetime(2026, 10, 8, 10, 0, 0, tzinfo=timezone.utc)

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date=today,
        end_date=today,
        reference_time=ref_time,
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection(schedules),
        activities_coll=MockAsyncCollection(activities),
    )

    # 22 total scheduled today
    # 18 Taken, 2 Skipped, 2 Pending
    # Due denominator: 18 + 2 = 20
    # Adherence = 18 / 20 * 100 = 90.0% (NOT 18 / 22 = 81.8%)
    assert result["totalScheduled"] == 22
    assert result["takenCount"] == 18
    assert result["skippedCount"] == 2
    assert result["pendingCount"] == 2
    assert result["dueCount"] == 20
    assert result["adherencePercentage"] == 90.0


# ============================================================================
# TEST 8: 0 due scheduled doses -> Safe zero-denominator behavior
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_8_zero_due_scheduled_doses():
    user_id = ObjectId()

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date="2026-08-01",
        end_date="2026-08-07",
        medicines_coll=MockAsyncCollection([]),
        schedules_coll=MockAsyncCollection([]),
        activities_coll=MockAsyncCollection([]),
    )

    assert result["totalScheduled"] == 0
    assert result["dueCount"] == 0
    assert result["takenCount"] == 0
    assert result["skippedCount"] == 0
    assert result["missedCount"] == 0
    assert result["pendingCount"] == 0
    assert result["adherencePercentage"] == 0.0
    assert result["hasScheduledDoses"] is False


# ============================================================================
# TEST 9: Multiple medicines with multiple schedules -> 80% (no averaging)
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_9_multiple_medicines_no_percentage_averaging():
    user_id = ObjectId()
    med_a_id = ObjectId()
    med_b_id = ObjectId()

    med_a = make_medicine(med_a_id, user_id, name="Medicine A")
    med_b = make_medicine(med_b_id, user_id, name="Medicine B")

    # Med A: 3 due, 3 taken
    sched_a1 = make_schedule(ObjectId(), user_id, med_a_id, "08:00", start_date="2026-08-01", end_date="2026-08-01")
    sched_a2 = make_schedule(ObjectId(), user_id, med_a_id, "12:00", start_date="2026-08-01", end_date="2026-08-01")
    sched_a3 = make_schedule(ObjectId(), user_id, med_a_id, "20:00", start_date="2026-08-01", end_date="2026-08-01")

    # Med B: 2 due, 1 taken, 1 skipped
    sched_b1 = make_schedule(ObjectId(), user_id, med_b_id, "09:00", start_date="2026-08-01", end_date="2026-08-01")
    sched_b2 = make_schedule(ObjectId(), user_id, med_b_id, "21:00", start_date="2026-08-01", end_date="2026-08-01")

    schedules = [sched_a1, sched_a2, sched_a3, sched_b1, sched_b2]

    activities = [
        make_activity(user_id, sched_a1["_id"], med_a_id, "2026-08-01", "08:00", "Taken"),
        make_activity(user_id, sched_a2["_id"], med_a_id, "2026-08-01", "12:00", "Taken"),
        make_activity(user_id, sched_a3["_id"], med_a_id, "2026-08-01", "20:00", "Taken"),
        make_activity(user_id, sched_b1["_id"], med_b_id, "2026-08-01", "09:00", "Taken"),
        make_activity(user_id, sched_b2["_id"], med_b_id, "2026-08-01", "21:00", "Skipped"),
    ]

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date="2026-08-01",
        end_date="2026-08-01",
        reference_time=datetime(2026, 8, 2, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med_a, med_b]),
        schedules_coll=MockAsyncCollection(schedules),
        activities_coll=MockAsyncCollection(activities),
    )

    # Med A: 3 taken / 3 = 100%
    # Med B: 1 taken / 2 = 50%
    # Overall must be 4 taken / 5 due = 80.0%, NOT (100 + 50) / 2 = 75.0%
    assert result["totalScheduled"] == 5
    assert result["dueCount"] == 5
    assert result["takenCount"] == 4
    assert result["skippedCount"] == 1
    assert result["adherencePercentage"] == 80.0


# ============================================================================
# TEST 10: Duplicate activity records for the same occurrence -> Counted once
# ============================================================================
@pytest.mark.asyncio
async def test_scenario_10_duplicate_activities_counted_once():
    user_id = ObjectId()
    med_id = ObjectId()
    sched_id = ObjectId()

    med = make_medicine(med_id, user_id)
    sched = make_schedule(sched_id, user_id, med_id, "08:00", start_date="2026-08-01", end_date="2026-08-01")

    # 3 duplicate Taken activities for the exact same occurrence
    activities = [
        make_activity(user_id, sched_id, med_id, "2026-08-01", "08:00", "Taken",
                      action_time=datetime.fromisoformat("2026-08-01T08:01:00+00:00")),
        make_activity(user_id, sched_id, med_id, "2026-08-01", "08:00", "Taken",
                      action_time=datetime.fromisoformat("2026-08-01T08:01:05+00:00")),
        make_activity(user_id, sched_id, med_id, "2026-08-01", "08:00", "Taken",
                      action_time=datetime.fromisoformat("2026-08-01T08:01:10+00:00")),
    ]

    result = await calculate_adherence_summary(
        patient_oid=user_id,
        start_date="2026-08-01",
        end_date="2026-08-01",
        reference_time=datetime(2026, 8, 2, 0, 0, tzinfo=timezone.utc),
        medicines_coll=MockAsyncCollection([med]),
        schedules_coll=MockAsyncCollection([sched]),
        activities_coll=MockAsyncCollection(activities),
    )

    # Must be counted exactly once
    assert result["totalScheduled"] == 1
    assert result["dueCount"] == 1
    assert result["takenCount"] == 1
    assert result["adherencePercentage"] == 100.0


# ============================================================================
# API INTEGRATION TESTS: HTTP GET /api/v1/medication-activities/summary
# ============================================================================
import uuid
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.db.mongodb import (
    get_activities_collection,
    get_medicines_collection,
    get_schedules_collection,
    get_users_collection,
)
from app.utils.mongo import to_object_id


def unique_email(prefix: str = "adh_test") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


async def setup_test_patient_client(client: AsyncClient):
    email = unique_email()
    password = "SecurePassword123!"
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={
            "fullName": "Adherence Patient",
            "email": email,
            "password": password,
            "confirmPassword": password,
            "role": "patient",
            "emergencyContact": "+1-555-0199",
        },
    )
    assert reg_res.status_code == 201
    auth_data = reg_res.json()
    token = auth_data["access_token"]
    user_id = auth_data["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}
    return user_id, headers


async def cleanup_patient_data(user_id: str):
    u_oid = to_object_id(user_id)
    await get_activities_collection().delete_many({"userId": u_oid})
    await get_schedules_collection().delete_many({"userId": u_oid})
    await get_medicines_collection().delete_many({"userId": u_oid})
    await get_users_collection().delete_many({"_id": u_oid})


@pytest.mark.asyncio
async def test_api_adherence_summary_future_pending_exclusion():
    """Verify via live HTTP endpoint that future pending doses do NOT reduce adherence."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_id, headers = await setup_test_patient_client(client)
        try:
            today_str = date.today().isoformat()

            # 1. Create Medicine
            med_res = await client.post(
                "/api/v1/medicines",
                headers=headers,
                json={"name": "Metformin", "dosage": "500", "dosageUnit": "mg", "frequency": "Daily"},
            )
            assert med_res.status_code == 201
            med_id = med_res.json()["id"]

            # 2. Create Schedule 1: 08:00 (due/past)
            sched1_res = await client.post(
                "/api/v1/schedules",
                headers=headers,
                json={"medicineId": med_id, "time": "08:00", "frequencyType": "daily"},
            )
            assert sched1_res.status_code == 201
            sched1_id = sched1_res.json()["id"]

            # 3. Create Schedule 2: 23:59 (future pending relative to 10:00 reference time)
            sched2_res = await client.post(
                "/api/v1/schedules",
                headers=headers,
                json={"medicineId": med_id, "time": "23:59", "frequencyType": "daily"},
            )
            assert sched2_res.status_code == 201

            # 4. Record Taken for Schedule 1
            act_res = await client.post(
                "/api/v1/medication-activities",
                headers=headers,
                json={
                    "medicineId": med_id,
                    "scheduleId": sched1_id,
                    "scheduledDate": today_str,
                    "scheduledTime": "08:00",
                    "action": "Taken",
                },
            )
            assert act_res.status_code == 201

            # 5. Query summary with referenceTime at 10:00 AM (Schedule 2 at 23:59 is pending)
            ref_iso = f"{today_str}T10:00:00Z"
            res = await client.get(
                f"/api/v1/medication-activities/summary?startDate={today_str}&endDate={today_str}&referenceTime={ref_iso}",
                headers=headers,
            )
            assert res.status_code == 200
            data = res.json()

            # 2 total scheduled (08:00 + 23:59)
            assert data["totalScheduled"] == 2
            # 1 Taken (08:00)
            assert data["takenCount"] == 1
            # 1 Pending (23:59)
            assert data["pendingCount"] == 1
            # 1 Due (08:00)
            assert data["dueCount"] == 1
            # Adherence = 1 / 1 = 100.0% (NOT 1 / 2 = 50.0%)
            assert data["adherencePercentage"] == 100.0
        finally:
            await cleanup_patient_data(user_id)


@pytest.mark.asyncio
async def test_api_adherence_summary_zero_doses():
    """Verify via live HTTP endpoint that zero scheduled doses safely returns 0.0% without error."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_id, headers = await setup_test_patient_client(client)
        try:
            today_str = date.today().isoformat()
            res = await client.get(
                f"/api/v1/medication-activities/summary?startDate={today_str}&endDate={today_str}",
                headers=headers,
            )
            assert res.status_code == 200
            data = res.json()
            assert data["totalScheduled"] == 0
            assert data["takenCount"] == 0
            assert data["adherencePercentage"] == 0.0
            assert data["hasScheduledDoses"] is False
        finally:
            await cleanup_patient_data(user_id)

