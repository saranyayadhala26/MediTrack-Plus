"""Caregiver Alert Persistence Service (Phase 9.2.4).

Converts verified missed-dose rule qualifications (RULE_A, RULE_B, RULE_A_B)
into persistent, deduplicated caregiver alert/notification records:

- Caregiver Targeting:
  * Only active caregiver relationships (status="active") are eligible.
  * Revoked, inactive, or unlinked caregivers receive no alert records.
  * Multiple active caregivers receive independent alert records.
  * No active caregivers => zero records created.

- Deterministic 6-Tuple Fingerprinting:
  patientId:medicineId:scheduleId:scheduledDate:scheduledTime:alertType

- Concurrency-Safe Atomic Deduplication:
  * Compound unique index on (caregiverId, fingerprint).
  * Catches pymongo.errors.DuplicateKeyError deterministically.
  * Caregiver A and Caregiver B each receive their own alert record.
  * Same caregiver + same fingerprint is deduplicated.

- Alert Rules:
  * NONE never creates an alert.
  * RULE_A_B persists exactly ONE alert (never split into RULE_A + RULE_B).

- Read/Unread State & Minimal Privacy:
  * Created with status="unread", supports mark_alert_read.
  * Zero sensitive fields stored (no passwords, JWTs, full histories).
  * Uses PyMongo Async / AsyncMongoClient (no Motor dependency).
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from bson import ObjectId
import pymongo
from pymongo.errors import DuplicateKeyError

from app.models.collections import (
    create_notification_document,
    now_utc,
)
from app.schemas.notification import NotificationType
from app.services.missed_dose_rules import (
    OccurrenceRuleEvaluation,
    PatientRuleEvaluationSummary,
    RuleQualificationType,
)
from app.services.missed_dose_service import ClassifiedOccurrence
from app.utils.mongo import to_object_id

logger = logging.getLogger("meditrack.caregiver_alerts")


def build_fingerprint(
    patient_id: Union[str, ObjectId],
    medicine_id: Union[str, ObjectId],
    schedule_id: Union[str, ObjectId],
    scheduled_date: str,
    scheduled_time: str,
    alert_type: Union[str, RuleQualificationType],
) -> str:
    """
    Build canonical 6-tuple fingerprint string:
    patientId:medicineId:scheduleId:scheduledDate:scheduledTime:alertType

    Caregiver identity is deliberately NOT part of the fingerprint itself,
    as deduplication scope is evaluated per caregiver: (caregiverId, fingerprint).
    """
    p_id = str(patient_id).strip()
    m_id = str(medicine_id).strip()
    s_id = str(schedule_id).strip()
    s_date = str(scheduled_date).strip()
    s_time = str(scheduled_time).strip()
    a_type = alert_type.value if hasattr(alert_type, "value") else str(alert_type).strip()
    return f"{p_id}:{m_id}:{s_id}:{s_date}:{s_time}:{a_type}"


@dataclass
class AlertPersistenceResult:
    """Result of attempting to persist a caregiver alert."""
    caregiver_id: ObjectId
    patient_id: ObjectId
    fingerprint: str
    alert_type: str
    created: bool
    notification_id: Optional[ObjectId] = None
    notification_doc: Optional[Dict[str, Any]] = None
    email_sent: bool = False
    email_error: Optional[str] = None


class CaregiverAlertService:
    """
    Reusable backend service managing caregiver alert persistence,
    active caregiver targeting, deterministic fingerprinting, and
    atomic deduplication.
    """

    def __init__(
        self,
        db: Optional[Any] = None,
        notifications_collection: Optional[Any] = None,
        caregivers_collection: Optional[Any] = None,
        users_collection: Optional[Any] = None,
        email_service: Optional[Any] = None,
    ):
        self._db = db
        self._notifications_coll = notifications_collection
        self._caregivers_coll = caregivers_collection
        self._users_coll = users_collection
        self._email_service = email_service

    def _get_notifications_coll(self) -> Any:
        if self._notifications_coll is not None:
            return self._notifications_coll
        try:
            from app.db.mongodb import get_notifications_collection
            return get_notifications_collection()
        except Exception:
            return None

    def _get_caregivers_coll(self) -> Any:
        if self._caregivers_coll is not None:
            return self._caregivers_coll
        try:
            from app.db.mongodb import get_caregivers_collection
            return get_caregivers_collection()
        except Exception:
            return None

    def _get_users_coll(self) -> Any:
        if self._users_coll is not None:
            return self._users_coll
        try:
            from app.db.mongodb import get_users_collection
            return get_users_collection()
        except Exception:
            return None

    def _get_email_service(self) -> Any:
        if self._email_service is not None:
            return self._email_service
        from app.services.email_service import get_email_service
        return get_email_service()

    @staticmethod
    def _sanitize_error(error_msg: str) -> str:
        """Strip sensitive credentials from error strings before logging."""
        if not error_msg:
            return ""
        sanitized = str(error_msg)
        try:
            from app.core.config import settings
            for secret in [
                getattr(settings, "SMTP_PASSWORD", None),
                getattr(settings, "CRON_SECRET_KEY", None),
                getattr(settings, "JWT_SECRET_KEY", None),
            ]:
                if secret and isinstance(secret, str) and len(secret) > 3:
                    sanitized = sanitized.replace(secret, "[REDACTED]")
        except Exception:
            pass
        return sanitized

    async def _find_caregiver_link(
        self,
        patient_id: ObjectId,
        caregiver_email: str,
        caregiver_id: Optional[ObjectId] = None,
    ) -> Optional[Dict[str, Any]]:
        """Look up caregiver link document for patient and caregiver."""
        caregivers_coll = self._get_caregivers_coll()
        if caregivers_coll is None:
            return None

        email_clean = caregiver_email.strip().lower()
        # 1. Match by patientId (ObjectId) and caregiverEmail
        link = await caregivers_coll.find_one({
            "patientId": patient_id,
            "caregiverEmail": email_clean,
        })
        if link is not None:
            return link

        # 2. Match with string patientId
        link = await caregivers_coll.find_one({
            "patientId": str(patient_id),
            "caregiverEmail": email_clean,
        })
        if link is not None:
            return link

        # 3. Match by caregiver _id if provided
        if caregiver_id is not None:
            link = await caregivers_coll.find_one({
                "patientId": patient_id,
                "_id": caregiver_id,
            })
            if link is not None:
                return link
            link = await caregivers_coll.find_one({
                "patientId": str(patient_id),
                "_id": caregiver_id,
            })
            if link is not None:
                return link

        return None

    async def _send_caregiver_alert_email(
        self,
        caregiver_id: ObjectId,
        patient_id: ObjectId,
        occurrence: ClassifiedOccurrence,
        alert_type: str,
        message: Optional[str] = None,
    ) -> tuple[bool, Optional[str]]:
        """
        Send a missed-dose email notification to the caregiver's registered account email
        if and only if emailAlertsEnabled is True and relationship is active.

        Guarantees:
        - Recipient is strictly derived from the caregiver's registered user record.
        - Non-active / revoked relationships receive no email.
        - Deduplicated or pre-existing alerts trigger no email.
        - Failures are non-fatal to alert persistence.
        - Credentials/secrets are sanitized from errors/logs.
        """
        try:
            users_coll = self._get_users_coll()
            if users_coll is None:
                logger.debug("Users collection unavailable; skipping email alert.")
                return False, "Users collection unavailable"

            # 1. Determine caregiver registered user record
            caregiver_user = await users_coll.find_one({"_id": caregiver_id})
            if caregiver_user is None:
                caregiver_user = await users_coll.find_one({"_id": str(caregiver_id)})

            caregivers_coll = self._get_caregivers_coll()
            if caregiver_user is None and caregivers_coll is not None:
                link_by_id = await caregivers_coll.find_one({"_id": caregiver_id})
                if not link_by_id:
                    link_by_id = await caregivers_coll.find_one({"_id": str(caregiver_id)})
                if link_by_id and link_by_id.get("caregiverEmail"):
                    caregiver_user = await users_coll.find_one({
                        "email": link_by_id["caregiverEmail"].strip().lower()
                    })

            if not caregiver_user:
                logger.info("Caregiver user not found for ID %s; skipping email alert.", caregiver_id)
                return False, "Caregiver user not found"

            registered_email = caregiver_user.get("email", "").strip().lower()
            if not registered_email:
                logger.info("Caregiver user %s has no registered email; skipping email alert.", caregiver_id)
                return False, "Caregiver has no registered email"

            # 2. Check active caregiver relationship in caregivers collection
            if caregivers_coll is not None:
                link = await self._find_caregiver_link(
                    patient_id=patient_id,
                    caregiver_email=registered_email,
                    caregiver_id=caregiver_id,
                )
                if not link:
                    logger.info(
                        "No caregiver relationship between patient %s and caregiver %s; skipping email.",
                        patient_id,
                        registered_email,
                    )
                    return False, "No caregiver relationship found"

                link_status = link.get("status")
                if link_status != "active":
                    logger.info(
                        "Caregiver relationship status is '%s' (not active) for %s; skipping email.",
                        link_status,
                        registered_email,
                    )
                    return False, f"Caregiver relationship is {link_status}"

            # 3. Check notification preferences (default is False)
            prefs = caregiver_user.get("notificationPreferences")
            if not isinstance(prefs, dict):
                prefs = {}
            email_alerts_enabled = bool(prefs.get("emailAlertsEnabled", False))
            if not email_alerts_enabled:
                logger.info(
                    "Caregiver %s has emailAlertsEnabled=False; skipping email alert.",
                    registered_email,
                )
                return False, "Email alerts disabled by user preference"

            # 4. Resolve patient name from users collection
            patient_name = "Patient"
            patient_user = await users_coll.find_one({"_id": patient_id})
            if patient_user is None:
                patient_user = await users_coll.find_one({"_id": str(patient_id)})
            if patient_user and patient_user.get("fullName"):
                patient_name = patient_user["fullName"].strip()

            caregiver_name = caregiver_user.get("fullName", "").strip() or "Caregiver"

            # 5. Format alert reason
            qual_str = alert_type.value if hasattr(alert_type, "value") else str(alert_type).strip()
            if qual_str == RuleQualificationType.RULE_A.value or qual_str == "RULE_A":
                alert_rule = "Rule A: Multiple missed doses within 24 hours"
            elif qual_str == RuleQualificationType.RULE_B.value or qual_str == "RULE_B":
                alert_rule = "Rule B: Two consecutive missed doses"
            elif qual_str == RuleQualificationType.RULE_A_B.value or qual_str == "RULE_A_B":
                alert_rule = "Rule A+B: Multiple and consecutive missed doses"
            else:
                alert_rule = f"Missed dose alert ({qual_str})"

            adherence_context = message.strip() if message else None

            # 6. Construct email using approved template
            from app.services.email_templates import create_caregiver_missed_dose_email

            email_msg = create_caregiver_missed_dose_email(
                caregiver_email=registered_email,
                caregiver_name=caregiver_name,
                patient_name=patient_name,
                medicine_name=occurrence.medicine_name,
                dosage=occurrence.dosage,
                dosage_unit=occurrence.dosage_unit,
                scheduled_date=occurrence.scheduled_date,
                scheduled_time=occurrence.scheduled_time,
                alert_rule=alert_rule,
                adherence_context=adherence_context,
            )

            # 7. Dispatch via EmailService
            email_svc = self._get_email_service()
            res = await email_svc.send_email(email_msg)
            if res.success and not res.skipped:
                logger.info("Caregiver missed-dose alert email sent to %s for patient %s", registered_email, patient_id)
                return True, None
            elif res.skipped:
                logger.info("Caregiver alert email skipped (email service disabled) for %s", registered_email)
                return False, "Email service disabled"
            else:
                logger.warning("Caregiver alert email delivery failed for %s: %s", registered_email, res.error_message)
                return False, res.error_message

        except Exception as exc:
            sanitized = self._sanitize_error(str(exc))
            logger.warning(
                "Caregiver alert email notification encountered error for caregiver %s: %s",
                caregiver_id,
                sanitized,
            )
            return False, sanitized

    @staticmethod
    def format_alert_content(
        occurrence: ClassifiedOccurrence,
        alert_type: str,
        custom_title: Optional[str] = None,
        custom_message: Optional[str] = None,
    ) -> tuple[str, str]:
        """Generate default or custom alert title and message."""
        if custom_title and custom_message:
            return custom_title.strip(), custom_message.strip()

        title = custom_title.strip() if custom_title else "Medication adherence alert"

        if custom_message:
            message = custom_message.strip()
        elif alert_type == RuleQualificationType.RULE_A.value:
            message = (
                f"Adherence alert: Multiple missed doses were detected across "
                f"schedules for your linked patient within a 24-hour window."
            )
        elif alert_type == RuleQualificationType.RULE_B.value:
            message = (
                f"Adherence alert: Two consecutive doses of {occurrence.medicine_name} "
                f"were missed."
            )
        elif alert_type == RuleQualificationType.RULE_A_B.value:
            message = (
                f"Adherence alert: Multiple missed doses and consecutive missed doses of "
                f"{occurrence.medicine_name} were detected."
            )
        else:
            message = (
                f"A medication adherence alert was detected for your linked patient."
            )

        return title, message

    async def persist_alert_for_caregiver(
        self,
        caregiver_id: Union[str, ObjectId],
        patient_id: Union[str, ObjectId],
        occurrence: ClassifiedOccurrence,
        qualification: Union[str, RuleQualificationType],
        title: Optional[str] = None,
        message: Optional[str] = None,
    ) -> Optional[AlertPersistenceResult]:
        """
        Persist a single alert record for a specific caregiver with atomic deduplication.

        Rules:
        - If qualification is NONE -> return None (no record created).
        - Generates 6-tuple fingerprint.
        - Checks for existing record for (caregiverId, fingerprint).
        - Inserts if absent; handles DuplicateKeyError for concurrency safety.
        """
        qual_str = qualification.value if hasattr(qualification, "value") else str(qualification).strip()
        if qual_str == RuleQualificationType.NONE.value or qual_str == "NONE":
            logger.debug("Qualification is NONE; skipping alert persistence.")
            return None

        cg_oid = to_object_id(caregiver_id)
        pt_oid = to_object_id(patient_id)
        med_oid = to_object_id(occurrence.medicine_id)
        sched_oid = to_object_id(occurrence.schedule_id)

        fingerprint = build_fingerprint(
            patient_id=pt_oid,
            medicine_id=med_oid,
            schedule_id=sched_oid,
            scheduled_date=occurrence.scheduled_date,
            scheduled_time=occurrence.scheduled_time,
            alert_type=qual_str,
        )

        notif_coll = self._get_notifications_coll()

        # Check existing record
        existing = await notif_coll.find_one({
            "caregiverId": cg_oid,
            "fingerprint": fingerprint,
        })
        if existing is not None:
            logger.info(
                "Alert already exists for caregiver %s with fingerprint %s; deduplicated.",
                cg_oid,
                fingerprint,
            )
            return AlertPersistenceResult(
                caregiver_id=cg_oid,
                patient_id=pt_oid,
                fingerprint=fingerprint,
                alert_type=qual_str,
                created=False,
                notification_id=existing.get("_id"),
                notification_doc=existing,
            )

        alert_title, alert_message = self.format_alert_content(
            occurrence=occurrence,
            alert_type=qual_str,
            custom_title=title,
            custom_message=message,
        )

        metadata: Dict[str, Any] = {
            "patientId": str(pt_oid),
            "medicineId": str(med_oid),
            "medicineName": occurrence.medicine_name,
            "scheduleId": str(sched_oid),
            "scheduledDate": occurrence.scheduled_date,
            "scheduledTime": occurrence.scheduled_time,
            "alertType": qual_str,
        }

        doc = create_notification_document(
            user_id=cg_oid,
            notification_type=NotificationType.CAREGIVER_ALERT.value,
            title=alert_title,
            message=alert_message,
            caregiver_id=cg_oid,
            medicine_id=med_oid,
            schedule_id=sched_oid,
            scheduled_time=occurrence.scheduled_datetime,
            status="unread",
            patient_id=pt_oid,
            alert_type=qual_str,
            fingerprint=fingerprint,
            metadata=metadata,
        )

        try:
            insert_res = await notif_coll.insert_one(doc)
            doc["_id"] = insert_res.inserted_id
            logger.info(
                "Created caregiver alert %s for caregiver %s (fingerprint: %s)",
                doc["_id"],
                cg_oid,
                fingerprint,
            )
            # Phase 11 Step 6: Trigger email notification side effect for newly created alert
            email_sent = False
            email_error = None
            try:
                email_sent, email_error = await self._send_caregiver_alert_email(
                    caregiver_id=cg_oid,
                    patient_id=pt_oid,
                    occurrence=occurrence,
                    alert_type=qual_str,
                    message=alert_message,
                )
            except Exception as email_exc:
                email_error = self._sanitize_error(str(email_exc))
                logger.warning(
                    "Caregiver alert email notification failed for caregiver %s: %s",
                    cg_oid,
                    email_error,
                )

            return AlertPersistenceResult(
                caregiver_id=cg_oid,
                patient_id=pt_oid,
                fingerprint=fingerprint,
                alert_type=qual_str,
                created=True,
                notification_id=doc["_id"],
                notification_doc=doc,
                email_sent=email_sent,
                email_error=email_error,
            )
        except DuplicateKeyError:
            logger.info(
                "Concurrent duplicate key encountered for caregiver %s (fingerprint: %s); returning existing.",
                cg_oid,
                fingerprint,
            )
            existing = await notif_coll.find_one({
                "caregiverId": cg_oid,
                "fingerprint": fingerprint,
            })
            return AlertPersistenceResult(
                caregiver_id=cg_oid,
                patient_id=pt_oid,
                fingerprint=fingerprint,
                alert_type=qual_str,
                created=False,
                notification_id=existing.get("_id") if existing else None,
                notification_doc=existing,
            )

    async def get_active_caregiver_user_ids(
        self,
        patient_id: Union[str, ObjectId],
    ) -> List[ObjectId]:
        """
        Query caregivers collection for active links to this patient,
        and resolve each to their caregiver user ID.

        Rules:
        - Only status="active" relationships participate.
        - Status="revoked" or other statuses are strictly excluded.
        - Resolves user doc from users collection via caregiverEmail.
        - Fallbacks to caregiver relationship doc _id if users collection not seeded.
        """
        pt_oid = to_object_id(patient_id)
        caregivers_coll = self._get_caregivers_coll()
        users_coll = self._get_users_coll()

        cursor = caregivers_coll.find({"patientId": pt_oid, "status": "active"})
        active_caregiver_ids: List[ObjectId] = []

        async for link in cursor:
            email = link.get("caregiverEmail")
            user_doc = None
            if email and users_coll is not None:
                user_doc = await users_coll.find_one({"email": email.strip().lower()})

            if user_doc and "_id" in user_doc:
                active_caregiver_ids.append(to_object_id(user_doc["_id"]))
            elif "_id" in link:
                active_caregiver_ids.append(to_object_id(link["_id"]))

        return active_caregiver_ids

    async def persist_for_active_caregivers(
        self,
        patient_id: Union[str, ObjectId],
        evaluations: Union[
            OccurrenceRuleEvaluation,
            List[OccurrenceRuleEvaluation],
            PatientRuleEvaluationSummary,
        ],
        title: Optional[str] = None,
        message: Optional[str] = None,
    ) -> List[AlertPersistenceResult]:
        """
        Persist alert records for all active caregivers linked to the patient.

        Rules:
        - Resolves active caregivers; if none -> returns [] (no alerts created).
        - For each qualifying evaluation:
          * If NONE -> skipped.
          * If RULE_A_B -> exactly ONE alert created with alertType="RULE_A_B".
          * Each active caregiver receives an independent alert record.
          * Atomically deduplicated.
        """
        pt_oid = to_object_id(patient_id)

        # Normalize evaluations to list of OccurrenceRuleEvaluation
        if isinstance(evaluations, PatientRuleEvaluationSummary):
            eval_list = evaluations.qualifying_evaluations
        elif isinstance(evaluations, OccurrenceRuleEvaluation):
            eval_list = [evaluations]
        elif isinstance(evaluations, list):
            eval_list = evaluations
        else:
            eval_list = []

        qualifying = [e for e in eval_list if e.is_qualifying]
        if not qualifying:
            logger.debug("No qualifying evaluations for patient %s; no alerts persisted.", pt_oid)
            return []

        active_caregiver_ids = await self.get_active_caregiver_user_ids(pt_oid)
        if not active_caregiver_ids:
            logger.info("No active caregivers found for patient %s; no alerts persisted.", pt_oid)
            return []

        results: List[AlertPersistenceResult] = []
        for eval_item in qualifying:
            for cg_id in active_caregiver_ids:
                res = await self.persist_alert_for_caregiver(
                    caregiver_id=cg_id,
                    patient_id=pt_oid,
                    occurrence=eval_item.occurrence,
                    qualification=eval_item.qualification,
                    title=title,
                    message=message,
                )
                if res is not None:
                    results.append(res)

        return results

    async def persist_rule_qualification(
        self,
        patient_id: Union[str, ObjectId],
        evaluation: OccurrenceRuleEvaluation,
        title: Optional[str] = None,
        message: Optional[str] = None,
    ) -> List[AlertPersistenceResult]:
        """Convenience alias to persist a single OccurrenceRuleEvaluation for active caregivers."""
        return await self.persist_for_active_caregivers(
            patient_id=patient_id,
            evaluations=evaluation,
            title=title,
            message=message,
        )

    async def get_alerts_for_caregiver(
        self,
        caregiver_id: Union[str, ObjectId],
        patient_id: Optional[Union[str, ObjectId]] = None,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve persisted alert records scoped to a specific caregiver.
        Chronologically sorted by createdAt descending.
        """
        cg_oid = to_object_id(caregiver_id)
        query: Dict[str, Any] = {
            "caregiverId": cg_oid,
            "type": NotificationType.CAREGIVER_ALERT.value,
        }
        if patient_id is not None:
            query["patientId"] = to_object_id(patient_id)
        if status is not None:
            query["status"] = status.strip()

        notif_coll = self._get_notifications_coll()
        cursor = notif_coll.find(query).sort("createdAt", pymongo.DESCENDING).limit(limit)

        alerts: List[Dict[str, Any]] = []
        async for doc in cursor:
            alerts.append(doc)
        return alerts

    async def mark_alert_read(
        self,
        caregiver_id: Union[str, ObjectId],
        notification_id: Union[str, ObjectId],
    ) -> Optional[Dict[str, Any]]:
        """
        Mark a caregiver alert as read, verifying caregiver ownership.
        """
        cg_oid = to_object_id(caregiver_id)
        notif_oid = to_object_id(notification_id)
        notif_coll = self._get_notifications_coll()

        return await notif_coll.find_one_and_update(
            {"_id": notif_oid, "caregiverId": cg_oid},
            {"$set": {"status": "read", "updatedAt": now_utc()}},
            return_document=pymongo.ReturnDocument.AFTER,
        )
