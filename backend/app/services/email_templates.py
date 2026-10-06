"""Email Templates for Caregiver Alerts and Adherence Reports (Phase 11).

Provides clean, structured, and branded email templates:
1. Caregiver missed-dose alert notification
2. Weekly / Monthly medication adherence report with PDF attachment

Architecture & Safety Rules:
- Pure formatting module: Zero FastAPI, router, or database imports
- Consumes already-calculated domain models (never recalculates adherence)
- Strictly excludes passwords, password hashes, JWTs, tokens, SMTP credentials, and CRON_SECRET_KEY
- Responsive HTML and plain-text alternatives for wide email client compatibility
"""

from typing import Optional

from app.schemas.report import MedicationReportResponse, ReportPeriod
from app.services.email_service import EmailMessage


# ============================================================================
# Template A: Caregiver Missed-Dose Alert
# ============================================================================

def create_caregiver_missed_dose_email(
    caregiver_email: str,
    caregiver_name: str,
    patient_name: str,
    medicine_name: str,
    dosage: str,
    dosage_unit: str,
    scheduled_date: str,
    scheduled_time: str,
    alert_rule: str,
    adherence_context: Optional[str] = None,
) -> EmailMessage:
    """Create an alert email notifying a caregiver that a linked patient missed medication."""
    subject = f"[MediTrack+ Alert] Missed Medication Dose — {patient_name}"

    context_line_text = f"Adherence Context: {adherence_context}\n" if adherence_context else ""
    context_row_html = (
        f"""<tr>
            <td style="padding: 8px 12px; font-weight: 600; color: #475569; width: 140px;">Adherence Context</td>
            <td style="padding: 8px 12px; color: #0f172a;">{adherence_context}</td>
        </tr>"""
        if adherence_context
        else ""
    )

    text_body = f"""MediTrack+ Caregiver Alert: Missed Medication Dose

Dear {caregiver_name},

This is an automated safety alert from MediTrack+. Your linked patient, {patient_name}, has missed a scheduled medication dose.

Details:
- Patient Name: {patient_name}
- Medication: {medicine_name} ({dosage} {dosage_unit})
- Scheduled Time: {scheduled_date} at {scheduled_time}
- Alert Reason: {alert_rule}
{context_line_text}
Next Steps:
Please open your MediTrack+ app to review the patient's schedule and history, or check in with {patient_name} directly.

Medical Safety Notice:
MediTrack+ notifications are for medication adherence monitoring only and do not provide medical diagnosis, treatment recommendations, or emergency response services. If you suspect an acute medical emergency, please contact professional emergency medical services immediately.

— MediTrack+ Healthcare Platform
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #008080; padding: 20px 24px; text-align: left;">
                            <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700;">MediTrack+</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #ccfbf1;">Caregiver Safety Alert</p>
                        </td>
                    </tr>
                    <!-- Alert Notice Banner -->
                    <tr>
                        <td style="padding: 20px 24px 8px 24px;">
                            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px;">
                                <p style="margin: 0; font-weight: 600; color: #991b1b; font-size: 14px;">Missed Medication Dose Detected</p>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: #7f1d1d;">Linked patient <strong>{patient_name}</strong> has missed a scheduled dose.</p>
                            </div>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 12px 24px;">
                            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">Dear <strong>{caregiver_name}</strong>,</p>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px;">
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 8px 12px; font-weight: 600; color: #475569; width: 140px;">Patient</td>
                                    <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">{patient_name}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 8px 12px; font-weight: 600; color: #475569;">Medication</td>
                                    <td style="padding: 8px 12px; color: #0f172a;">{medicine_name} ({dosage} {dosage_unit})</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 8px 12px; font-weight: 600; color: #475569;">Scheduled Time</td>
                                    <td style="padding: 8px 12px; color: #0f172a;">{scheduled_date} at {scheduled_time}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 8px 12px; font-weight: 600; color: #475569;">Alert Trigger</td>
                                    <td style="padding: 8px 12px; color: #dc2626; font-weight: 600;">{alert_rule}</td>
                                </tr>
                                {context_row_html}
                            </table>
                            <p style="margin: 16px 0 0 0; font-size: 13px; line-height: 1.5; color: #334155;">
                                Please check in with {patient_name} or open your <strong>MediTrack+</strong> application to review recent adherence history.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer / Disclaimer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.4; color: #64748b;">
                            <p style="margin: 0 0 6px 0;"><strong>Medical Safety Notice:</strong> MediTrack+ notifications are for medication adherence support and caregiver monitoring only. MediTrack+ does not provide clinical diagnosis, treatment changes, or emergency response services.</p>
                            <p style="margin: 0; color: #94a3b8;">&copy; MediTrack+ Healthcare Platform. Automated safety notification.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""

    return EmailMessage(
        recipient=caregiver_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


# ============================================================================
# Template B: Adherence Report Email with PDF Attachment
# ============================================================================

def create_adherence_report_email(
    recipient_email: str,
    recipient_name: str,
    report: MedicationReportResponse,
    pdf_bytes: bytes,
) -> EmailMessage:
    """Create a weekly or monthly adherence report email with attached generated PDF."""
    is_weekly = report.reportType == ReportPeriod.WEEKLY
    period_label = "Weekly" if is_weekly else "Monthly"

    if is_weekly:
        filename = f"MediTrack_Weekly_Report_{report.endDate}.pdf"
    else:
        # Standard monthly filename format: MediTrack_Monthly_Report_YYYY-MM.pdf
        month_str = report.endDate[:7]
        filename = f"MediTrack_Monthly_Report_{month_str}.pdf"

    subject = f"[MediTrack+] Your {period_label} Medication Adherence Report ({report.startDate} to {report.endDate})"

    adherence_pct = report.summary.adherencePercentage
    total_sched = report.summary.totalScheduled
    taken = report.summary.takenCount
    skipped = report.summary.skippedCount
    missed = report.summary.missedCount
    pending = report.summary.pendingCount
    streak_curr = report.streak.currentStreak
    streak_long = report.streak.longestStreak

    text_body = f"""MediTrack+ {period_label} Medication Adherence Report

