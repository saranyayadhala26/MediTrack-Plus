"""Unit and integration tests for Caregiver Alert Persistence & Deduplication (Phase 9.2.4).

Covers all Phase 9.2.4 requirements:
1. RULE_A creates one alert
2. RULE_B creates one alert
3. RULE_A_B creates exactly one alert
4. NONE creates no alert
5. One active caregiver receives one alert
6. Two active caregivers receive two independent alerts
7. Revoked caregiver receives no new alert
8. No active caregivers creates no alert
9. Repeated evaluation does not duplicate
10. Duplicate insertion/concurrent evaluation is handled safely (DuplicateKeyError caught)
11. Caregiver A and Caregiver B each get their own record
12. Same caregiver + same fingerprint is deduplicated
13. Different scheduledTime produces a different fingerprint
14. Different scheduleId produces a different fingerprint
15. Different medicineId produces a different fingerprint
16. Different alertType produces a different fingerprint
17. Same occurrence + same alert type remains deduplicated
18. RULE_A_B is not split into RULE_A + RULE_B
19. Existing patient notification behavior remains intact
20. No sensitive auth fields are persisted
21. Exact 6-tuple fingerprint format verification
22. Effective uniqueness verification (caregiverId + fingerprint)
23. Mark alert as read functionality
24. Scoped querying of alerts by caregiver, patient, and status
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.models.collections import create_notification_document, now_utc
from app.schemas.notification import (
    NotificationCreate,
    NotificationResponse,
    NotificationStatus,
    NotificationType,
)
from app.services.caregiver_alert_service import (
    AlertPersistenceResult,
    CaregiverAlertService,
    build_fingerprint,
)
from app.services.missed_dose_rules import (
    OccurrenceRuleEvaluation,
    RuleQualificationType,
)
from app.services.missed_dose_service import (
    ClassifiedOccurrence,
    OccurrenceClassification,
)


def make_test_occurrence(
    patient_id: str = "6ba258000000000000000001",
    med_id: str = "6ba258000000000000000010",
    med_name: str = "Lisinopril 10mg",
    sched_id: str = "6ba258000000000000000100",
    sched_date: str = "2026-09-10",
    sched_time: str = "08:00",
    status: OccurrenceClassification = OccurrenceClassification.MISSED,
) -> ClassifiedOccurrence:
    """Fixture factory for a ClassifiedOccurrence."""
    dt = datetime.fromisoformat(f"{sched_date}T{sched_time}:00").replace(tzinfo=timezone.utc)
    return ClassifiedOccurrence(
        patient_id=ObjectId(patient_id),
        medicine_id=ObjectId(med_id),
        medicine_name=med_name,
        dosage="10",
        dosage_unit="mg",
        schedule_id=ObjectId(sched_id),
        frequency_type="daily",
        scheduled_date=sched_date,
        scheduled_time=sched_time,
        scheduled_datetime=dt,
        status=status,
        is_missed=(status == OccurrenceClassification.MISSED),
    )


def make_test_evaluation(
    occurrence: ClassifiedOccurrence,
    qualification: RuleQualificationType,
) -> OccurrenceRuleEvaluation:
    """Fixture factory for an OccurrenceRuleEvaluation."""
    rule_a = qualification in (RuleQualificationType.RULE_A, RuleQualificationType.RULE_A_B)
    rule_b = qualification in (RuleQualificationType.RULE_B, RuleQualificationType.RULE_A_B)
    return OccurrenceRuleEvaluation(
        occurrence=occurrence,
        qualification=qualification,
        rule_a_satisfied=rule_a,
        rule_b_satisfied=rule_b,
        rule_a_trigger_occurrences=[occurrence] if rule_a else [],
        rule_b_consecutive_previous=occurrence if rule_b else None,
    )


class MockAsyncCursor:
    """Async cursor mock for iterating documents."""

    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = list(docs)
        self._iter = iter(self._docs)

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration

    def sort(self, field: str, direction: int = 1):
        reverse = (direction == -1)
        self._docs.sort(key=lambda d: d.get(field, None) or datetime.min.replace(tzinfo=timezone.utc), reverse=reverse)
        return self

    def limit(self, count: int):
        self._docs = self._docs[:count]
        return self


class MockNotificationsCollection:
    """Mock PyMongo collection for Notifications simulating unique index on (caregiverId, fingerprint)."""

    def __init__(self):
        self.docs: List[Dict[str, Any]] = []
        self.index_keys: set = set()

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None

    def find(self, query: Dict[str, Any]) -> MockAsyncCursor:
        matched = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                matched.append(dict(d))
        return MockAsyncCursor(matched)

    async def insert_one(self, doc: Dict[str, Any]):
        cg_id = doc.get("caregiverId")
        fp = doc.get("fingerprint")
        # Enforce unique index on (caregiverId, fingerprint) where fingerprint is a string
        if cg_id is not None and isinstance(fp, str):
            key = (str(cg_id), fp)
            if key in self.index_keys:
                raise DuplicateKeyError(
                    f"E11000 duplicate key error collection: notifications index: caregiverId_1_fingerprint_1 dup key: {key}"
                )
            self.index_keys.add(key)

        doc_copy = dict(doc)
        if "_id" not in doc_copy:
            doc_copy["_id"] = ObjectId()
        self.docs.append(doc_copy)

        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id

        return InsertResult(doc_copy["_id"])

    async def find_one_and_update(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        return_document=None,
    ) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                if "$set" in update:
                    d.update(update["$set"])
                return dict(d)
        return None

    async def count_documents(self, query: Dict[str, Any]) -> int:
        count = 0
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count


class MockCaregiversCollection:
    """Mock PyMongo collection for Caregivers relationships."""

    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None):
        self.docs: List[Dict[str, Any]] = [dict(d) for d in (docs or [])]

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None

    def find(self, query: Dict[str, Any]) -> MockAsyncCursor:
        matched = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                matched.append(dict(d))
        return MockAsyncCursor(matched)


class MockUsersCollection:
    """Mock PyMongo collection for Users."""

    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None):
        self.docs: List[Dict[str, Any]] = [dict(d) for d in (docs or [])]

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                if d.get(k) != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None


# ==============================================================================
# TEST SUITE: 1. RULE_A creates one alert
# ==============================================================================

@pytest.mark.asyncio
async def test_rule_a_creates_one_alert():
    """1. RULE_A qualification creates exactly one alert record."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res = await service.persist_alert_for_caregiver(
        caregiver_id=cg_id,
        patient_id=pt_id,
        occurrence=occ,
        qualification=RuleQualificationType.RULE_A,
    )

    assert res is not None
    assert res.created is True
    assert res.alert_type == "RULE_A"
    assert len(notif_coll.docs) == 1
    doc = notif_coll.docs[0]
    assert doc["alertType"] == "RULE_A"
    assert doc["type"] == NotificationType.CAREGIVER_ALERT.value
    assert doc["status"] == "unread"


