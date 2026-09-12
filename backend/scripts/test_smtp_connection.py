#!/usr/bin/env python3
"""Safe SMTP Connection and Authentication Diagnostic Utility (Phase 12.3).

Performs a non-destructive verification of the configured SMTP server:
1. Validates host, port, and security settings
2. Establishes TCP handshake within the configured timeout
3. Negotiates TLS/SSL encryption (STARTTLS or Direct SSL)
4. Verifies SMTP authentication credentials (if configured)
5. Gracefully disconnects without sending any message

Safety & Security Guarantees:
- Zero email messages dispatched.
- Zero database interactions (MongoDB is not accessed or modified).
- Password and credentials are NEVER printed, logged, or exposed in error messages.
- All errors are sanitized before output.
- Exits with return code 0 on success, code 1 on configuration/connectivity failure.
"""

import os
import smtplib
import sys

# Ensure backend root is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings


def sanitize_message(msg: str) -> str:
    """Mask any sensitive credentials from error strings."""
    if not msg:
        return ""
    sanitized = str(msg)
    pwd = getattr(settings, "SMTP_PASSWORD", None)
    if pwd and len(pwd) >= 3:
        sanitized = sanitized.replace(pwd, "[REDACTED]")
    return sanitized


def run_smtp_verification() -> int:
    print("==================================================")
    print("MediTrack+ SMTP Infrastructure Diagnostic Utility")
    print("==================================================")
    print(f"EMAIL_BACKEND    : {settings.EMAIL_BACKEND}")
    print(f"EMAIL_ENABLED    : {settings.EMAIL_ENABLED}")
    print(f"SMTP_HOST        : {settings.SMTP_HOST or '[UNSET]'}")
    print(f"SMTP_PORT        : {settings.SMTP_PORT}")
    print(f"SMTP_USE_TLS     : {settings.SMTP_USE_TLS}")
    print(f"SMTP_USE_SSL     : {settings.SMTP_USE_SSL}")
    print(f"SMTP_TIMEOUT     : {settings.SMTP_TIMEOUT}s")
    print(f"SMTP_USERNAME    : {settings.SMTP_USERNAME or '[UNSET]'}")
    print(f"SMTP_PASSWORD    : {'[CONFIGURED - REDACTED]' if settings.SMTP_PASSWORD else '[NOT SET]'}")
    print(f"EMAIL_FROM_EMAIL : {settings.EMAIL_FROM_EMAIL}")
    print(f"EMAIL_FROM_NAME  : {settings.EMAIL_FROM_NAME}")
    print("--------------------------------------------------")

    if settings.EMAIL_BACKEND == "mock":
        print("INFO: EMAIL_BACKEND is set to 'mock'.")
        print("MockEmailService is active. Email messages are captured in-memory for testing.")
        print("To test live cloud SMTP delivery, configure EMAIL_BACKEND=smtp in environment/config.")
        print("[STATUS: PASS (Mock Mode Verified)]")
        return 0

    if not settings.EMAIL_ENABLED:
        print("WARNING: EMAIL_ENABLED is set to False. Outgoing delivery is currently disabled.")

    if not settings.SMTP_HOST or settings.SMTP_PORT <= 0:
        print("ERROR: Invalid SMTP configuration. SMTP_HOST and positive SMTP_PORT are required.")
        return 1

    use_direct_ssl = settings.SMTP_USE_SSL or (settings.SMTP_PORT == 465 and settings.SMTP_USE_SSL is not False)
    protocol_label = "Direct SSL (port 465)" if use_direct_ssl else f"STARTTLS (port {settings.SMTP_PORT})"

    print(f"Attempting connection to {settings.SMTP_HOST}:{settings.SMTP_PORT} using {protocol_label}...")

    try:
        if use_direct_ssl:
            client = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT)
        else:
            client = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT)

        with client as smtp:
            print("✓ TCP connection established successfully.")

            # Initial EHLO
            code, resp = smtp.ehlo()
            print(f"✓ EHLO greeting received: code {code}")

            # STARTTLS negotiation if not already in SSL mode
            if not use_direct_ssl and settings.SMTP_USE_TLS:
                print("Negotiating STARTTLS encryption...")
                smtp.starttls()
                # Re-issue EHLO after TLS handshake per RFC 3207
                code, resp = smtp.ehlo()
                print(f"✓ STARTTLS encryption handshake complete (code {code}).")

            # Authentication check if credentials provided
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                print(f"Authenticating as '{settings.SMTP_USERNAME}'...")
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                print("✓ SMTP credentials authenticated successfully.")
            else:
                print("ℹ No SMTP credentials provided; skipped authentication.")

            print("Closing connection...")
            try:
                smtp.quit()
            except Exception:
                pass

        print("--------------------------------------------------")
        print("[STATUS: PASS] SMTP server is reachable, secure, and ready for production delivery.")
        return 0

    except smtplib.SMTPAuthenticationError as auth_err:
        safe_err = sanitize_message(str(auth_err))
        print(f"✗ Authentication failed: {safe_err}")
        print("TIP: For Gmail, ensure you use a 16-character App Password, not your account password.")
        print("TIP: For SendGrid, use username 'apikey' and your API key as password.")
        return 1
    except (smtplib.SMTPConnectError, TimeoutError, OSError) as conn_err:
        safe_err = sanitize_message(str(conn_err))
        print(f"✗ Connection error: {safe_err}")
        print("TIP: Verify host and port are open and not blocked by local firewall.")
        return 1
    except Exception as exc:
        safe_err = sanitize_message(str(exc))
        print(f"✗ Unexpected SMTP error: {safe_err}")
        return 1


if __name__ == "__main__":
    sys.exit(run_smtp_verification())