Dear {recipient_name},

Your {period_label.lower()} medication adherence summary for {report.patientName} ({report.startDate} to {report.endDate}) is ready.

Summary Metrics:
- Overall Adherence Rate: {adherence_pct}%
- Doses Taken: {taken} of {total_sched}
- Doses Skipped: {skipped}
- Doses Missed: {missed}
- Doses Pending: {pending}
- Current Streak: {streak_curr} days (Longest: {streak_long} days)

Attachment:
Your detailed PDF adherence report, including day-by-day logs and medication-by-medication breakdown, is attached ({filename}).

Medical Disclaimer:
{report.medicalDisclaimer}

— MediTrack+ Healthcare Platform
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #008080; padding: 20px 24px; text-align: left;">
                            <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700;">MediTrack+</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #ccfbf1;">{period_label} Medication Adherence Report</p>
                        </td>
                    </tr>
                    <!-- Greeting & Period -->
                    <tr>
                        <td style="padding: 20px 24px 12px 24px;">
                            <p style="margin: 0 0 8px 0; font-size: 14px;">Dear <strong>{recipient_name}</strong>,</p>
                            <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
                                Here is the {period_label.lower()} adherence report for <strong>{report.patientName}</strong> covering <strong>{report.startDate}</strong> to <strong>{report.endDate}</strong>.
                            </p>
                        </td>
                    </tr>
                    <!-- 4 Metric Cards -->
                    <tr>
                        <td style="padding: 8px 24px 16px 24px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td width="25%" style="padding: 4px;">
                                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 6px; text-align: center;">
                                            <div style="font-size: 18px; font-weight: 700; color: #008080;">{adherence_pct}%</div>
                                            <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-top: 2px;">ADHERENCE</div>
                                        </div>
                                    </td>
                                    <td width="25%" style="padding: 4px;">
                                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 6px; text-align: center;">
                                            <div style="font-size: 18px; font-weight: 700; color: #059669;">{taken}/{total_sched}</div>
                                            <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-top: 2px;">TAKEN</div>
                                        </div>
                                    </td>
                                    <td width="25%" style="padding: 4px;">
                                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 6px; text-align: center;">
                                            <div style="font-size: 18px; font-weight: 700; color: #dc2626;">{missed}</div>
                                            <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-top: 2px;">MISSED</div>
                                        </div>
                                    </td>
                                    <td width="25%" style="padding: 4px;">
                                        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 6px; text-align: center;">
                                            <div style="font-size: 18px; font-weight: 700; color: #005a5a;">{streak_curr}d</div>
                                            <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-top: 2px;">STREAK</div>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Attachment Notice -->
                    <tr>
                        <td style="padding: 0 24px 20px 24px;">
                            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px;">
                                <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 600;">PDF Report Attached</p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #15803d;">
                                    Your detailed report with daily dose logs and medicine breakdown is attached: <strong>{filename}</strong>.
                                </p>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer / Disclaimer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.4; color: #64748b;">
                            <p style="margin: 0 0 6px 0;"><strong>Medical Safety Notice:</strong> {report.medicalDisclaimer}</p>
                            <p style="margin: 0; color: #94a3b8;">&copy; MediTrack+ Healthcare Platform. Confidential patient adherence report.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""

    return EmailMessage(
        recipient=recipient_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        attachment_bytes=pdf_bytes,
        attachment_filename=filename,
        attachment_mime_type="application/pdf",
    )