# ==============================================================================
# TEST SUITE: 2. RULE_B creates one alert
# ==============================================================================

@pytest.mark.asyncio
async def test_rule_b_creates_one_alert():
    """2. RULE_B qualification creates exactly one alert record."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res = await service.persist_alert_for_caregiver(
        caregiver_id=cg_id,
        patient_id=pt_id,
        occurrence=occ,
        qualification=RuleQualificationType.RULE_B,
    )

    assert res is not None
    assert res.created is True
    assert res.alert_type == "RULE_B"
    assert len(notif_coll.docs) == 1
    doc = notif_coll.docs[0]
    assert doc["alertType"] == "RULE_B"


# ==============================================================================
# TEST SUITE: 3. RULE_A_B creates exactly one alert
# ==============================================================================

@pytest.mark.asyncio
async def test_rule_a_b_creates_exactly_one_alert():
    """3. RULE_A_B qualification creates exactly ONE combined alert, not two."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res = await service.persist_alert_for_caregiver(
        caregiver_id=cg_id,
        patient_id=pt_id,
        occurrence=occ,
        qualification=RuleQualificationType.RULE_A_B,
    )

    assert res is not None
    assert res.created is True
    assert res.alert_type == "RULE_A_B"
    assert len(notif_coll.docs) == 1
    assert notif_coll.docs[0]["alertType"] == "RULE_A_B"


# ==============================================================================
# TEST SUITE: 4. NONE creates no alert
# ==============================================================================

@pytest.mark.asyncio
async def test_none_creates_no_alert():
    """4. NONE qualification must never create any alert record."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res = await service.persist_alert_for_caregiver(
        caregiver_id=cg_id,
        patient_id=pt_id,
        occurrence=occ,
        qualification=RuleQualificationType.NONE,
    )

    assert res is None
    assert len(notif_coll.docs) == 0


# ==============================================================================
# TEST SUITE: 5. One active caregiver receives one alert
# ==============================================================================

@pytest.mark.asyncio
async def test_one_active_caregiver_receives_one_alert():
    """5. Patient with one active caregiver creates exactly one alert for that caregiver."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_user_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver1@example.com"

    caregivers_coll = MockCaregiversCollection([
        {
            "_id": ObjectId("6ba258000000000000000aa1"),
            "patientId": pt_id,
            "caregiverEmail": cg_email,
            "status": "active",
        }
    ])
    users_coll = MockUsersCollection([
        {"_id": cg_user_id, "email": cg_email, "role": "caregiver"}
    ])
    notif_coll = MockNotificationsCollection()

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=caregivers_coll,
        users_collection=users_coll,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)

    assert len(results) == 1
    assert results[0].created is True
    assert results[0].caregiver_id == cg_user_id
    assert len(notif_coll.docs) == 1
    assert notif_coll.docs[0]["caregiverId"] == cg_user_id
    assert notif_coll.docs[0]["userId"] == cg_user_id


# ==============================================================================
# TEST SUITE: 6. Two active caregivers receive two independent alerts
# ==============================================================================

@pytest.mark.asyncio
async def test_two_active_caregivers_receive_two_independent_alerts():
    """6. Two active caregivers for the same patient each receive an independent alert record."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg1_id = ObjectId("6ba2580000000000000000c1")
    cg2_id = ObjectId("6ba2580000000000000000c2")

    caregivers_coll = MockCaregiversCollection([
        {"_id": ObjectId("6ba258000000000000000aa1"), "patientId": pt_id, "caregiverEmail": "cg1@example.com", "status": "active"},
        {"_id": ObjectId("6ba258000000000000000aa2"), "patientId": pt_id, "caregiverEmail": "cg2@example.com", "status": "active"},
    ])
    users_coll = MockUsersCollection([
        {"_id": cg1_id, "email": "cg1@example.com", "role": "caregiver"},
        {"_id": cg2_id, "email": "cg2@example.com", "role": "caregiver"},
    ])
    notif_coll = MockNotificationsCollection()

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=caregivers_coll,
        users_collection=users_coll,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)

    assert len(results) == 2
    assert results[0].created is True
    assert results[1].created is True
    recipients = {r.caregiver_id for r in results}
    assert recipients == {cg1_id, cg2_id}
    assert len(notif_coll.docs) == 2

    # Both share the same fingerprint, but have different caregiverId
    assert results[0].fingerprint == results[1].fingerprint
    assert notif_coll.docs[0]["fingerprint"] == notif_coll.docs[1]["fingerprint"]
    assert notif_coll.docs[0]["caregiverId"] != notif_coll.docs[1]["caregiverId"]


# ==============================================================================
# TEST SUITE: 7. Revoked caregiver receives no new alert
# ==============================================================================

@pytest.mark.asyncio
async def test_revoked_caregiver_receives_no_new_alert():
    """7. A revoked caregiver link does not receive any alerts."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")

    caregivers_coll = MockCaregiversCollection([
        {
            "_id": ObjectId("6ba258000000000000000aa1"),
            "patientId": pt_id,
            "caregiverEmail": "revoked@example.com",
            "status": "revoked",
        }
    ])
    users_coll = MockUsersCollection([
        {"_id": cg_id, "email": "revoked@example.com", "role": "caregiver"}
    ])
    notif_coll = MockNotificationsCollection()

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=caregivers_coll,
        users_collection=users_coll,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)

    assert len(results) == 0
    assert len(notif_coll.docs) == 0


# ==============================================================================
# TEST SUITE: 8. No active caregivers creates no alert
# ==============================================================================

@pytest.mark.asyncio
async def test_no_active_caregivers_creates_no_alert():
    """8. Patient without any active caregivers generates zero alert records."""
    pt_id = ObjectId("6ba258000000000000000001")
    caregivers_coll = MockCaregiversCollection([])
    users_coll = MockUsersCollection([])
    notif_coll = MockNotificationsCollection()

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=caregivers_coll,
        users_collection=users_coll,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)

    assert len(results) == 0
    assert len(notif_coll.docs) == 0


# ==============================================================================
# TEST SUITE: 9. Repeated evaluation does not duplicate
# ==============================================================================

@pytest.mark.asyncio
async def test_repeated_evaluation_does_not_duplicate():
    """9. Evaluating the same qualification repeatedly deduplicates; exactly one record persists."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")

    caregivers_coll = MockCaregiversCollection([
        {"_id": ObjectId("6ba258000000000000000aa1"), "patientId": pt_id, "caregiverEmail": "cg@example.com", "status": "active"}
    ])
    users_coll = MockUsersCollection([
        {"_id": cg_id, "email": "cg@example.com", "role": "caregiver"}
    ])
    notif_coll = MockNotificationsCollection()

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=caregivers_coll,
        users_collection=users_coll,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    # First evaluation run -> created = True
    res1 = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(res1) == 1
    assert res1[0].created is True
    assert len(notif_coll.docs) == 1

    # Second evaluation run -> created = False (deduplicated)
    res2 = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(res2) == 1
    assert res2[0].created is False
    assert len(notif_coll.docs) == 1  # Still 1 document!
    assert res2[0].notification_id == res1[0].notification_id


# ==============================================================================
# TEST SUITE: 10. Concurrency race safety (DuplicateKeyError handling)
# ==============================================================================

@pytest.mark.asyncio
async def test_duplicate_key_error_handled_safely():
    """10. DuplicateKeyError during concurrent insertion is safely caught and handled."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    # Pre-seed index_keys to simulate another worker inserting right between find_one and insert_one
    fp = build_fingerprint(
        patient_id=pt_id,
        medicine_id=occ.medicine_id,
        schedule_id=occ.schedule_id,
        scheduled_date=occ.scheduled_date,
        scheduled_time=occ.scheduled_time,
        alert_type="RULE_A",
    )
    # Simulate existing doc in DB and index
    existing_doc = create_notification_document(
        user_id=cg_id,
        notification_type="caregiver_alert",
        title="Existing",
        message="Existing",
        caregiver_id=cg_id,
        patient_id=pt_id,
        alert_type="RULE_A",
        fingerprint=fp,
    )
    notif_coll.docs.append(existing_doc)
    notif_coll.index_keys.add((str(cg_id), fp))

    # Now attempt persist: Even if find_one returned None in a race condition,
    # the service catches DuplicateKeyError and returns created=False.
    res = await service.persist_alert_for_caregiver(
        caregiver_id=cg_id,
        patient_id=pt_id,
        occurrence=occ,
        qualification=RuleQualificationType.RULE_A,
    )
    assert res is not None
    assert res.created is False
    assert res.fingerprint == fp
    assert len(notif_coll.docs) == 1


# ==============================================================================
# TEST SUITE: 11. Caregiver A and Caregiver B each get their own record
# ==============================================================================

@pytest.mark.asyncio
async def test_caregiver_a_and_b_each_get_own_record():
    """11. Caregiver A and Caregiver B each get their own distinct notification document."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_a = ObjectId("6ba2580000000000000000a1")
    cg_b = ObjectId("6ba2580000000000000000b1")
    pt_id = occ.patient_id

    res_a = await service.persist_alert_for_caregiver(cg_a, pt_id, occ, RuleQualificationType.RULE_A)
    res_b = await service.persist_alert_for_caregiver(cg_b, pt_id, occ, RuleQualificationType.RULE_A)

    assert res_a.created is True
    assert res_b.created is True
    assert res_a.notification_id != res_b.notification_id
    assert len(notif_coll.docs) == 2


# ==============================================================================
# TEST SUITE: 12. Same caregiver + same fingerprint is deduplicated
# ==============================================================================

@pytest.mark.asyncio
async def test_same_caregiver_same_fingerprint_deduplicated():
    """12. Same caregiver + same fingerprint results in deduplication on repeated attempts."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res1 = await service.persist_alert_for_caregiver(cg_id, pt_id, occ, RuleQualificationType.RULE_A)
    res2 = await service.persist_alert_for_caregiver(cg_id, pt_id, occ, RuleQualificationType.RULE_A)

    assert res1.created is True
    assert res2.created is False
    assert len(notif_coll.docs) == 1


# ==============================================================================
# TEST SUITE: 13-16. Fingerprint variations (6-tuple fields)
# ==============================================================================

def test_different_scheduled_time_produces_different_fingerprint():
    """13. Different scheduledTime produces a different fingerprint."""
    fp1 = build_fingerprint("p1", "m1", "s1", "2026-09-10", "08:00", "RULE_A")
    fp2 = build_fingerprint("p1", "m1", "s1", "2026-09-10", "20:00", "RULE_A")
    assert fp1 != fp2
    assert "08:00" in fp1
    assert "20:00" in fp2


def test_different_schedule_id_produces_different_fingerprint():
    """14. Different scheduleId produces a different fingerprint."""
    fp1 = build_fingerprint("p1", "m1", "sched_alpha", "2026-09-10", "08:00", "RULE_A")
    fp2 = build_fingerprint("p1", "m1", "sched_beta", "2026-09-10", "08:00", "RULE_A")
    assert fp1 != fp2
    assert "sched_alpha" in fp1
    assert "sched_beta" in fp2


def test_different_medicine_id_produces_different_fingerprint():
    """15. Different medicineId produces a different fingerprint."""
    fp1 = build_fingerprint("p1", "med_101", "s1", "2026-09-10", "08:00", "RULE_A")
    fp2 = build_fingerprint("p1", "med_202", "s1", "2026-09-10", "08:00", "RULE_A")
    assert fp1 != fp2
    assert "med_101" in fp1
    assert "med_202" in fp2


def test_different_alert_type_produces_different_fingerprint():
    """16. Different alertType produces a different fingerprint."""
    fp_a = build_fingerprint("p1", "m1", "s1", "2026-09-10", "08:00", "RULE_A")
    fp_b = build_fingerprint("p1", "m1", "s1", "2026-09-10", "08:00", "RULE_B")
    fp_ab = build_fingerprint("p1", "m1", "s1", "2026-09-10", "08:00", "RULE_A_B")
    assert fp_a != fp_b
    assert fp_b != fp_ab
    assert fp_a != fp_ab


# ==============================================================================
# TEST SUITE: 17. Same occurrence + same alert type remains deduplicated
# ==============================================================================

@pytest.mark.asyncio
async def test_same_occurrence_same_alert_type_remains_deduplicated():
    """17. Identical occurrence and alert type always yields identical fingerprint and is deduplicated."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res1 = await service.persist_alert_for_caregiver(cg_id, pt_id, occ, RuleQualificationType.RULE_B)
    res2 = await service.persist_alert_for_caregiver(cg_id, pt_id, occ, RuleQualificationType.RULE_B)

    assert res1.fingerprint == res2.fingerprint
    assert res1.created is True
    assert res2.created is False
    assert len(notif_coll.docs) == 1


# ==============================================================================
# TEST SUITE: 18. RULE_A_B is not split into RULE_A + RULE_B
# ==============================================================================

@pytest.mark.asyncio
async def test_rule_a_b_is_not_split_into_two_alerts():
    """18. RULE_A_B produces exactly one alert with alertType="RULE_A_B", never two records."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res = await service.persist_alert_for_caregiver(
        cg_id, pt_id, occ, RuleQualificationType.RULE_A_B
    )

    assert res.alert_type == "RULE_A_B"
    assert len(notif_coll.docs) == 1
    doc = notif_coll.docs[0]
    assert doc["alertType"] == "RULE_A_B"
    # Ensure no separate RULE_A or RULE_B records were written
    alert_types = [d.get("alertType") for d in notif_coll.docs]
    assert alert_types == ["RULE_A_B"]


# ==============================================================================
# TEST SUITE: 19. Existing patient notification behavior remains intact
# ==============================================================================

def test_existing_patient_notification_factory_and_schema_intact():
    """19. Existing patient notification document factory and schema remain 100% backward compatible."""
    patient_id = ObjectId("6ba258000000000000000001")
    doc = create_notification_document(
        user_id=patient_id,
        notification_type="reminder",
        title="Take your medication",
        message="Time for Aspirin",
    )
    assert doc["userId"] == patient_id
    assert doc["type"] == "reminder"
    assert doc["title"] == "Take your medication"
    assert doc["status"] == "unread"
    assert "fingerprint" not in doc  # Not added for patient reminder
    assert "alertType" not in doc

    # Schema serialization works cleanly
    resp = NotificationResponse(
        id=str(doc["_id"]),
        userId=str(doc["userId"]),
        type=NotificationType.REMINDER,
        title=doc["title"],
        message=doc["message"],
        status=NotificationStatus.UNREAD,
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
    )
    assert resp.id == str(doc["_id"])
    assert resp.fingerprint is None
    assert resp.alertType is None
    assert resp.medical_disclaimer is not None  # Disclaimer mixin present


# ==============================================================================
# TEST SUITE: 20. No sensitive auth fields are persisted
# ==============================================================================

@pytest.mark.asyncio
async def test_no_sensitive_auth_fields_are_persisted():
    """20. Ensure persisted alerts contain NO passwords, hashes, JWTs, or sensitive histories."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res = await service.persist_alert_for_caregiver(
        cg_id, pt_id, occ, RuleQualificationType.RULE_A
    )
    assert res.created is True
    doc = notif_coll.docs[0]

    prohibited_keys = {
        "password", "hashedPassword", "passwordHash", "token", "jwt",
        "access_token", "refresh_token", "secret", "diagnosis", "medicalHistory"
    }

    # Top-level doc check
    for key in doc:
        assert key.lower() not in prohibited_keys, f"Found sensitive key {key} in alert doc"

    # Metadata check
    metadata = doc.get("metadata", {})
    for key in metadata:
        assert key.lower() not in prohibited_keys, f"Found sensitive key {key} in alert metadata"


# ==============================================================================
# TEST SUITE: 21. Exact 6-tuple fingerprint format verification
# ==============================================================================

def test_exact_six_tuple_fingerprint_format():
    """21. Verify exact 6-tuple colon-delimited string format."""
    p = "60d5ecb8b392d4318c8e1001"
    m = "60d5ecb8b392d4318c8e1002"
    s = "60d5ecb8b392d4318c8e1003"
    d = "2026-09-10"
    t = "08:00"
    a = "RULE_A"

    fp = build_fingerprint(p, m, s, d, t, a)
    expected = f"{p}:{m}:{s}:{d}:{t}:{a}"
    assert fp == expected
    # The 6 components are joined by ':' (with time '08:00' having its internal colon)
    prefix = f"{p}:{m}:{s}:{d}:"
    assert fp.startswith(prefix)
    suffix = f":{a}"
    assert fp.endswith(suffix)
    remainder = fp[len(prefix):-len(suffix)]
    assert remainder == t


# ==============================================================================
# TEST SUITE: 22. Effective uniqueness verification (caregiverId + fingerprint)
# ==============================================================================

@pytest.mark.asyncio
async def test_effective_uniqueness_compound():
    """22. Compound uniqueness allows same fingerprint for different caregivers but rejects for same caregiver."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg1 = ObjectId("6ba258000000000000000001")
    cg2 = ObjectId("6ba258000000000000000002")
    pt = occ.patient_id

    # cg1 inserts -> OK
    r1 = await service.persist_alert_for_caregiver(cg1, pt, occ, RuleQualificationType.RULE_A)
    assert r1.created is True

    # cg2 inserts same occurrence -> OK (different caregiver)
    r2 = await service.persist_alert_for_caregiver(cg2, pt, occ, RuleQualificationType.RULE_A)
    assert r2.created is True

    # cg1 inserts again -> rejected by compound uniqueness
    r3 = await service.persist_alert_for_caregiver(cg1, pt, occ, RuleQualificationType.RULE_A)
    assert r3.created is False

    # cg2 inserts again -> rejected by compound uniqueness
    r4 = await service.persist_alert_for_caregiver(cg2, pt, occ, RuleQualificationType.RULE_A)
    assert r4.created is False


# ==============================================================================
# TEST SUITE: 23. Mark alert as read functionality
# ==============================================================================

