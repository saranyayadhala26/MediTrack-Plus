"""Services package for reusable business logic."""

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
from app.services.missed_dose_service import (
    ClassifiedOccurrence,
    MissedDoseService,
    OccurrenceClassification,
    classify_occurrence,
    resolve_effective_activity,
)
from app.services.missed_dose_rules import (
    MissedDoseRuleEvaluator,
    OccurrenceRuleEvaluation,
    PatientRuleEvaluationSummary,
    RuleQualificationType,
    evaluate_occurrence_sequence,
)
from app.services.caregiver_alert_service import (
    AlertPersistenceResult,
    CaregiverAlertService,
    build_fingerprint,
)
from app.services.adherence_service import (
    build_calendar_response,
    build_streak_response,
)
from app.services.report_service import (
    PatientNotFoundError,
    ReportService,
    ReportValidationError,
    calculate_medication_report,
    validate_report_period,
)
from app.services.pdf_service import (
    PdfService,
    generate_adherence_report_pdf,
)
from app.services.email_service import (
    EmailConfigurationError,
    EmailDeliveryError,
    EmailMessage,
    EmailResult,
    EmailServiceError,
    EmailServiceInterface,
    MockEmailService,
    SMTPEmailService,
    get_email_service,
)
from app.services.email_templates import (
    create_adherence_report_email,
    create_caregiver_missed_dose_email,
)
from app.services.scheduled_report_service import (
    DeliveryResult,
    ScheduledReportService,
    ScheduledRunSummary,
    build_delivery_key,
    calculate_completed_period,
    get_completed_monthly_period,
    get_completed_weekly_period,
)

__all__ = [
    "DATE_REGEX",
    "date_to_schema_day",
    "get_occurrence_dates_for_schedule",
    "get_reference_today",
    "is_schedule_occurrence",
    "parse_date",
    "python_weekday_to_schema_day",
    "schema_day_to_python_weekday",
    "ClassifiedOccurrence",
    "MissedDoseService",
    "OccurrenceClassification",
    "classify_occurrence",
    "resolve_effective_activity",
    "MissedDoseRuleEvaluator",
    "OccurrenceRuleEvaluation",
    "PatientRuleEvaluationSummary",
    "RuleQualificationType",
    "evaluate_occurrence_sequence",
    "AlertPersistenceResult",
    "CaregiverAlertService",
    "build_fingerprint",
    # Phase 11 Services
    "build_calendar_response",
    "build_streak_response",
    "ReportService",
    "ReportValidationError",
    "PatientNotFoundError",
    "calculate_medication_report",
    "validate_report_period",
    "PdfService",
    "generate_adherence_report_pdf",
    "EmailMessage",
    "EmailResult",
    "EmailServiceError",
    "EmailConfigurationError",
    "EmailDeliveryError",
    "EmailServiceInterface",
    "MockEmailService",
    "SMTPEmailService",
    "get_email_service",
    "create_caregiver_missed_dose_email",
    "create_adherence_report_email",
    "ScheduledReportService",
    "DeliveryResult",
    "ScheduledRunSummary",
    "build_delivery_key",
    "calculate_completed_period",
    "get_completed_weekly_period",
    "get_completed_monthly_period",
]