# ============================================================================
# Template C: Password Reset OTP Email (Phase 12.1)
# ============================================================================

def create_password_reset_email(
    recipient_email: str,
    recipient_name: Optional[str],
    otp_code: str,
    expire_minutes: int = 15,
) -> EmailMessage:
    """Construct a secure, branded password reset email containing the 6-digit verification code."""
    name_display = recipient_name.strip() if recipient_name and recipient_name.strip() else "Valued User"
    subject = f"[MediTrack+] Your Password Reset Code is {otp_code}"

    text_body = f"""MediTrack+ Password Reset Request

Dear {name_display},

We received a request to reset the password for your MediTrack+ account ({recipient_email}).

Your 6-digit verification code is:
{otp_code}

This code will expire in {expire_minutes} minutes.

Security Notice:
- Never share this code with anyone. MediTrack+ staff will never ask you for your verification code.
- If you did not initiate this password reset request, please disregard this email. Your current password remains secure.

Medical Safety Notice:
MediTrack+ is a medication reminder and tracking platform. It does not provide medical advice, diagnosis, or treatment decisions.

— MediTrack+ Healthcare Platform Security Team
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #008080; padding: 20px 24px; text-align: left;">
                            <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700;">MediTrack+</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #ccfbf1;">Account Security &amp; Password Recovery</p>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px;">
                            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">Dear <strong>{name_display}</strong>,</p>
                            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: #334155;">
                                We received a request to reset the password for your MediTrack+ account. Please enter the following 6-digit verification code in the application:
                            </p>
                            <!-- Verification Code Card -->
                            <div style="background-color: #f0fdfa; border: 2px solid #008080; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                                <div style="font-size: 12px; font-weight: 700; color: #008080; letter-spacing: 1px; margin-bottom: 8px;">VERIFICATION CODE</div>
                                <div style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 6px; font-family: monospace;">{otp_code}</div>
                                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Expires in <strong>{expire_minutes} minutes</strong></div>
                            </div>
                            <!-- Security Alert Box -->
                            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
                                <p style="margin: 0; font-size: 13px; font-weight: 600; color: #92400e;">Security Notice</p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #78350f; line-height: 1.4;">
                                    Do not share this code with anyone. MediTrack+ staff will never ask for your password or verification code. If you did not request this, your account remains secure and no action is required.
                                </p>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.4; color: #64748b;">
                            <p style="margin: 0 0 6px 0;"><strong>Medical Safety Notice:</strong> MediTrack+ is a medication management tool. It does not provide medical diagnoses or treatment recommendations.</p>
                            <p style="margin: 0; color: #94a3b8;">&copy; MediTrack+ Healthcare Platform. Automated security notification.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""

    return EmailMessage(
        recipient=recipient_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


# ============================================================================
# Template D: Password Changed Notification Email (Phase 12.1)
# ============================================================================

def create_password_changed_notification_email(
    recipient_email: str,
    recipient_name: Optional[str],
    changed_at_str: Optional[str] = None,
) -> EmailMessage:
    """Construct a security notice email alerting the user that their password was recently changed."""
    name_display = recipient_name.strip() if recipient_name and recipient_name.strip() else "Valued User"
    time_display = changed_at_str or "Just now"
    subject = "[MediTrack+] Security Alert: Your Password Was Changed"

    text_body = f"""MediTrack+ Security Notice: Password Changed

Dear {name_display},

This is an automated confirmation that the password for your MediTrack+ account ({recipient_email}) was successfully changed on {time_display} UTC.

All prior active sessions and devices have been logged out for your security.

Security Warning:
If you initiated this change, no further action is required.
If you did NOT change your password, please contact our security team immediately or reset your password using the MediTrack+ application.

