"""Scheduled Adherence Report Delivery Service (Phase 11 Step 7).

Manages automated weekly and monthly adherence report deliveries:
- Determines eligible recipients (patients and active linked caregivers with emailReportsEnabled=True)
- Calculates deterministic completed reporting periods (previous completed week or calendar month)
- Generates reports (ReportService) and attached PDFs (PdfService)
- Dispatches emails through EmailServiceInterface using approved templates
- Enforces DB-level atomic claiming and idempotency via unique index on deliveryKey
- Implements explicit delivery states ('pending', 'sent', 'failed') with safe retry semantics
- Sanitizes all credentials and secret material from error logs and database records
- Decoupled from HTTP routers and FastAPI (pure domain execution layer)
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

from bson import ObjectId
import pymongo
from pymongo.errors import DuplicateKeyError

from app.models.collections import (
    create_scheduled_report_delivery_document,
    now_utc,
)
from app.schemas.report import MedicationReportResponse, ReportPeriod
from app.services.email_service import EmailServiceInterface, get_email_service
from app.services.email_templates import create_adherence_report_email
from app.services.pdf_service import PdfService, pdf_service as default_pdf_service
from app.services.report_service import (
    ReportService,
    ReportValidationError,
    validate_report_period,
)
from app.utils.mongo import to_object_id

logger = logging.getLogger("meditrack.scheduled_reports")


# ============================================================================
# Deterministic Period Calculation
# ============================================================================

def get_completed_weekly_period(reference_date: Optional[date] = None) -> Tuple[date, date]:
    """Calculate the most recently completed full week (Monday through Sunday) strictly prior to reference_date.

    Guarantees:
    - Spans exactly 7 consecutive days (Monday through Sunday).
    - The current week (in progress) is never delivered.
    """
    ref = reference_date or datetime.now(timezone.utc).date()
    # Python weekday(): Monday is 0, Sunday is 6.
    # If today is Monday (0): last Sunday was 1 day ago.
    # If today is Sunday (6): today is Sunday (incomplete week), so last completed Sunday was 7 days ago.
    days_since_completed_sunday = ref.weekday() + 1
    end_date = ref - timedelta(days=days_since_completed_sunday)
    start_date = end_date - timedelta(days=6)
    return start_date, end_date


def get_completed_monthly_period(reference_date: Optional[date] = None) -> Tuple[date, date]:
    """Calculate the most recently completed calendar month strictly prior to reference_date.

    Guarantees:
    - Spans from day 1 to the last day of the prior month (28 to 31 days).
    - The current month (in progress) is never delivered.
    """
    ref = reference_date or datetime.now(timezone.utc).date()
    # First day of the current month
    first_of_current = ref.replace(day=1)
    # Last day of the previous month
    end_date = first_of_current - timedelta(days=1)
    # First day of the previous month
    start_date = end_date.replace(day=1)
    return start_date, end_date


def calculate_completed_period(
    period: Union[ReportPeriod, str],
    reference_date: Optional[date] = None,
    start_date: Optional[Union[date, str]] = None,
    end_date: Optional[Union[date, str]] = None,
    allow_custom_dates: bool = False,
) -> Tuple[date, date]:
    """Determine the explicit start and end date for a scheduled report delivery run.

    If start_date and end_date are provided:
    - Verifies period constraints via validate_report_period.
    - Unless allow_custom_dates=True, rejects uncompleted periods (ending on or after reference_date).

    If start_date and end_date are omitted:
    - Calculates the previous completed calendar week or month.
    """
    ref = reference_date or datetime.now(timezone.utc).date()
    period_str = str(period.value if hasattr(period, "value") else period).lower().strip()

    if start_date is not None and end_date is not None:
        start_d = date.fromisoformat(str(start_date).strip()) if isinstance(start_date, str) else start_date
        end_d = date.fromisoformat(str(end_date).strip()) if isinstance(end_date, str) else end_date

        if not allow_custom_dates and end_d >= ref:
            raise ReportValidationError(
                f"Scheduled delivery only accepts completed periods. End date ({end_d}) must be strictly prior to reference date ({ref})."
            )

        validate_report_period(period_str, start_d, end_d, reference_today=None if allow_custom_dates else ref)
        return start_d, end_d

    if period_str == "weekly":
        return get_completed_weekly_period(ref)
    elif period_str == "monthly":
        return get_completed_monthly_period(ref)
    else:
        raise ReportValidationError(f"Unsupported period: '{period}'. Must be 'weekly' or 'monthly'.")


# ============================================================================
# Deterministic Delivery Key
# ============================================================================

def build_delivery_key(
    recipient_user_id: Union[str, ObjectId],
    patient_id: Union[str, ObjectId],
    period_type: Union[ReportPeriod, str],
    start_date: Union[str, date],
    end_date: Union[str, date],
) -> str:
    """Build canonical deterministic delivery key for atomic deduplication:
    recipientUserId:patientId:periodType:startDate:endDate
    """
    r_id = str(recipient_user_id).strip()
    p_id = str(patient_id).strip()
    p_type = str(period_type.value if hasattr(period_type, "value") else period_type).strip().lower()
    s_date = str(start_date.isoformat() if hasattr(start_date, "isoformat") else start_date).strip()
    e_date = str(end_date.isoformat() if hasattr(end_date, "isoformat") else end_date).strip()
    return f"{r_id}:{p_id}:{p_type}:{s_date}:{e_date}"


# ============================================================================
# Domain Results
# ============================================================================

@dataclass
class DeliveryResult:
    """Individual recipient delivery attempt result."""
    delivery_key: str
    recipient_user_id: ObjectId
    patient_id: ObjectId
    recipient_email: str
    recipient_role: str
    status: str  # "sent", "skipped", "failed"
    error_message: Optional[str] = None
    skip_reason: Optional[str] = None


@dataclass
class ScheduledRunSummary:
    """Operational summary of a batch scheduled report delivery execution."""
    period: str
    start_date: str
    end_date: str
    total_eligible: int
    sent_count: int
    skipped_count: int
    failed_count: int
    results: List[DeliveryResult] = field(default_factory=list)


# ============================================================================
# Service Implementation
# ============================================================================

class ScheduledReportService:
    """Orchestrates scheduled weekly and monthly adherence report deliveries."""

    def __init__(
        self,
        deliveries_collection: Optional[Any] = None,
        users_collection: Optional[Any] = None,
        caregivers_collection: Optional[Any] = None,
        report_service: Optional[ReportService] = None,
        pdf_service: Optional[PdfService] = None,
        email_service: Optional[EmailServiceInterface] = None,
    ):
        self._deliveries_coll = deliveries_collection
        self._users_coll = users_collection
        self._caregivers_coll = caregivers_collection
        self._report_service = report_service
        self._pdf_service = pdf_service
        self._email_service = email_service

    @property
    def deliveries_coll(self) -> Any:
        if self._deliveries_coll is not None:
            return self._deliveries_coll
        try:
            from app.db.mongodb import get_scheduled_report_deliveries_collection
            return get_scheduled_report_deliveries_collection()
        except Exception:
            return None

    @property
    def users_coll(self) -> Any:
        if self._users_coll is not None:
            return self._users_coll
        try:
            from app.db.mongodb import get_users_collection
            return get_users_collection()
        except Exception:
            return None

    @property
    def caregivers_coll(self) -> Any:
        if self._caregivers_coll is not None:
            return self._caregivers_coll
        try:
            from app.db.mongodb import get_caregivers_collection
            return get_caregivers_collection()
        except Exception:
            return None

    @property
    def report_service(self) -> ReportService:
        if self._report_service is not None:
            return self._report_service
        return ReportService()

    @property
    def pdf_service(self) -> PdfService:
        if self._pdf_service is not None:
            return self._pdf_service
        return default_pdf_service

    @property
    def email_service(self) -> EmailServiceInterface:
        if self._email_service is not None:
            return self._email_service
        return get_email_service()

    @staticmethod
    def _sanitize_error(error_msg: str) -> str:
        """Sanitize sensitive credentials and tokens from error messages before logging or persistence."""
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

    async def deliver_report(
        self,
        recipient_user_id: Union[str, ObjectId],
        patient_id: Union[str, ObjectId],
        recipient_email: str,
        recipient_name: str,
        period: Union[ReportPeriod, str],
        start_date: Union[date, str],
        end_date: Union[date, str],
        recipient_role: str = "patient",
    ) -> DeliveryResult:
        """Atomically claim, generate, and deliver a single adherence report email with PDF attachment.

        Idempotency Rules:
        - If deliveryKey exists and status="sent" -> skip (already sent).
        - If deliveryKey exists and status="pending" -> skip (concurrent execution in progress).
        - If deliveryKey exists and status="failed" -> atomically claim for retry (status="pending").
        - If absent -> atomically claim by inserting new document (status="pending").
        - If email dispatch succeeds -> status="sent", sentAt=now.
        - If email dispatch fails -> status="failed", errorMessage=<sanitized_error>.
        """
        r_oid = to_object_id(recipient_user_id)
        p_oid = to_object_id(patient_id)
        period_str = str(period.value if hasattr(period, "value") else period).lower().strip()
        start_d = date.fromisoformat(str(start_date).strip()) if isinstance(start_date, str) else start_date
        end_d = date.fromisoformat(str(end_date).strip()) if isinstance(end_date, str) else end_date

        delivery_key = build_delivery_key(
            recipient_user_id=r_oid,
            patient_id=p_oid,
            period_type=period_str,
            start_date=start_d,
            end_date=end_d,
        )

        coll = self.deliveries_coll
        if coll is None:
            logger.error("Deliveries collection unavailable; cannot record delivery for %s", delivery_key)
            return DeliveryResult(
                delivery_key=delivery_key,
                recipient_user_id=r_oid,
                patient_id=p_oid,
                recipient_email=recipient_email,
                recipient_role=recipient_role,
                status="failed",
                error_message="Deliveries collection unavailable",
            )

        # 1. Inspect existing delivery record
        existing = await coll.find_one({"deliveryKey": delivery_key})

        if existing is not None:
            existing_status = existing.get("status")
            if existing_status == "sent":
                logger.info("Delivery %s already sent at %s; skipping.", delivery_key, existing.get("sentAt"))
                return DeliveryResult(
                    delivery_key=delivery_key,
                    recipient_user_id=r_oid,
                    patient_id=p_oid,
                    recipient_email=recipient_email,
                    recipient_role=recipient_role,
                    status="skipped",
                    skip_reason="already_sent",
                )
            elif existing_status == "pending":
                logger.info("Delivery %s is currently in progress; skipping duplicate claim.", delivery_key)
                return DeliveryResult(
                    delivery_key=delivery_key,
                    recipient_user_id=r_oid,
                    patient_id=p_oid,
                    recipient_email=recipient_email,
                    recipient_role=recipient_role,
                    status="skipped",
                    skip_reason="already_pending",
                )
            elif existing_status == "failed":
                # Atomically claim failed record for retry
                claimed = await coll.find_one_and_update(
                    {"deliveryKey": delivery_key, "status": "failed"},
                    {
                        "$set": {"status": "pending", "updatedAt": now_utc()},
                        "$inc": {"attempts": 1},
                    },
                    return_document=pymongo.ReturnDocument.AFTER,
                )
                if claimed is None:
                    logger.info("Delivery %s retry claim collision; skipping.", delivery_key)
                    return DeliveryResult(
                        delivery_key=delivery_key,
                        recipient_user_id=r_oid,
                        patient_id=p_oid,
                        recipient_email=recipient_email,
                        recipient_role=recipient_role,
                        status="skipped",
                        skip_reason="claim_collision",
                    )
        else:
            # Atomic claim for new delivery
            doc = create_scheduled_report_delivery_document(
                delivery_key=delivery_key,
                recipient_user_id=r_oid,
                patient_id=p_oid,
                period_type=period_str,
                start_date=start_d.isoformat(),
                end_date=end_d.isoformat(),
                status="pending",
                attempts=1,
            )
            try:
                await coll.insert_one(doc)
            except DuplicateKeyError:
                logger.info("Concurrent runner claimed %s; skipping.", delivery_key)
                return DeliveryResult(
                    delivery_key=delivery_key,
                    recipient_user_id=r_oid,
                    patient_id=p_oid,
                    recipient_email=recipient_email,
                    recipient_role=recipient_role,
                    status="skipped",
                    skip_reason="duplicate_claim",
                )

        # 2. Generate report, render PDF, and dispatch email
        try:
            report: MedicationReportResponse = await self.report_service.calculate_report(
                patient_id=p_oid,
                period=period_str,
                start_date=start_d,
                end_date=end_d,
            )

            pdf_bytes: bytes = self.pdf_service.generate_report_pdf(report)

            email_message = create_adherence_report_email(
                recipient_email=recipient_email.strip().lower(),
                recipient_name=recipient_name.strip() or "User",
                report=report,
                pdf_bytes=pdf_bytes,
            )

            email_res = await self.email_service.send_email(email_message)

            if email_res.success and not email_res.skipped:
                now = now_utc()
                await coll.update_one(
                    {"deliveryKey": delivery_key},
                    {
                        "$set": {
                            "status": "sent",
                            "sentAt": now,
                            "updatedAt": now,
                            "errorMessage": None,
                        }
                    },
                )
                logger.info("Successfully delivered %s to %s", delivery_key, recipient_email)
                return DeliveryResult(
                    delivery_key=delivery_key,
                    recipient_user_id=r_oid,
                    patient_id=p_oid,
                    recipient_email=recipient_email,
                    recipient_role=recipient_role,
                    status="sent",
                )
            else:
                err_msg = self._sanitize_error(
                    email_res.error_message or "Email dispatch skipped or disabled"
                )
                now = now_utc()
                await coll.update_one(
                    {"deliveryKey": delivery_key},
                    {
                        "$set": {
                            "status": "failed",
                            "errorMessage": err_msg,
                            "updatedAt": now,
                        }
                    },
                )
                logger.warning("Delivery %s failed during email send: %s", delivery_key, err_msg)
                return DeliveryResult(
                    delivery_key=delivery_key,
                    recipient_user_id=r_oid,
                    patient_id=p_oid,
                    recipient_email=recipient_email,
                    recipient_role=recipient_role,
                    status="failed",
                    error_message=err_msg,
                )

        except Exception as exc:
            err_msg = self._sanitize_error(str(exc))
            now = now_utc()
            try:
                await coll.update_one(
                    {"deliveryKey": delivery_key},
                    {
                        "$set": {
                            "status": "failed",
                            "errorMessage": err_msg,
                            "updatedAt": now,
                        }
                    },
                )
            except Exception:
                pass
            logger.error("Delivery %s encountered unhandled error: %s", delivery_key, err_msg)
            return DeliveryResult(
                delivery_key=delivery_key,
                recipient_user_id=r_oid,
                patient_id=p_oid,
                recipient_email=recipient_email,
                recipient_role=recipient_role,
                status="failed",
                error_message=err_msg,
            )

    async def execute_scheduled_run(
        self,
        period: Union[ReportPeriod, str],
        reference_date: Optional[date] = None,
        start_date: Optional[Union[date, str]] = None,
        end_date: Optional[Union[date, str]] = None,
        allow_custom_dates: bool = False,
    ) -> ScheduledRunSummary:
        """Run batch adherence report delivery for all eligible patients and caregivers."""
        period_str = str(period.value if hasattr(period, "value") else period).lower().strip()
        start_d, end_d = calculate_completed_period(
            period=period_str,
            reference_date=reference_date,
            start_date=start_date,
            end_date=end_date,
            allow_custom_dates=allow_custom_dates,
        )

        users_coll = self.users_coll
        caregivers_coll = self.caregivers_coll

        if users_coll is None:
            logger.error("Users collection unavailable; aborting scheduled run.")
            return ScheduledRunSummary(
                period=period_str,
                start_date=start_d.isoformat(),
                end_date=end_d.isoformat(),
                total_eligible=0,
                sent_count=0,
                skipped_count=0,
                failed_count=0,
            )

        results: List[DeliveryResult] = []

        # 1. Process Eligible Patients
        patient_cursor = users_coll.find({"role": "patient"})
        async for patient in patient_cursor:
            prefs = patient.get("notificationPreferences") or {}
            if not bool(prefs.get("emailReportsEnabled", False)):
                continue

            res = await self.deliver_report(
                recipient_user_id=patient["_id"],
                patient_id=patient["_id"],
                recipient_email=patient.get("email", ""),
                recipient_name=patient.get("fullName", "Patient"),
                period=period_str,
                start_date=start_d,
                end_date=end_d,
                recipient_role="patient",
            )
            results.append(res)

        # 2. Process Eligible Active Caregivers
        if caregivers_coll is not None:
            cg_cursor = caregivers_coll.find({"status": "active"})
            async for link in cg_cursor:
                patient_id = link.get("patientId")
                cg_email = link.get("caregiverEmail", "").strip().lower()
                if not cg_email or not patient_id:
                    continue

                cg_user = await users_coll.find_one({"email": cg_email})
                if not cg_user or cg_user.get("role") != "caregiver":
                    continue

                cg_prefs = cg_user.get("notificationPreferences") or {}
                if not bool(cg_prefs.get("emailReportsEnabled", False)):
                    continue

                res = await self.deliver_report(
                    recipient_user_id=cg_user["_id"],
                    patient_id=patient_id,
                    recipient_email=cg_email,
                    recipient_name=cg_user.get("fullName", "Caregiver"),
                    period=period_str,
                    start_date=start_d,
                    end_date=end_d,
                    recipient_role="caregiver",
                )
                results.append(res)

        sent_count = sum(1 for r in results if r.status == "sent")
        skipped_count = sum(1 for r in results if r.status == "skipped")
        failed_count = sum(1 for r in results if r.status == "failed")

        return ScheduledRunSummary(
            period=period_str,
            start_date=start_d.isoformat(),
            end_date=end_d.isoformat(),
            total_eligible=len(results),
            sent_count=sent_count,
            skipped_count=skipped_count,
            failed_count=failed_count,
            results=results,
        )