@pytest.mark.asyncio
async def test_mark_alert_read():
    """23. Verify mark_alert_read updates status to 'read' with updated timestamp."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    occ = make_test_occurrence()
    cg_id = ObjectId("6ba2580000000000000000c1")
    pt_id = occ.patient_id

    res = await service.persist_alert_for_caregiver(cg_id, pt_id, occ, RuleQualificationType.RULE_A)
    assert res.created is True
    notif_id = res.notification_id

    # Verify initial unread status
    assert notif_coll.docs[0]["status"] == "unread"

    # Mark as read
    updated = await service.mark_alert_read(cg_id, notif_id)
    assert updated is not None
    assert updated["status"] == "read"
    assert updated["updatedAt"] is not None

    # Unauthorized caregiver cannot mark it as read
    unauth_cg = ObjectId("6ba258000000000000000099")
    unauth_res = await service.mark_alert_read(unauth_cg, notif_id)
    assert unauth_res is None


# ==============================================================================
# TEST SUITE: 24. Query alerts for caregiver with patientId and status filter
# ==============================================================================

@pytest.mark.asyncio
async def test_get_alerts_for_caregiver_filtering():
    """24. Scoped querying of alerts by caregiver, patient, and status."""
    notif_coll = MockNotificationsCollection()
    service = CaregiverAlertService(notifications_collection=notif_coll)

    cg_id = ObjectId("6ba2580000000000000000c1")
    pt1_id = ObjectId("6ba258000000000000000001")
    pt2_id = ObjectId("6ba258000000000000000002")

    occ1 = make_test_occurrence(patient_id=str(pt1_id), sched_time="08:00")
    occ2 = make_test_occurrence(patient_id=str(pt1_id), sched_time="20:00")
    occ3 = make_test_occurrence(patient_id=str(pt2_id), sched_time="12:00")

    await service.persist_alert_for_caregiver(cg_id, pt1_id, occ1, RuleQualificationType.RULE_A)
    res2 = await service.persist_alert_for_caregiver(cg_id, pt1_id, occ2, RuleQualificationType.RULE_B)
    await service.persist_alert_for_caregiver(cg_id, pt2_id, occ3, RuleQualificationType.RULE_A_B)

    # Mark occ2 as read
    await service.mark_alert_read(cg_id, res2.notification_id)

    # Query all for caregiver
    all_alerts = await service.get_alerts_for_caregiver(cg_id)
    assert len(all_alerts) == 3

    # Filter by patient
    pt1_alerts = await service.get_alerts_for_caregiver(cg_id, patient_id=pt1_id)
    assert len(pt1_alerts) == 2

    # Filter by unread
    unread_alerts = await service.get_alerts_for_caregiver(cg_id, status="unread")
    assert len(unread_alerts) == 2

    # Filter by read
    read_alerts = await service.get_alerts_for_caregiver(cg_id, status="read")
    assert len(read_alerts) == 1
    assert read_alerts[0]["_id"] == res2.notification_id


# ==============================================================================
# TEST SUITE: 25. Real MongoDB index enforcement and deduplication integration
# ==============================================================================

@pytest.mark.asyncio
async def test_real_mongodb_unique_compound_index_and_deduplication():
    """25. Integration test verifying real MongoDB unique compound index on (caregiverId, fingerprint)."""
    from app.db.mongodb import connect_to_mongo, setup_indexes, get_notifications_collection
    await connect_to_mongo()
    await setup_indexes()

    notif_coll = get_notifications_collection()
    test_tag = f"test_real_index_{ObjectId()}"

    cg_id = ObjectId()
    pt_id = ObjectId()
    fp = f"{pt_id}:med1:sched1:2026-09-10:08:00:RULE_A"

    doc1 = create_notification_document(
        user_id=cg_id,
        notification_type=NotificationType.CAREGIVER_ALERT.value,
        title=test_tag,
        message="Integration test 1",
        caregiver_id=cg_id,
        patient_id=pt_id,
        alert_type="RULE_A",
        fingerprint=fp,
    )
    doc2 = create_notification_document(
        user_id=cg_id,
        notification_type=NotificationType.CAREGIVER_ALERT.value,
        title=test_tag,
        message="Integration test 2 duplicate",
        caregiver_id=cg_id,
        patient_id=pt_id,
        alert_type="RULE_A",
        fingerprint=fp,
    )

    try:
        # First insert succeeds
        insert_res = await notif_coll.insert_one(doc1)
        assert insert_res.inserted_id is not None

        # Second insert with identical (caregiverId, fingerprint) MUST raise DuplicateKeyError in real MongoDB
        with pytest.raises(DuplicateKeyError):
            await notif_coll.insert_one(doc2)

        # Service deduplication test against real MongoDB
        service = CaregiverAlertService(notifications_collection=notif_coll)
        occ = make_test_occurrence(patient_id=str(pt_id))
        # Occ with exact same fingerprint attributes
        occ.medicine_id = ObjectId("6ba258000000000000000010")
        occ.schedule_id = ObjectId("6ba258000000000000000100")
        occ.scheduled_date = "2026-09-10"
        occ.scheduled_time = "08:00"

        # Create alert via service
        res1 = await service.persist_alert_for_caregiver(cg_id, pt_id, occ, RuleQualificationType.RULE_B)
        assert res1.created is True

        # Repeat alert via service -> deduplicated safely
        res2 = await service.persist_alert_for_caregiver(cg_id, pt_id, occ, RuleQualificationType.RULE_B)
        assert res2.created is False
        assert res2.notification_id == res1.notification_id

    finally:
        # Clean up integration test docs
        await notif_coll.delete_many({"caregiverId": cg_id})