Medical Safety Notice:
MediTrack+ is a medication reminder and tracking platform. It does not provide medical advice or treatment decisions.

— MediTrack+ Healthcare Platform Security Team
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #008080; padding: 20px 24px; text-align: left;">
                            <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700;">MediTrack+</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #ccfbf1;">Security Notification</p>
                        </td>
                    </tr>
                    <!-- Alert Notice Banner -->
                    <tr>
                        <td style="padding: 20px 24px 8px 24px;">
                            <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 4px;">
                                <p style="margin: 0; font-weight: 600; color: #065f46; font-size: 14px;">Password Updated Successfully</p>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: #047857;">Your account password was updated. All previous sessions have been invalidated.</p>
                            </div>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 12px 24px 24px 24px;">
                            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">Dear <strong>{name_display}</strong>,</p>
                            <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; color: #334155;">
                                The password for your MediTrack+ account (<strong>{recipient_email}</strong>) was successfully changed on <strong>{time_display}</strong> UTC.
                            </p>
                            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px;">
                                <p style="margin: 0; font-size: 13px; font-weight: 600; color: #991b1b;">Didn't make this change?</p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #7f1d1d; line-height: 1.4;">
                                    If you did not initiate this change, your account may have been compromised. Please immediately use the <strong>Forgot Password</strong> option in the MediTrack+ mobile app to secure your account.
                                </p>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.4; color: #64748b;">
                            <p style="margin: 0 0 6px 0;"><strong>Medical Safety Notice:</strong> MediTrack+ is a medication reminder and adherence platform.</p>
                            <p style="margin: 0; color: #94a3b8;">&copy; MediTrack+ Healthcare Platform. Automated security notification.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""

    return EmailMessage(
        recipient=recipient_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


# ============================================================================
# Template E: Email Verification OTP Email (Phase 13.1)
# ============================================================================

def create_email_verification_email(
    recipient_email: str,
    recipient_name: Optional[str],
    otp_code: str,
    expire_minutes: int = 10,
) -> EmailMessage:
    """Construct a secure, branded email containing the 6-digit email verification code."""
    name_display = recipient_name.strip() if recipient_name and recipient_name.strip() else "Valued User"
    subject = f"[MediTrack+] Verify Your Email — Code: {otp_code}"

    text_body = f"""Welcome to MediTrack+!

Dear {name_display},

Thank you for registering with MediTrack+. Please verify your email address to activate all account features and receive medication alerts.

Your 6-digit verification code is:
{otp_code}

This code will expire in {expire_minutes} minutes.

Security Notice:
- Never share this code with anyone. MediTrack+ staff will never ask for your verification code.
- If you did not create a MediTrack+ account, please disregard this email.

Medical Safety Notice:
MediTrack+ is a medication management tool. It does not provide medical advice, diagnosis, or treatment recommendations.

— MediTrack+ Healthcare Platform Team
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #008080; padding: 20px 24px; text-align: left;">
                            <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 700;">MediTrack+</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #ccfbf1;">Account Registration &amp; Email Verification</p>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 24px;">
                            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">Dear <strong>{name_display}</strong>,</p>
                            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: #334155;">
                                Welcome to MediTrack+! Please enter the following 6-digit verification code in the application to complete your email verification:
                            </p>
                            <!-- Verification Code Card -->
                            <div style="background-color: #f0fdfa; border: 2px solid #008080; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                                <div style="font-size: 12px; font-weight: 700; color: #008080; letter-spacing: 1px; margin-bottom: 8px;">EMAIL VERIFICATION CODE</div>
                                <div style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 6px; font-family: monospace;">{otp_code}</div>
                                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Expires in <strong>{expire_minutes} minutes</strong></div>
                            </div>
                            <div style="background-color: #f8fafc; border-left: 4px solid #008080; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
                                <p style="margin: 0; font-size: 13px; font-weight: 600; color: #0f766e;">Why verify?</p>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #475569; line-height: 1.4;">
                                    Verifying your email ensures you can recover your account securely and receive important medication safety alerts.
                                </p>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.4; color: #64748b;">
                            <p style="margin: 0 0 6px 0;"><strong>Medical Safety Notice:</strong> MediTrack+ is a medication reminder and adherence platform.</p>
                            <p style="margin: 0; color: #94a3b8;">&copy; MediTrack+ Healthcare Platform. Automated registration notification.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""

    return EmailMessage(
        recipient=recipient_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )
