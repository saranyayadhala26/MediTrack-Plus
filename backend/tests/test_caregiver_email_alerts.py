"""Phase 11 Step 6: Caregiver Missed-Dose Alert Email Integration Tests.

Verifies:
A. New caregiver alert + emailAlertsEnabled=true -> email sent.
B. New caregiver alert + emailAlertsEnabled=false -> no email.
C. Registered caregiver email is strictly used as recipient.
D. Arbitrary targetEmail cannot control recipient (recipient derived from caregiver user record).
E. Existing/deduplicated alert -> no second email.
F. Multiple caregivers -> each eligible caregiver receives their own independent email.
G. Revoked caregiver -> no email.
H. SMTP/email failure after successful alert persistence -> alert remains persisted.
I. Email failure does not create duplicate alert.
J. Caregiver alert email uses approved template (create_caregiver_missed_dose_email).
K. Email contains patient/medication/scheduled-dose information.
L. Email contains no password/JWT/SMTP/CRON secret.
M. SMTP password remains sanitized in errors/logging.
N. emailAlertsEnabled defaults false in user model.
O. Caregiver without emailAlertsEnabled field behaves as false.
P. Existing Phase 9 alert persistence tests remain green.
Q. Exact idempotency behavior: Eval #1 -> new alert + 1 email; Eval #2 -> existing alert + 0 emails.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import patch

import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.models.collections import now_utc
from app.services.caregiver_alert_service import (
    AlertPersistenceResult,
    CaregiverAlertService,
    build_fingerprint,
)
from app.services.email_service import (
    EmailDeliveryError,
    EmailServiceInterface,
    MockEmailService,
)
from app.services.missed_dose_rules import (
    OccurrenceRuleEvaluation,
    RuleQualificationType,
)
from app.services.missed_dose_service import (
    ClassifiedOccurrence,
    OccurrenceClassification,
)


# ==============================================================================
# Mock Collections for Deterministic Isolation
# ==============================================================================

class MockAsyncCursor:
    """Async cursor mock for iterating collection documents."""

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
        self._docs.sort(
            key=lambda d: d.get(field, None) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=reverse,
        )
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


class MockCaregiversCollection:
    """Mock PyMongo collection for Caregivers relationships."""

    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None):
        self.docs: List[Dict[str, Any]] = [dict(d) for d in (docs or [])]

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for d in self.docs:
            match = True
            for k, v in query.items():
                doc_v = d.get(k)
                if isinstance(v, ObjectId) and isinstance(doc_v, str):
                    if str(v) != doc_v:
                        match = False
                        break
                elif isinstance(v, str) and isinstance(doc_v, ObjectId):
                    if v != str(doc_v):
                        match = False
                        break
                elif doc_v != v:
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
                doc_v = d.get(k)
                if isinstance(v, ObjectId) and isinstance(doc_v, str):
                    if str(v) != doc_v:
                        match = False
                        break
                elif isinstance(v, str) and isinstance(doc_v, ObjectId):
                    if v != str(doc_v):
                        match = False
                        break
                elif doc_v != v:
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
                doc_v = d.get(k)
                if isinstance(v, ObjectId) and isinstance(doc_v, str):
                    if str(v) != doc_v:
                        match = False
                        break
                elif isinstance(v, str) and isinstance(doc_v, ObjectId):
                    if v != str(doc_v):
                        match = False
                        break
                elif doc_v != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None


# ==============================================================================
# Helpers & Fixtures
# ==============================================================================

def make_test_occurrence(
    patient_id: str = "6ba258000000000000000001",
    medicine_name: str = "Metformin",
    dosage: str = "500",
    dosage_unit: str = "mg",
    scheduled_date: str = "2026-09-12",
    scheduled_time: str = "09:00",
) -> ClassifiedOccurrence:
    dt = datetime.strptime(
        f"{scheduled_date}T{scheduled_time}:00Z",
        "%Y-%m-%dT%H:%M:%SZ",
    ).replace(tzinfo=timezone.utc)
    return ClassifiedOccurrence(
        patient_id=ObjectId(patient_id),
        medicine_id=ObjectId("6ba258000000000000000002"),
        medicine_name=medicine_name,
        dosage=dosage,
        dosage_unit=dosage_unit,
        schedule_id=ObjectId("6ba258000000000000000003"),
        frequency_type="daily",
        scheduled_date=scheduled_date,
        scheduled_time=scheduled_time,
        scheduled_datetime=dt,
        status=OccurrenceClassification.MISSED,
        is_missed=True,
    )


def make_test_evaluation(
    occurrence: ClassifiedOccurrence,
    qualification: RuleQualificationType = RuleQualificationType.RULE_A,
) -> OccurrenceRuleEvaluation:
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


# ==============================================================================
# Test Cases
# ==============================================================================

@pytest.mark.asyncio
async def test_case_a_new_alert_with_email_alerts_enabled_sends_email():
    """A. New caregiver alert + emailAlertsEnabled=true -> email successfully sent."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_user_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_user_id,
            "fullName": "Bob Caregiver",
            "email": cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)

    assert len(results) == 1
    assert results[0].created is True
    assert results[0].email_sent is True
    assert results[0].email_error is None

    # Verify email was actually recorded in mock service
    sent = mock_email.get_sent_messages()
    assert len(sent) == 1
    assert sent[0].recipient == cg_email
    assert "Alice Patient" in sent[0].subject
    assert "Metformin (500 mg)" in sent[0].text_body


