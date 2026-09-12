"""Email Service Abstraction and Providers for MediTrack+ (Phase 11).

Provides clean, decoupled email delivery services:
- EmailServiceInterface: Abstract contract for email sending
- MockEmailService: Deterministic in-memory recorder for automated testing
- SMTPEmailService: Standards-compliant SMTP client using standard library email/smtplib
- Strict separation: Zero FastAPI, router, or database dependencies
- Safe error handling: Secrets and SMTP credentials are never logged, exposed, or persisted
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import email.utils
import logging
import smtplib
from typing import Any, Dict, List, Optional
import uuid

from app.core.config import settings

logger = logging.getLogger("meditrack.email_service")


# ============================================================================
# Domain Exceptions
# ============================================================================

class EmailServiceError(Exception):
    """Base domain exception for email service failures."""
    pass


class EmailConfigurationError(EmailServiceError):
    """Raised when email settings or SMTP credentials are missing or invalid."""
    pass


class EmailDeliveryError(EmailServiceError):
    """Raised when email transmission fails."""
    pass


# ============================================================================
# Data Structures
# ============================================================================

@dataclass
class EmailMessage:
    """Strongly typed internal email payload."""
    recipient: str
    subject: str
    text_body: str
    html_body: Optional[str] = None
    attachment_bytes: Optional[bytes] = None
    attachment_filename: Optional[str] = None
    attachment_mime_type: str = "application/pdf"


@dataclass
class EmailResult:
    """Delivery outcome returned by email providers."""
    success: bool
    recipient: str
    message_id: Optional[str] = None
    skipped: bool = False
    error: Optional[str] = None


# ============================================================================
# Abstract Interface
# ============================================================================

class EmailServiceInterface(ABC):
    """Abstract interface defining the email delivery contract."""

    @abstractmethod
    async def send_email(self, message: EmailMessage) -> EmailResult:
        """Send an email message. Returns EmailResult."""
        pass


# ============================================================================
# Mock Implementation
# ============================================================================

class MockEmailService(EmailServiceInterface):
    """In-memory mock email service for deterministic testing."""

    def __init__(self, email_enabled: Optional[bool] = None):
        self.email_enabled = settings.EMAIL_ENABLED if email_enabled is None else email_enabled
        self.sent_messages: List[EmailMessage] = []

    async def send_email(self, message: EmailMessage) -> EmailResult:
        if not self.email_enabled:
            logger.info("MockEmailService: Delivery skipped (EMAIL_ENABLED=false) for %s", message.recipient)
            return EmailResult(
                success=True,
                recipient=message.recipient,
                skipped=True,
                message_id=None,
            )

        self.sent_messages.append(message)
        generated_id = f"mock-{uuid.uuid4().hex[:12]}"
        logger.info("MockEmailService: Recorded email to %s (subject: %s)", message.recipient, message.subject)
        return EmailResult(
            success=True,
            recipient=message.recipient,
            message_id=generated_id,
            skipped=False,
        )

    def clear(self) -> None:
        """Clear the recorded sent messages list."""
        self.sent_messages.clear()

    def get_sent_messages(self) -> List[EmailMessage]:
        """Return a copy of all recorded sent messages."""
        return list(self.sent_messages)

    def get_last_message(self) -> Optional[EmailMessage]:
        """Return the most recently recorded message, or None."""
        return self.sent_messages[-1] if self.sent_messages else None


# ============================================================================
# SMTP Implementation
# ============================================================================

class SMTPEmailService(EmailServiceInterface):
    """Standards-compliant SMTP email client using Python smtplib."""

    def __init__(
        self,
        smtp_host: Optional[str] = None,
        smtp_port: Optional[int] = None,
        smtp_username: Optional[str] = None,
        smtp_password: Optional[str] = None,
        smtp_use_tls: Optional[bool] = None,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None,
        email_enabled: Optional[bool] = None,
    ):
        self.smtp_host = (settings.SMTP_HOST if smtp_host is None else smtp_host).strip()
        self.smtp_port = settings.SMTP_PORT if smtp_port is None else smtp_port
        self.smtp_username = (settings.SMTP_USERNAME if smtp_username is None else smtp_username).strip()
        self.smtp_password = settings.SMTP_PASSWORD if smtp_password is None else smtp_password
        self.smtp_use_tls = settings.SMTP_USE_TLS if smtp_use_tls is None else smtp_use_tls
        self.from_email = (settings.EMAIL_FROM_EMAIL if from_email is None else from_email).strip()
        self.from_name = (settings.EMAIL_FROM_NAME if from_name is None else from_name).strip()
        self.email_enabled = settings.EMAIL_ENABLED if email_enabled is None else email_enabled

    def build_mime_message(self, message: EmailMessage) -> MIMEMultipart:
        """Construct a multi-part MIME email message with optional HTML and attachments."""
        msg = MIMEMultipart("mixed")
        msg["Subject"] = message.subject
        msg["From"] = email.utils.formataddr((self.from_name, self.from_email))
        msg["To"] = message.recipient
        msg["Date"] = email.utils.formatdate(localtime=False)
        msg["Message-ID"] = email.utils.make_msgid(domain="meditrack.health")

        # Body container
        if message.html_body:
            body_part = MIMEMultipart("alternative")
            body_part.attach(MIMEText(message.text_body, "plain", "utf-8"))
            body_part.attach(MIMEText(message.html_body, "html", "utf-8"))
            msg.attach(body_part)
        else:
            msg.attach(MIMEText(message.text_body, "plain", "utf-8"))

        # Attachment
        if message.attachment_bytes:
            subtype = "pdf"
            if message.attachment_mime_type and "/" in message.attachment_mime_type:
                subtype = message.attachment_mime_type.split("/")[-1]
            attach_part = MIMEApplication(message.attachment_bytes, _subtype=subtype)
            filename = message.attachment_filename or "report.pdf"
            attach_part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(attach_part)

        return msg

    def _sanitize_error_message(self, err_text: str) -> str:
        """Strip sensitive credentials from error strings before bubbling or logging."""
        sanitized = err_text
        if self.smtp_password and len(self.smtp_password) >= 3:
            sanitized = sanitized.replace(self.smtp_password, "[REDACTED]")
        return sanitized

    async def send_email(self, message: EmailMessage) -> EmailResult:
        """Send an email over SMTP. Handles TLS, authentication, and safe error masking."""
        if not self.email_enabled:
            logger.info("SMTPEmailService: Delivery skipped (EMAIL_ENABLED=false) for %s", message.recipient)
            return EmailResult(
                success=True,
                recipient=message.recipient,
                skipped=True,
                message_id=None,
            )

        if not self.smtp_host or self.smtp_port <= 0:
            err_msg = "SMTP configuration error: SMTP_HOST or SMTP_PORT is not properly configured."
            logger.error("SMTPEmailService: %s", err_msg)
            raise EmailConfigurationError(err_msg)

        mime_msg = self.build_mime_message(message)

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as smtp:
                if self.smtp_use_tls:
                    smtp.starttls()
                if self.smtp_username and self.smtp_password:
                    smtp.login(self.smtp_username, self.smtp_password)
                smtp.send_message(mime_msg)

            msg_id = mime_msg["Message-ID"]
            logger.info("SMTPEmailService: Successfully sent email to %s (id: %s)", message.recipient, msg_id)
            return EmailResult(
                success=True,
                recipient=message.recipient,
                message_id=msg_id,
                skipped=False,
            )
        except EmailConfigurationError:
            raise
        except Exception as e:
            raw_err = str(e)
            safe_err = self._sanitize_error_message(raw_err)
            logger.error("SMTPEmailService: Delivery failure to %s: %s", message.recipient, safe_err)
            raise EmailDeliveryError(f"Email delivery failed: {safe_err}") from None


# ============================================================================
# Service Factory
# ============================================================================

def get_email_service() -> EmailServiceInterface:
    """Provide the configured email service provider based on application settings."""
    if settings.EMAIL_BACKEND == "smtp":
        return SMTPEmailService()
    return MockEmailService()


# Shared singleton instance for default application use
email_service = get_email_service()