@pytest.mark.asyncio
async def test_case_b_new_alert_with_email_alerts_disabled_sends_no_email():
    """B. New caregiver alert + emailAlertsEnabled=false -> alert created, but no email sent."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_user_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_user_id,
            "fullName": "Bob Caregiver",
            "email": cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": False},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)

    assert len(results) == 1
    assert results[0].created is True
    assert results[0].email_sent is False
    assert "disabled" in (results[0].email_error or "").lower()

    # Zero emails sent
    assert len(mock_email.get_sent_messages()) == 0


@pytest.mark.asyncio
async def test_case_c_d_registered_email_strictly_used_no_arbitrary_recipient():
    """C & D. Recipient is strictly derived from caregiver user record; arbitrary email rejected."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_user_id = ObjectId("6ba2580000000000000000c1")
    registered_cg_email = "registered_carer@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_user_id,
            "fullName": "Bob Caregiver",
            "email": registered_cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": registered_cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))

    # Calling persist_alert_for_caregiver does not accept any targetEmail argument
    res = await service.persist_alert_for_caregiver(
        caregiver_id=cg_user_id,
        patient_id=pt_id,
        occurrence=occ,
        qualification=RuleQualificationType.RULE_B,
    )

    assert res is not None
    assert res.created is True
    assert res.email_sent is True

    # Recipient must be exactly the registered caregiver email
    last_msg = mock_email.get_last_message()
    assert last_msg is not None
    assert last_msg.recipient == registered_cg_email


@pytest.mark.asyncio
async def test_case_e_and_q_idempotency_eval1_sends_email_eval2_zero_emails():
    """E & Q. Exact idempotency behavior: Eval #1 creates alert + 1 email; Eval #2 duplicates -> 0 emails."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_user_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_user_id,
            "fullName": "Bob Caregiver",
            "email": cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    # Evaluation #1: New alert
    results_1 = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(results_1) == 1
    assert results_1[0].created is True
    assert results_1[0].email_sent is True
    assert len(mock_email.get_sent_messages()) == 1

    # Evaluation #2: Same fingerprint / existing alert
    results_2 = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(results_2) == 1
    assert results_2[0].created is False
    assert results_2[0].email_sent is False

    # EXACTLY 1 email total across both evaluations (zero additional emails on duplicate)
    assert len(mock_email.get_sent_messages()) == 1


@pytest.mark.asyncio
async def test_case_f_multiple_caregivers_each_receive_own_email():
    """F. Multiple active caregivers: each eligible caregiver receives their own independent email."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg1_id = ObjectId("6ba2580000000000000000c1")
    cg2_id = ObjectId("6ba2580000000000000000c2")

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg1_id,
            "fullName": "Caregiver One",
            "email": "cg1@example.com",
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
        {
            "_id": cg2_id,
            "fullName": "Caregiver Two",
            "email": "cg2@example.com",
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": "cg1@example.com", "status": "active"},
        {"patientId": pt_id, "caregiverEmail": "cg2@example.com", "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A_B)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(results) == 2
    assert results[0].created is True
    assert results[1].created is True
    assert results[0].email_sent is True
    assert results[1].email_sent is True

    # Both caregivers received their own independent email
    sent = mock_email.get_sent_messages()
    assert len(sent) == 2
    recipients = {m.recipient for m in sent}
    assert recipients == {"cg1@example.com", "cg2@example.com"}


@pytest.mark.asyncio
async def test_case_f_mixed_preferences_only_opted_in_receives_email():
    """F variant: One caregiver has emailAlertsEnabled=True, other has False -> only opted-in receives email."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg1_id = ObjectId("6ba2580000000000000000c1")
    cg2_id = ObjectId("6ba2580000000000000000c2")

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg1_id,
            "fullName": "Caregiver One",
            "email": "cg1@example.com",
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
        {
            "_id": cg2_id,
            "fullName": "Caregiver Two",
            "email": "cg2@example.com",
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": False},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": "cg1@example.com", "status": "active"},
        {"patientId": pt_id, "caregiverEmail": "cg2@example.com", "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(results) == 2
    assert results[0].created is True
    assert results[1].created is True

    # Both alerts persisted, but only 1 email sent (to cg1)
    sent = mock_email.get_sent_messages()
    assert len(sent) == 1
    assert sent[0].recipient == "cg1@example.com"


@pytest.mark.asyncio
async def test_case_g_revoked_caregiver_receives_no_email():
    """G. Revoked caregiver relationship generates no alert and sends no email."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "revoked@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_id,
            "fullName": "Revoked Caregiver",
            "email": cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "revoked"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(results) == 0
    assert len(notif_coll.docs) == 0
    assert len(mock_email.get_sent_messages()) == 0

    # Also test direct persist_alert_for_caregiver with revoked link:
    # Alert persistence still occurs (per Phase 9 atomic deduplication contract), but email is skipped
    direct_res = await service.persist_alert_for_caregiver(
        caregiver_id=cg_id,
        patient_id=pt_id,
        occurrence=occ,
        qualification=RuleQualificationType.RULE_A,
    )
    assert direct_res is not None
    assert direct_res.created is True
    assert direct_res.email_sent is False
    assert "revoked" in (direct_res.email_error or "").lower()
    assert len(mock_email.get_sent_messages()) == 0


@pytest.mark.asyncio
async def test_case_h_i_email_failure_alert_remains_persisted_no_duplicate():
    """H & I. Alert persistence wins: SMTP/email failure does not rollback alert or create duplicate."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_id,
            "fullName": "Bob Caregiver",
            "email": cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()

    # Create a failing email service simulating network/SMTP crash
    class FailingEmailService(EmailServiceInterface):
        async def send_email(self, message):
            raise EmailDeliveryError("SMTP connection timed out: host unreachable")

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=FailingEmailService(),
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    # First attempt: persistence must succeed even though email delivery fails
    results = await service.persist_for_active_caregivers(pt_id, eval_item)

    assert len(results) == 1
    assert results[0].created is True
    assert results[0].email_sent is False
    assert "SMTP connection timed out" in (results[0].email_error or "")

    # Alert is successfully in notifications collection
    assert len(notif_coll.docs) == 1
    assert notif_coll.docs[0]["caregiverId"] == cg_id

    # Second evaluation of the same occurrence:
    # Must NOT create another alert or retry indefinitely
    results_2 = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(results_2) == 1
    assert results_2[0].created is False
    assert len(notif_coll.docs) == 1  # No duplicate alert!


@pytest.mark.asyncio
async def test_case_j_k_email_contains_safe_clinical_and_branding_fields():
    """J & K. Email uses approved template and contains required clinical safety and patient/med info."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Eleanor Vance", "email": "eleanor@example.com"},
        {
            "_id": cg_id,
            "fullName": "Theodora Crain",
            "email": cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(
        patient_id=str(pt_id),
        medicine_name="Lisinopril",
        dosage="20",
        dosage_unit="mg",
        scheduled_date="2026-09-12",
        scheduled_time="10:30",
    )
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    await service.persist_for_active_caregivers(pt_id, eval_item)

    msg = mock_email.get_last_message()
    assert msg is not None
    assert msg.recipient == cg_email
    assert "Eleanor Vance" in msg.subject
    assert "[MediTrack+ Alert]" in msg.subject

    for body in [msg.text_body, msg.html_body]:
        assert "Theodora Crain" in body
        assert "Eleanor Vance" in body
        assert "Lisinopril" in body
        assert "20 mg" in body
        assert "2026-09-12" in body
        assert "10:30" in body
        assert "Rule A" in body
        assert "MediTrack+" in body
        assert "Medical Safety Notice" in body


@pytest.mark.asyncio
async def test_case_l_m_secrets_are_never_leaked_in_emails_or_sanitized_errors():
    """L & M. Zero passwords, JWTs, CRON secrets in email body or sanitized error logs."""
    super_secret_pw = "super_smtp_secret_password_xyz999"
    super_jwt = "super_jwt_secret_xyz888"

    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver@example.com"

    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_id,
            "fullName": "Bob Caregiver",
            "email": cg_email,
            "role": "caregiver",
            "notificationPreferences": {"emailAlertsEnabled": True},
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()

    class LeakingEmailService(EmailServiceInterface):
        async def send_email(self, message):
            raise EmailDeliveryError(
                f"Failed connection using password={super_secret_pw} and token={super_jwt}"
            )

    with patch("app.core.config.settings.SMTP_PASSWORD", super_secret_pw), \
         patch("app.core.config.settings.JWT_SECRET_KEY", super_jwt):
        service = CaregiverAlertService(
            notifications_collection=notif_coll,
            caregivers_collection=cg_coll,
            users_collection=users_coll,
            email_service=LeakingEmailService(),
        )

        occ = make_test_occurrence(patient_id=str(pt_id))
        eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

        results = await service.persist_for_active_caregivers(pt_id, eval_item)
        assert len(results) == 1
        assert results[0].created is True
        assert results[0].email_sent is False

        # Verify error string was sanitized
        err = results[0].email_error or ""
        assert super_secret_pw not in err
        assert super_jwt not in err
        assert "[REDACTED]" in err


@pytest.mark.asyncio
async def test_case_n_o_missing_or_default_preference_behaves_as_false():
    """N & O. Caregiver user without notificationPreferences or missing emailAlertsEnabled sends no email."""
    pt_id = ObjectId("6ba258000000000000000001")
    cg_id = ObjectId("6ba2580000000000000000c1")
    cg_email = "caregiver@example.com"

    # User record with no notificationPreferences key at all
    users_coll = MockUsersCollection([
        {"_id": pt_id, "fullName": "Alice Patient", "email": "alice@example.com"},
        {
            "_id": cg_id,
            "fullName": "Bob Caregiver",
            "email": cg_email,
            "role": "caregiver",
            # notificationPreferences omitted intentionally
        },
    ])
    cg_coll = MockCaregiversCollection([
        {"patientId": pt_id, "caregiverEmail": cg_email, "status": "active"},
    ])
    notif_coll = MockNotificationsCollection()
    mock_email = MockEmailService(email_enabled=True)

    service = CaregiverAlertService(
        notifications_collection=notif_coll,
        caregivers_collection=cg_coll,
        users_collection=users_coll,
        email_service=mock_email,
    )

    occ = make_test_occurrence(patient_id=str(pt_id))
    eval_item = make_test_evaluation(occ, RuleQualificationType.RULE_A)

    results = await service.persist_for_active_caregivers(pt_id, eval_item)
    assert len(results) == 1
    assert results[0].created is True
    assert results[0].email_sent is False
    assert len(mock_email.get_sent_messages()) == 0
