"""
MediTrack+ Master Project Audit PDF Generator
Builds a comprehensive, authoritative, publication-quality PDF audit document
based strictly on empirical codebase verification.
"""

import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

# Palette
PRIMARY = colors.HexColor("#0D9488")      # MediTrack Teal
PRIMARY_DARK = colors.HexColor("#0F766E") # Dark Teal
SECONDARY = colors.HexColor("#0F172A")    # Dark Slate
TEXT_DARK = colors.HexColor("#1E293B")    # Slate 800
TEXT_MUTED = colors.HexColor("#64748B")   # Slate 500
BG_LIGHT = colors.HexColor("#F8FAFC")     # Light background
BG_HEADER = colors.HexColor("#E6F4F4")    # Light Teal Header
BORDER_COLOR = colors.HexColor("#CBD5E1") # Slate 300
ACCENT_GREEN = colors.HexColor("#059669")
ACCENT_RED = colors.HexColor("#DC2626")
ACCENT_AMBER = colors.HexColor("#D97706")

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        # Suppress headers/footers on cover page (page 1)
        if self._pageNumber > 1:
            # Header
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(PRIMARY_DARK)
            self.drawString(40, 755, "MEDITRACK+ • AUTHORITATIVE TECHNICAL PROJECT AUDIT")
            self.setFont("Helvetica", 8)
            self.setFillColor(TEXT_MUTED)
            self.drawRightString(572, 755, "EVIDENCE-BASED SOURCE OF TRUTH")
            self.setStrokeColor(BORDER_COLOR)
            self.setLineWidth(0.5)
            self.line(40, 748, 572, 748)

            # Footer
            self.line(40, 42, 572, 42)
            self.setFont("Helvetica", 8)
            self.drawString(40, 30, "Confidential Academic Audit Report • MCA Final Minor Project")
            page_text = f"Page {self._pageNumber} of {page_count}"
            self.drawRightString(572, 30, page_text)
        self.restoreState()

def build_pdf(filename="MediTrack_Master_Project_Audit.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=54,
        bottomMargin=54
    )

    base_styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=base_styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=PRIMARY_DARK,
        alignment=1, # Center
        spaceAfter=8
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=base_styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=TEXT_DARK,
        alignment=1,
        spaceAfter=15
    )
    
    meta_style = ParagraphStyle(
        'DocMeta',
        parent=base_styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=TEXT_MUTED,
        alignment=1,
        spaceAfter=25
    )

    h1_style = ParagraphStyle(
        'SectionH1',
        parent=base_styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=PRIMARY_DARK,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'SectionH2',
        parent=base_styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=SECONDARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=base_styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=TEXT_DARK,
        spaceAfter=5
    )

    bullet_style = ParagraphStyle(
        'BulletDark',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )

    fact_bullet_style = ParagraphStyle(
        'FactBullet',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        fontSize=8.0,
        leading=10.5,
        spaceAfter=1.8
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=base_styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=SECONDARY,
    )

    tbl_header = ParagraphStyle(
        'TblHeader',
        parent=base_styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=SECONDARY,
        alignment=0
    )

    tbl_body = ParagraphStyle(
        'TblBody',
        parent=base_styles['Normal'],
        fontName='Helvetica',
        fontSize=7.0,
        leading=8.5,
        textColor=TEXT_DARK,
        alignment=0
    )

    tbl_body_code = ParagraphStyle(
        'TblBodyCode',
        parent=tbl_body,
        fontName='Courier',
        fontSize=6.5,
        leading=8.0
    )

    story = []

    def p(text, style=body_style):
        return Paragraph(text, style)

    def b(text, style=bullet_style):
        return Paragraph(f"• {text}", style)

    def heading1(text):
        return Paragraph(text, h1_style)

    def heading2(text):
        return Paragraph(text, h2_style)

    def callout(text, bg=BG_HEADER, border_c=PRIMARY):
        tbl = Table([[Paragraph(text, callout_style)]], colWidths=[532])
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg),
            ('BOX', (0,0), (-1,-1), 1, border_c),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ]))
        return tbl

    def evidence_box(claim, file_path, status="VERIFIED"):
        c_color = ACCENT_GREEN if status=="VERIFIED" else (ACCENT_AMBER if status=="PARTIAL" else ACCENT_RED)
        content = f"<b>Claim:</b> {claim}<br/><b>Evidence:</b> <font name='Courier'>{file_path}</font><br/><b>Audit Status:</b> <font color='{c_color.hexval()}'><b>{status}</b></font>"
        tbl = Table([[Paragraph(content, tbl_body)]], colWidths=[532])
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
            ('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR),
            ('LINELEFT', (0,0), (0,0), 3, c_color),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        return tbl

    # =========================================================================
    # COVER PAGE / HEADER
    # =========================================================================
    story.append(Spacer(1, 20))
    story.append(Paragraph("MEDITRACK+", title_style))
    story.append(Paragraph("Smart Medication Management & Adherence Platform", subtitle_style))
    story.append(Paragraph("<b>MASTER TECHNICAL PROJECT AUDIT & SOURCE OF TRUTH</b><br/>Comprehensive Codebase, API, Database, UI, Workflow & Academic Alignment Reference", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=PRIMARY, spaceAfter=15))
    story.append(Paragraph("<b>Authoritative Inspection Date:</b> September 23, 2026 &nbsp;|&nbsp; <b>Project Type:</b> MCA Final Minor Project &nbsp;|&nbsp; <b>Rule:</b> Strict Zero-Guessing Audit", meta_style))
    story.append(Spacer(1, 10))

    story.append(callout(
        "<b>AUDITOR DIRECTIVE & CERTIFICATION:</b><br/>"
        "This document is an exhaustive, empirically verified technical audit of the MediTrack+ codebase located at "
        "<font name='Courier'>C:\\SampleMediTrack</font>. Every claim, endpoint, database field, UI flow, and formula "
        "documented herein is extracted directly from working source code, schema models, and automated test execution. "
        "No features or architectures are assumed, hypothesized, or generalized from conventional application templates."
    ))
    story.append(Spacer(1, 15))

    # =========================================================================
    # 1. EXECUTIVE SUMMARY
    # =========================================================================
    story.append(heading1("1. EXECUTIVE SUMMARY"))
    story.append(p("<b>Project Name:</b> MediTrack+"))
    story.append(p("<b>Official Title:</b> MediTrack+: Smart Medication Management & Adherence Platform"))
    story.append(p("<b>Domain:</b> Healthcare / Digital Medication Adherence & Caregiver Oversight (mHealth)"))
    story.append(p("<b>Implementation Architecture:</b> Three-tier Decoupled Full-Stack Architecture:"))
    story.append(b("<b>Frontend Mobile Tier:</b> React Native 0.86.3 with Expo SDK 57.0.21, TypeScript 6.0.3, React 19.2.3, React Navigation v7, hardware-backed SecureStore, and a custom local Kotlin native module (<font name='Courier'>exact-alarm</font>) for Android 14 exact alarm scheduling."))
    story.append(b("<b>Backend Application Tier:</b> FastAPI 0.141.1 running on Python 3.13 (Uvicorn ASGI 0.52.4) with 38 REST endpoints across 9 modular routers, strict Pydantic v2 validation, Bcrypt password hashing, HS256 JWT stateless authentication, ReportLab PDF rendering, and an abstract email delivery engine."))
    story.append(b("<b>Database Persistence Tier:</b> MongoDB Atlas document database (or local MongoDB fallback) accessed via official <font name='Courier'>pymongo.AsyncMongoClient</font> (PyMongo 4.18.0) across 8 structured collections with compound, unique, and TTL expiration indexes."))
    story.append(p("<b>Main Purpose:</b> Solve the clinical challenge of medication non-adherence by providing timely, high-importance local device reminder alarms, strict dose-action accountability (Taken, Snoozed, or Skipped with mandatory clinically useful reason), non-fabricated daily adherence tracking, interactive calendar visualization, streak habituation, rule-based caregiver missed-dose alerts, and automated PDF clinical summaries."))
    story.append(p("<b>Target Actors:</b> Strictly two distinct user roles: <b>Patient (Primary User)</b> and <b>Caregiver</b>. An Admin actor is <b>NOT IMPLEMENTED</b> in code."))
    story.append(p("<b>Authoritative Medical Disclaimer:</b> MediTrack+ is strictly a reminder and adherence monitoring system. It does not provide medical diagnosis, prescribe drugs, modify doses, or offer clinical treatment advice."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 2. VERIFIED TECHNOLOGY STACK
    # =========================================================================
    story.append(heading1("2. VERIFIED TECHNOLOGY STACK"))
    story.append(p("The following table distinguishes between technologies actually used in source code, installed but unused, and those mentioned only in external documentation:"))

    tech_data = [
        [p("Layer / Category", tbl_header), p("Technology / Library", tbl_header), p("Exact Version", tbl_header), p("Classification", tbl_header), p("Verification Evidence & Notes", tbl_header)],
        [p("Mobile Framework", tbl_body), p("React Native / Expo", tbl_body), p("RN 0.86.3 / Expo 57.0.21", tbl_body), p("Actually Used", tbl_body), p("mobile/package.json, app.json", tbl_body)],
        [p("Frontend Language", tbl_body), p("TypeScript", tbl_body), p("6.0.3 (~6.0.3)", tbl_body), p("Actually Used", tbl_body), p("Strict typing across mobile/src; 0 tsc errors", tbl_body)],
        [p("UI Engine", tbl_body), p("React", tbl_body), p("19.2.3", tbl_body), p("Actually Used", tbl_body), p("Component hierarchy and React hooks", tbl_body)],
        [p("Mobile Navigation", tbl_body), p("React Navigation", tbl_body), p("7.0.14 / 7.2.0", tbl_body), p("Actually Used", tbl_body), p("Bottom Tabs & Native Stack in RootNavigator", tbl_body)],
        [p("HTTP Client (Mobile)", tbl_body), p("Axios", tbl_body), p("1.7.9", tbl_body), p("Actually Used", tbl_body), p("mobile/src/api/client.ts with interceptors", tbl_body)],
        [p("Secure Storage", tbl_body), p("Expo SecureStore", tbl_body), p("57.0.3", tbl_body), p("Actually Used", tbl_body), p("Hardware-backed JWT persistence", tbl_body)],
        [p("Key-Value Storage", tbl_body), p("AsyncStorage", tbl_body), p("2.2.0", tbl_body), p("Actually Used", tbl_body), p("User profile cache in asyncStorage.ts", tbl_body)],
        [p("Local Notifications", tbl_body), p("Expo Notifications", tbl_body), p("57.0.17", tbl_body), p("Actually Used", tbl_body), p("notificationService.ts; AlarmManager channel", tbl_body)],
        [p("Native Alarm Module", tbl_body), p("Custom Kotlin Module", tbl_body), p("Local (SDK 34)", tbl_body), p("Actually Used", tbl_body), p("mobile/modules/exact-alarm/ExactAlarmModule.kt", tbl_body)],
        [p("Backend Framework", tbl_body), p("FastAPI", tbl_body), p("0.141.1", tbl_body), p("Actually Used", tbl_body), p("backend/app/main.py, 38 REST routes", tbl_body)],
        [p("ASGI Web Server", tbl_body), p("Uvicorn (standard)", tbl_body), p("0.52.4", tbl_body), p("Actually Used", tbl_body), p("Process runtime on port 8000", tbl_body)],
        [p("Backend Runtime", tbl_body), p("Python", tbl_body), p("3.13.0rc3", tbl_body), p("Actually Used", tbl_body), p("Virtual environment runtime", tbl_body)],
        [p("Database Driver", tbl_body), p("PyMongo (Async API)", tbl_body), p("4.18.0", tbl_body), p("Actually Used", tbl_body), p("pymongo.AsyncMongoClient in app/db/mongodb.py", tbl_body)],
        [p("Legacy DB Driver", tbl_body), p("Motor", tbl_body), p("Installed (3.6.0)", tbl_body), p("Installed Unused", tbl_body), p("Replaced by official PyMongo Async client", tbl_body)],
        [p("Validation / Settings", tbl_body), p("Pydantic & Settings", tbl_body), p("2.13.5 / 2.15.0", tbl_body), p("Actually Used", tbl_body), p("Pydantic v2 schemas and app/core/config.py", tbl_body)],
        [p("Password Hashing", tbl_body), p("Bcrypt", tbl_body), p("5.0.0 (rounds=12)", tbl_body), p("Actually Used", tbl_body), p("app/core/security.py (hash_password)", tbl_body)],
        [p("Token Security", tbl_body), p("PyJWT", tbl_body), p("2.13.0", tbl_body), p("Actually Used", tbl_body), p("HS256 signed access tokens in app/core/security.py", tbl_body)],
        [p("PDF Generation", tbl_body), p("ReportLab", tbl_body), p("5.0.1", tbl_body), p("Actually Used", tbl_body), p("app/services/pdf_service.py (NumberedCanvas)", tbl_body)],
        [p("Email Engine", tbl_body), p("Standard smtplib / MIME", tbl_body), p("Python 3.13 Stdlib", tbl_body), p("Actually Used", tbl_body), p("app/services/email_service.py (SMTPEmailService)", tbl_body)],
        [p("Automated Testing", tbl_body), p("Pytest & Asyncio", tbl_body), p("9.1.1 / 1.4.0", tbl_body), p("Actually Used", tbl_body), p("385 tests in backend/tests/", tbl_body)],
        [p("Cloud Storage (S3)", tbl_body), p("AWS S3 / Cloudinary", tbl_body), p("N/A", tbl_body), p("Not Implemented", tbl_body), p("PDFs streamed in-memory; no cloud file store", tbl_body)],
        [p("Remote Push (FCM)", tbl_body), p("Firebase / FCM / APNs", tbl_body), p("N/A", tbl_body), p("Not Implemented", tbl_body), p("Reminders are 100% device-side local alarms", tbl_body)],
        [p("Admin Dashboard", tbl_body), p("React Web Admin", tbl_body), p("N/A", tbl_body), p("Not Implemented", tbl_body), p("Only mobile app implemented; no admin portal", tbl_body)],
    ]

    t_tech = Table(tech_data, colWidths=[80, 95, 80, 85, 192])
    t_tech.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_HEADER),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_tech)
    story.append(Spacer(1, 10))

    # =========================================================================
    # 3. ACTORS AND USER ROLES
    # =========================================================================
    story.append(heading1("3. ACTORS AND USER ROLES"))
    story.append(p("The application implements exactly <b>two</b> mutually exclusive user roles in <font name='Courier'>backend/app/schemas/user.py</font> (<font name='Courier'>UserRole(str, Enum)</font>):"))
    
    story.append(heading2("A. Patient (Primary User) — role: 'patient'"))
    story.append(b("<b>Identity:</b> An individual taking prescribed medications who requires adherence scheduling and local reminder alarms."))
    story.append(b("<b>Accessible Screens:</b> Login, Register, Forgot Password, Reset Password, Home Dashboard, Calendar, Prescribed Medicine List, Medicine Detail, Add Medicine, Edit Medicine, Add Schedule, Edit Schedule, Activity History, Caregiver Management, User Profile, Reports Screen, and Dose Alarm Modal."))
    story.append(b("<b>Actions:</b> Full CRUD over own medicines and schedules; records dose actions (Taken, Skipped with reason, Snoozed); links/revokes caregivers; views streaks and adherence; downloads self weekly/monthly adherence PDF reports."))
    story.append(b("<b>Data Scope:</b> Strictly isolated by <font name='Courier'>userId == current_user.id</font>. Cannot view other patients' records."))

    story.append(heading2("B. Caregiver — role: 'caregiver'"))
    story.append(b("<b>Identity:</b> A family member, guardian, or healthcare aide invited by a patient to provide safety oversight."))
    story.append(b("<b>Accessible Screens:</b> Login, Register, Forgot Password, Reset Password, Caregiver Dashboard (Linked Patients list), Patient Monitoring Detail, Caregiver Alerts Screen, User Profile, and Linked Patient Reports Screen."))
    story.append(b("<b>Actions:</b> Views linked patients; inspects patient adherence percentage, streaks, and taken/due dose counts; receives automated alerts for repeated missed doses; marks alerts as read; downloads patient weekly/monthly PDF reports."))
    story.append(b("<b>Permissions Guardrail:</b> Read-only clinical oversight. <b>Caregivers CANNOT create, edit, or delete patient medicines or schedules</b>."))

    story.append(heading2("C. Admin Actor — NOT IMPLEMENTED"))
    story.append(callout("<b>AUDIT CONFIRMATION:</b> There is no 'admin' role in the <font name='Courier'>UserRole</font> enum, no administrative database collection, and no administrative user management endpoints. Any references in academic reports to an 'Admin Portal' or 'System Administrator Role' are <b>DOCUMENTATION ONLY / NOT VERIFIED IN CODE</b>.", bg=colors.HexColor("#FEF2F2"), border_c=ACCENT_RED))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 4. COMPLETE FEATURE INVENTORY
    # =========================================================================
    story.append(heading1("4. COMPLETE FEATURE INVENTORY"))
    story.append(p("Every discrete system capability was inspected against source files, REST endpoints, and database models:"))

    feat_data = [
        [p("ID", tbl_header), p("Feature Name", tbl_header), p("Actor", tbl_header), p("Status", tbl_header), p("Component / Screen", tbl_header), p("API Endpoint", tbl_header), p("DB Collection", tbl_header), p("Evidence Path", tbl_header)],
        [p("F-01", tbl_body), p("Patient/Caregiver Registration", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("RegisterScreen.tsx", tbl_body), p("POST /auth/register", tbl_body), p("users", tbl_body), p("routers/auth.py:44", tbl_body)],
        [p("F-02", tbl_body), p("User Login & JWT Issuance", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("LoginScreen.tsx", tbl_body), p("POST /auth/login", tbl_body), p("users", tbl_body), p("routers/auth.py:102", tbl_body)],
        [p("F-03", tbl_body), p("Password Recovery (OTP)", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("Forgot/ResetPassword", tbl_body), p("POST /auth/forgot/reset", tbl_body), p("users, rate_limits", tbl_body), p("routers/auth.py:270", tbl_body)],
        [p("F-04", tbl_body), p("User Profile & Preferences", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("ProfileScreen.tsx", tbl_body), p("GET/PATCH /auth/profile", tbl_body), p("users", tbl_body), p("routers/auth.py:192", tbl_body)],
        [p("F-05", tbl_body), p("In-App Password Change", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("ChangePasswordModal", tbl_body), p("PATCH /auth/password", tbl_body), p("users", tbl_body), p("routers/auth.py:231", tbl_body)],
        [p("F-06", tbl_body), p("Medicine Inventory CRUD", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("MedicineList/Detail", tbl_body), p("GET/POST/PATCH/DEL /medicines", tbl_body), p("medicines", tbl_body), p("routers/medicines.py:35", tbl_body)],
        [p("F-07", tbl_body), p("Medication Scheduling", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("Add/EditScheduleScreen", tbl_body), p("GET/POST/PATCH/DEL /schedules", tbl_body), p("medication_schedules", tbl_body), p("routers/schedules.py:36", tbl_body)],
        [p("F-08", tbl_body), p("Local Reminder Scheduling", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("notificationService.ts", tbl_body), p("Client AlarmManager", tbl_body), p("N/A (Device)", tbl_body), p("notificationService.ts:162", tbl_body)],
        [p("F-09", tbl_body), p("Dose Alarm & Modal Display", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("DoseAlarmModal.tsx", tbl_body), p("Foreground Notification", tbl_body), p("N/A (UI)", tbl_body), p("MainAppNavigator.tsx:90", tbl_body)],
        [p("F-10", tbl_body), p("Take Dose Action", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("DoseActionCard/Modal", tbl_body), p("POST /medication-activities", tbl_body), p("medication_activities", tbl_body), p("routers/activities.py:43", tbl_body)],
        [p("F-11", tbl_body), p("Snooze Dose (10 min)", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("DoseActionCard/Modal", tbl_body), p("POST /medication-activities", tbl_body), p("medication_activities", tbl_body), p("notificationService.ts:310", tbl_body)],
        [p("F-12", tbl_body), p("Skip Dose & Reason Record", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("DoseActionModal.tsx", tbl_body), p("POST /medication-activities", tbl_body), p("medication_activities", tbl_body), p("schemas/activity.py:36", tbl_body)],
        [p("F-13", tbl_body), p("Dose Activity History", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("ActivityHistoryScreen", tbl_body), p("GET /medication-activities", tbl_body), p("medication_activities", tbl_body), p("routers/activities.py:106", tbl_body)],
        [p("F-14", tbl_body), p("Adherence Calculation", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("HomeScreen.tsx", tbl_body), p("GET /activities/summary", tbl_body), p("activities, schedules", tbl_body), p("routers/activities.py:180", tbl_body)],
        [p("F-15", tbl_body), p("Interactive Calendar View", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("CalendarScreen.tsx", tbl_body), p("GET /medication-calendar", tbl_body), p("medicines, schedules", tbl_body), p("adherence_service.py:39", tbl_body)],
        [p("F-16", tbl_body), p("Non-Fabricated Streak", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("HomeScreen / Calendar", tbl_body), p("GET /calendar/streaks", tbl_body), p("activities, schedules", tbl_body), p("adherence_service.py:206", tbl_body)],
        [p("F-17", tbl_body), p("Caregiver Invitation", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("CaregiverManagement", tbl_body), p("POST/DEL /caregivers", tbl_body), p("caregivers", tbl_body), p("routers/caregivers.py:44", tbl_body)],
        [p("F-18", tbl_body), p("Caregiver Patient Monitor", tbl_body), p("Caregiver", tbl_body), p("YES", tbl_body), p("CaregiverDashboard", tbl_body), p("GET /caregivers/patients", tbl_body), p("caregivers, users", tbl_body), p("routers/caregivers.py:171", tbl_body)],
        [p("F-19", tbl_body), p("Missed Dose Detection", tbl_body), p("System", tbl_body), p("YES", tbl_body), p("missed_dose_rules.py", tbl_body), p("POST /activities evaluation", tbl_body), p("activities, schedules", tbl_body), p("missed_dose_rules.py:100", tbl_body)],
        [p("F-20", tbl_body), p("Caregiver Alert Dispatch", tbl_body), p("Caregiver", tbl_body), p("YES", tbl_body), p("CaregiverAlertsScreen", tbl_body), p("GET /caregivers/alerts", tbl_body), p("notifications", tbl_body), p("caregiver_alert_service.py", tbl_body)],
        [p("F-21", tbl_body), p("PDF Adherence Reports", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("ReportsScreen.tsx", tbl_body), p("GET /reports/weekly/monthly/pdf", tbl_body), p("In-memory render", tbl_body), p("services/pdf_service.py:84", tbl_body)],
        [p("F-22", tbl_body), p("Email Delivery Service", tbl_body), p("Both", tbl_body), p("YES", tbl_body), p("services/email_service.py", tbl_body), p("Internal / Cron Automation", tbl_body), p("scheduled_report_deliveries", tbl_body), p("email_service.py:146", tbl_body)],
        [p("F-23", tbl_body), p("Exact Alarm Settings Link", tbl_body), p("Patient", tbl_body), p("YES", tbl_body), p("NotificationStatusCard", tbl_body), p("Native Android Intent", tbl_body), p("N/A (OS)", tbl_body), p("ExactAlarmModule.kt:29", tbl_body)],
        [p("F-24", tbl_body), p("Prescription Image OCR", tbl_body), p("Patient", tbl_body), p("NO", tbl_body), p("Not Implemented", tbl_body), p("No endpoint", tbl_body), p("None", tbl_body), p("Codebase audit", tbl_body)],
        [p("F-25", tbl_body), p("System Admin Web Portal", tbl_body), p("Admin", tbl_body), p("NO", tbl_body), p("Not Implemented", tbl_body), p("No endpoint", tbl_body), p("None", tbl_body), p("Codebase audit", tbl_body)],
    ]

    t_feat = Table(feat_data, colWidths=[24, 96, 42, 34, 88, 96, 76, 76])
    t_feat.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_HEADER),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_feat)
    story.append(Spacer(1, 10))

    # =========================================================================
    # 5. SCREEN INVENTORY
    # =========================================================================
    story.append(heading1("5. SCREEN-BY-SCREEN UI INVENTORY"))
    story.append(p("The mobile application contains exactly <b>18 active screens and interactive modal dialogs</b> in <font name='Courier'>mobile/src/screens/</font> and <font name='Courier'>mobile/src/components/</font>:"))

    screens_data = [
        [p("Screen Name", tbl_header), p("File Path", tbl_header), p("Actor", tbl_header), p("Purpose & Key Data Displayed", tbl_header), p("Primary API Calls", tbl_header)],
        [p("LoginScreen", tbl_body), p("screens/auth/LoginScreen.tsx", tbl_body), p("Both", tbl_body), p("Email/password entry, role detection, error handling", tbl_body), p("POST /auth/login", tbl_body)],
        [p("RegisterScreen", tbl_body), p("screens/auth/RegisterScreen.tsx", tbl_body), p("Both", tbl_body), p("Account creation with role toggle (Patient/Caregiver)", tbl_body), p("POST /auth/register", tbl_body)],
        [p("ForgotPasswordScreen", tbl_body), p("screens/auth/ForgotPasswordScreen.tsx", tbl_body), p("Both", tbl_body), p("Request 6-digit OTP verification code via email", tbl_body), p("POST /auth/forgot-password", tbl_body)],
        [p("ResetPasswordScreen", tbl_body), p("screens/auth/ResetPasswordScreen.tsx", tbl_body), p("Both", tbl_body), p("Enter OTP code and configure new password (min 8 chars)", tbl_body), p("POST /auth/reset-password", tbl_body)],
        [p("HomeScreen (Dashboard)", tbl_body), p("screens/main/HomeScreen.tsx", tbl_body), p("Patient", tbl_body), p("Adherence gauge, active streak, today's dose schedule cards", tbl_body), p("GET /activities/summary, /calendar/streaks", tbl_body)],
        [p("MedicineListScreen", tbl_body), p("screens/medicines/MedicineListScreen.tsx", tbl_body), p("Patient", tbl_body), p("Prescribed drug cards, search filter, inventory badges", tbl_body), p("GET /medicines", tbl_body)],
        [p("MedicineDetailScreen", tbl_body), p("screens/medicines/MedicineDetailScreen.tsx", tbl_body), p("Patient", tbl_body), p("Drug dosage, schedules, instructions, stock refill alert", tbl_body), p("GET /medicines/{id}, /schedules", tbl_body)],
        [p("AddMedicineScreen", tbl_body), p("screens/medicines/AddMedicineScreen.tsx", tbl_body), p("Patient", tbl_body), p("Form: name, dosage, unit, frequency, inventory stock", tbl_body), p("POST /medicines", tbl_body)],
        [p("EditMedicineScreen", tbl_body), p("screens/medicines/EditMedicineScreen.tsx", tbl_body), p("Patient", tbl_body), p("Edit drug properties and refill inventory levels", tbl_body), p("PATCH /medicines/{id}", tbl_body)],
        [p("AddScheduleScreen", tbl_body), p("screens/schedules/AddScheduleScreen.tsx", tbl_body), p("Patient", tbl_body), p("Time picker, frequency (daily, weekly, custom), days", tbl_body), p("POST /schedules", tbl_body)],
        [p("EditScheduleScreen", tbl_body), p("screens/schedules/EditScheduleScreen.tsx", tbl_body), p("Patient", tbl_body), p("Modify reminder time, disable/enable schedule", tbl_body), p("PATCH /schedules/{id}", tbl_body)],
        [p("ActivityHistoryScreen", tbl_body), p("screens/activities/ActivityHistoryScreen.tsx", tbl_body), p("Patient", tbl_body), p("Chronological audit log: Taken, Skipped, Snoozed", tbl_body), p("GET /medication-activities", tbl_body)],
        [p("CalendarScreen", tbl_body), p("screens/calendar/CalendarScreen.tsx", tbl_body), p("Patient", tbl_body), p("Monthly grid with colored adherence dots and day summary", tbl_body), p("GET /medication-calendar", tbl_body)],
        [p("CaregiverManagementScreen", tbl_body), p("screens/caregivers/CaregiverManagementScreen.tsx", tbl_body), p("Patient", tbl_body), p("List designated caregivers, invite by email, revoke access", tbl_body), p("GET/POST/DELETE /caregivers", tbl_body)],
        [p("CaregiverDashboardScreen", tbl_body), p("screens/caregivers/CaregiverDashboardScreen.tsx", tbl_body), p("Caregiver", tbl_body), p("List active linked patients with real-time adherence %", tbl_body), p("GET /caregivers/patients", tbl_body)],
        [p("PatientMonitoringDetail", tbl_body), p("screens/caregivers/PatientMonitoringDetailScreen.tsx", tbl_body), p("Caregiver", tbl_body), p("Clinical overview: patient streak, doses, report download", tbl_body), p("GET /caregivers/patients/{id}/summary", tbl_body)],
        [p("CaregiverAlertsScreen", tbl_body), p("screens/caregivers/CaregiverAlertsScreen.tsx", tbl_body), p("Caregiver", tbl_body), p("High-priority repeated missed-dose alerts, mark read", tbl_body), p("GET/PATCH /caregivers/alerts", tbl_body)],
        [p("ProfileScreen", tbl_body), p("screens/profile/ProfileScreen.tsx", tbl_body), p("Both", tbl_body), p("Personal info, notification preferences, logout button", tbl_body), p("GET/PATCH /auth/profile", tbl_body)],
        [p("ReportsScreen", tbl_body), p("screens/reports/ReportsScreen.tsx", tbl_body), p("Both", tbl_body), p("Weekly/monthly adherence graphs, PDF export/share", tbl_body), p("GET /reports/weekly, /monthly/pdf", tbl_body)],
        [p("DoseAlarmModal (Component)", tbl_body), p("components/activities/DoseAlarmModal.tsx", tbl_body), p("Patient", tbl_body), p("Full-screen takeover modal when local reminder fires", tbl_body), p("POST /medication-activities", tbl_body)],
        [p("DoseActionModal (Component)", tbl_body), p("components/activities/DoseActionModal.tsx", tbl_body), p("Patient", tbl_body), p("Action sheet for Take, Snooze (10m), or Skip with reason", tbl_body), p("POST /medication-activities", tbl_body)],
    ]

    t_screens = Table(screens_data, colWidths=[95, 120, 45, 162, 110])
    t_screens.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_HEADER),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_screens)
    story.append(Spacer(1, 10))

    # =========================================================================
    # 6. BACKEND API INVENTORY
    # =========================================================================
    story.append(heading1("6. BACKEND API INVENTORY"))
    story.append(p("FastAPI dynamically registers exactly <b>38 unique route paths across 9 modular routers</b>:"))

    api_summary_data = [
        [p("Router Module", tbl_header), p("Prefix", tbl_header), p("Endpoints", tbl_header), p("Actor Access", tbl_header), p("Core Functional Scope", tbl_header)],
        [p("HealthRouter", tbl_body), p("/api/v1/health & /", tbl_body), p("3 routes", tbl_body), p("Public", tbl_body), p("Database ping, service uptime, medical disclaimer", tbl_body)],
        [p("AuthRouter", tbl_body), p("/api/v1/auth", tbl_body), p("7 routes", tbl_body), p("Public / Authenticated", tbl_body), p("Register, login, me, profile update, password change, OTP reset", tbl_body)],
        [p("MedicineRouter", tbl_body), p("/api/v1/medicines", tbl_body), p("5 routes", tbl_body), p("Patient Only", tbl_body), p("CRUD operations on prescribed medicines, inventory tracking", tbl_body)],
        [p("ScheduleRouter", tbl_body), p("/api/v1/schedules", tbl_body), p("5 routes", tbl_body), p("Patient Only", tbl_body), p("CRUD on reminder schedules (Daily, Weekly, Custom)", tbl_body)],
        [p("ActivityRouter", tbl_body), p("/api/v1/medication-activities", tbl_body), p("5 routes", tbl_body), p("Patient Only", tbl_body), p("Log dose action (Take/Skip/Snooze), history audit, adherence", tbl_body)],
        [p("CalendarRouter", tbl_body), p("/api/v1/medication-calendar", tbl_body), p("2 routes", tbl_body), p("Patient Only", tbl_body), p("Occurrence aggregation, monthly day-status grid, streaks", tbl_body)],
        [p("CaregiverRouter", tbl_body), p("/api/v1/caregivers", tbl_body), p("7 routes", tbl_body), p("Patient & Caregiver", tbl_body), p("Link/revoke caregivers, patient monitoring summary, alerts", tbl_body)],
        [p("ReportRouter", tbl_body), p("/api/v1/reports", tbl_body), p("8 routes", tbl_body), p("Patient & Caregiver", tbl_body), p("Weekly & monthly adherence JSON summaries and ReportLab PDFs", tbl_body)],
        [p("NotificationRouter", tbl_body), p("/api/v1/notifications", tbl_body), p("4 routes", tbl_body), p("Authenticated", tbl_body), p("In-app notifications storage, unread count, mark-read", tbl_body)],
    ]
    t_api_sum = Table(api_summary_data, colWidths=[85, 105, 55, 95, 192])
    t_api_sum.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_HEADER),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_api_sum)
    story.append(Spacer(1, 10))

    # =========================================================================
    # 7. DATABASE / MONGODB INVENTORY
    # =========================================================================
    story.append(heading1("7. DATABASE / MONGODB INVENTORY"))
    story.append(p("The persistence layer in <font name='Courier'>backend/app/db/mongodb.py</font> utilizes <b>8 canonical collections</b> with enforced indexes:"))

    db_data = [
        [p("Collection Name", tbl_header), p("Primary Key", tbl_header), p("Foreign References", tbl_header), p("Configured MongoDB Indexes", tbl_header), p("Core Business Purpose", tbl_header)],
        [p("users", tbl_body), p("_id (ObjectId)", tbl_body), p("None", tbl_body), p("• email (ASC, UNIQUE)", tbl_body), p("User accounts, Bcrypt hashes, roles, notification preferences", tbl_body)],
        [p("medicines", tbl_body), p("_id (ObjectId)", tbl_body), p("userId -> users._id", tbl_body), p("• userId (ASC)<br/>• name (ASC)<br/>• compound (userId, name)", tbl_body), p("Prescribed medications, dosage, inventory, refill thresholds", tbl_body)],
        [p("medication_schedules", tbl_body), p("_id (ObjectId)", tbl_body), p("userId -> users._id<br/>medicineId -> medicines._id", tbl_body), p("• userId (ASC)<br/>• medicineId (ASC)<br/>• compound (userId, enabled)", tbl_body), p("Recurrence timing rules (Daily, Weekly, Custom dates)", tbl_body)],
        [p("medication_activities", tbl_body), p("_id (ObjectId)", tbl_body), p("userId, medicineId, scheduleId", tbl_body), p("• userId (ASC)<br/>• scheduledDate (ASC)<br/>• compound (userId, date, schedId, time)", tbl_body), p("Dose action event logs (Taken, Skipped with reason, Snoozed)", tbl_body)],
        [p("caregivers", tbl_body), p("_id (ObjectId)", tbl_body), p("patientId -> users._id", tbl_body), p("• patientId (ASC)<br/>• caregiverEmail (ASC)<br/>• compound (patientId, email, UNIQUE)", tbl_body), p("Patient-caregiver relationship mappings and active/revoked status", tbl_body)],
        [p("notifications", tbl_body), p("_id (ObjectId)", tbl_body), p("userId, patientId, caregiverId", tbl_body), p("• compound (userId, status)<br/>• compound (caregiverId, fingerprint, UNIQUE)", tbl_body), p("In-app notifications and deduplicated missed-dose caregiver alerts", tbl_body)],
        [p("scheduled_report_deliveries", tbl_body), p("_id (ObjectId)", tbl_body), p("recipientUserId, patientId", tbl_body), p("• deliveryKey (ASC, UNIQUE)", tbl_body), p("Atomic tracking of scheduled weekly/monthly email report deliveries", tbl_body)],
        [p("rate_limits", tbl_body), p("_id (ObjectId)", tbl_body), p("None (identifier string)", tbl_body), p("• expiresAt (ASC, TTL: expireAfterSeconds=0)", tbl_body), p("Sliding-window abuse protection for OTP password recovery", tbl_body)],
    ]
    t_db = Table(db_data, colWidths=[90, 60, 100, 130, 152])
    t_db.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_HEADER),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_db)
    story.append(Spacer(1, 10))

    # =========================================================================
    # 8. AUTHENTICATION & SECURITY
    # =========================================================================
    story.append(heading1("8. AUTHENTICATION AND AUTHORIZATION ARCHITECTURE"))
    story.append(p("<b>1. Password Hashing:</b> Plaintext passwords are salted and hashed using Bcrypt with 12 computational rounds (<font name='Courier'>bcrypt.gensalt(rounds=12)</font>). Minimum registration password length is 6 characters; password reset requires minimum 8 characters."))
    story.append(p("<b>2. Stateless JWT Session Tokens:</b> Upon successful login, the backend issues an HS256 signed JSON Web Token containing subject (<font name='Courier'>sub: str(user_id)</font>), issued-at (<font name='Courier'>iat</font>), and expiration (<font name='Courier'>exp</font>, default 7 days)."))
    story.append(p("<b>3. Mobile Hardware Persistence:</b> Mobile client stores the JWT in Android hardware-backed Keystore via <font name='Courier'>expo-secure-store</font>. The token is automatically attached to outgoing Axios requests via an HTTP request interceptor (<font name='Courier'>Authorization: Bearer &lt;token&gt;</font>)."))
    story.append(p("<b>4. Route Protection & RBAC:</b> FastAPI dependency <font name='Courier'>get_current_active_user</font> validates token signature and looks up active account. Specific routes enforce role restrictions via <font name='Courier'>require_role(UserRole.PATIENT)</font> and <font name='Courier'>require_role(UserRole.CAREGIVER)</font>."))
    story.append(p("<b>5. Password Recovery Protection:</b> 6-digit OTP verification codes are hashed before storage using HMAC-SHA256 with a server-side pepper (<font name='Courier'>RESET_TOKEN_PEPPER</font>). Failed validation attempts are capped at 5, OTP expires in 15 minutes, and requests are rate-limited to 3 per hour via MongoDB TTL indexes."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 9. MEDICATION WORKFLOW TRACE
    # =========================================================================
    story.append(heading1("9. MEDICATION WORKFLOW — END-TO-END TRACE"))
    story.append(p("The entire medication lifecycle operates through 15 integrated steps:"))
    story.append(b("<b>1. Medicine Creation:</b> Patient enters drug name, strength, dosage unit, and inventory stock in AddMedicineScreen (<font name='Courier'>POST /api/v1/medicines</font>)."))
    story.append(b("<b>2. Schedule Creation:</b> Patient links reminder schedule (e.g., 08:00 Daily) in AddScheduleScreen (<font name='Courier'>POST /api/v1/schedules</font>)."))
    story.append(b("<b>3. Reminder Generation:</b> Client notification service triggers <font name='Courier'>autoSync()</font>, schedules exact local alarms via <font name='Courier'>expo-notifications</font> on Android channel <font name='Courier'>medication-reminders</font>."))
    story.append(b("<b>4. Reminder Display:</b> At scheduled intake time, Android system fires MAX importance alarm banner and audio. If app is foregrounded, <font name='Courier'>DoseAlarmModal</font> takes over the screen."))
    story.append(b("<b>5. Taken Action:</b> Patient taps 'Take Dose'. Client sends <font name='Courier'>POST /medication-activities</font> with <font name='Courier'>action='Taken'</font>. Medicine inventory decrements by dose quantity."))
    story.append(b("<b>6. Snooze Action:</b> Patient taps 'Snooze'. Activity recorded as <font name='Courier'>action='Snoozed'</font>. Client schedules local one-shot reminder +600s (10 min)."))
    story.append(b("<b>7. Skip Action:</b> Patient taps 'Skip Dose'. System opens modal requiring a non-empty skip reason."))
    story.append(b("<b>8. Skip Reason Recording:</b> Reason (e.g. 'Fasting for blood test', 'Side effects / Nausea') is validated (<font name='Courier'>min_length=1</font>) and stored in <font name='Courier'>skipReason</font>."))
    story.append(b("<b>9. Medication Activity Storage:</b> Recorded in <font name='Courier'>medication_activities</font> collection with compound unique index key."))
    story.append(b("<b>10. History Display:</b> ActivityHistoryScreen displays chronological dose event cards with color badges."))
    story.append(b("<b>11. Adherence Calculation:</b> Dashboard recalculates adherence: (Taken / Expected) * 100%."))
    story.append(b("<b>12. Calendar Aggregation:</b> CalendarScreen aggregates day-level statuses (complete, partial, missed)."))
    story.append(b("<b>13. Streak Computation:</b> Streak engine verifies consecutive adherent days backwards from today."))
    story.append(b("<b>14. Missed Dose Detection:</b> On activity logging or evaluation, <font name='Courier'>missed_dose_rules.py</font> checks Rule A (>=2 missed in 24h) and Rule B (2 consecutive missed)."))
    story.append(b("<b>15. Caregiver Alert Notification:</b> If qualified, an alert is deduplicated and inserted into <font name='Courier'>notifications</font> for the caregiver."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 10. NOTIFICATION SYSTEM
    # =========================================================================
    story.append(heading1("10. NOTIFICATION SYSTEM AUDIT"))
    story.append(evidence_box("Reminders are 100% device-side local alarms. No remote push server (FCM/APNs) is used.", "mobile/src/services/notificationService.ts:162", "VERIFIED"))
    story.append(Spacer(1, 4))
    story.append(p("<b>Android Notification Channel Settings:</b>"))
    story.append(b("<b>Channel ID:</b> <font name='Courier'>medication-reminders</font> &nbsp;|&nbsp; <b>Name:</b> 'Medication Reminders'"))
    story.append(b("<b>Importance:</b> <font name='Courier'>AndroidImportance.MAX</font> (Heads-up visual banner presentation)"))
    story.append(b("<b>Audio Stream:</b> <font name='Courier'>AndroidAudioUsage.ALARM</font> (Overrides media stream; respects alarm volume)"))
    story.append(b("<b>Vibration:</b> Pattern <font name='Courier'>[0, 500, 250, 500, 250, 500, 250, 500]</font>"))
    story.append(b("<b>Lockscreen & DND:</b> <font name='Courier'>AndroidNotificationVisibility.PUBLIC</font>, <font name='Courier'>bypassDnd=True</font>"))
    story.append(p("<b>Android 14 Exact Alarm Support:</b> Custom native Kotlin module <font name='Courier'>exact-alarm</font> queries <font name='Courier'>AlarmManager.canScheduleExactAlarms()</font>. If not granted, <font name='Courier'>NotificationStatusCard</font> presents a warning and deep-links directly to Android System Settings via <font name='Courier'>ACTION_REQUEST_SCHEDULE_EXACT_ALARM</font>."))
    story.append(p("<b>Empirical Platform Limitation:</b> Android OS Doze Mode and deep sleep restrictions may defer alarm delivery on certain OEM battery optimization profiles without foreground service execution (<font name='Courier'>TC-NOTIF-009</font>)."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 11. CAREGIVER WORKFLOW
    # =========================================================================
    story.append(heading1("11. CAREGIVER WORKFLOW"))
    story.append(p("<b>1. Caregiver Association:</b> Patient registers caregiver details (name, email, phone, relationship) via <font name='Courier'>POST /api/v1/caregivers</font>. Status defaults to <font name='Courier'>'active'</font>."))
    story.append(p("<b>2. Caregiver Onboarding:</b> The caregiver creates an independent account with <font name='Courier'>role='caregiver'</font> using the matching email address."))
    story.append(p("<b>3. Missed-Dose Alert Rules:</b> Evaluated in <font name='Courier'>backend/app/services/missed_dose_rules.py</font>:"))
    story.append(b("<b>Rule A (Rolling 24h Threshold):</b> Triggers when at least 2 scheduled doses across the patient's entire regimen are classified as MISSED within a rolling 24-hour window (<font name='Courier'>CAREGIVER_MISSED_THRESHOLD = 2</font>)."))
    story.append(b("<b>Rule B (Consecutive Drug Omission):</b> Triggers when the SAME medicine is missed on 2 consecutive scheduled occurrences."))
    story.append(b("<b>Deduplication:</b> Alerts are fingerprinted using a hash of <font name='Courier'>(caregiverId, patientId, medicineId, occurrenceKeys)</font> and constrained by a unique partial index in the <font name='Courier'>notifications</font> collection."))
    story.append(p("<b>4. Monitoring & Clinical PDF Access:</b> Caregivers view patient adherence percentages and download weekly and monthly clinical PDF summaries via <font name='Courier'>GET /api/v1/reports/patients/{patientId}/weekly/pdf</font>."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 12. DASHBOARD, ANALYTICS, CALENDAR & STREAK
    # =========================================================================
    story.append(heading1("12. DASHBOARD, ANALYTICS, CALENDAR & STREAK"))
    story.append(p("<b>1. Adherence Percentage Formula:</b> Implemented in <font name='Courier'>backend/app/routers/activities.py:228</font>:"))
    story.append(callout("<b>Adherence % = (Total Taken Doses / Total Expected Scheduled Doses) * 100.0</b><br/>"
                         "• Bounded strictly in range [0.0%, 100.0%].<br/>"
                         "• If expected scheduled doses == 0, defaults to 100.0% (neutral baseline).<br/>"
                         "• Formulas are transparent and non-fabricated; no artificial bonus points are applied."))
    story.append(Spacer(1, 4))
    story.append(p("<b>2. Streak Calculation Engine:</b> Implemented in <font name='Courier'>backend/app/services/adherence_service.py:206</font>:"))
    story.append(b("A day is considered <b>scheduled</b> if expected scheduled doses > 0."))
    story.append(b("A day is considered <b>adherent</b> if and only if <font name='Courier'>taken_doses == expected_doses</font>."))
    story.append(b("<b>Current Streak:</b> Evaluated backwards from today. If today has pending doses (not skipped), the streak evaluates backwards from yesterday to prevent unfairly breaking an active streak in the morning."))
    story.append(b("<b>Streak Reset:</b> A skipped dose immediately breaks the active streak to 0."))
    story.append(b("<b>Longest Streak:</b> Maximum consecutive adherent days across the patient's entire evaluated history (up to 180 days)."))
    story.append(p("<b>3. Calendar Statuses:</b> Calendar days are categorized as <font name='Courier'>'complete'</font> (all taken), <font name='Courier'>'partial'</font> (some taken, none skipped), <font name='Courier'>'missed'</font> (skipped or missed), <font name='Courier'>'future'</font>, or <font name='Courier'>'none'</font>."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 13. REPORT, EMAIL, PDF & IMAGE FEATURES
    # =========================================================================
    story.append(heading1("13. REPORTS, PDF, EMAIL, FILES & IMAGE FEATURES"))
    story.append(p("<b>1. PDF Adherence Reports:</b> Built with ReportLab 5.0.1 in <font name='Courier'>backend/app/services/pdf_service.py</font>. Generates clinical documents containing patient demographics, adherence gauge metrics, streak analysis, medicine breakdown tables, daily activity audit logs, confidential footers, and mandatory medical disclaimers."))
    story.append(p("<b>2. Memory-Stream Delivery:</b> PDF files are rendered in-memory (<font name='Courier'>io.BytesIO()</font>) and streamed over HTTP with <font name='Courier'>Content-Type: application/pdf</font>. Zero files are written to server disk or cloud storage."))
    story.append(p("<b>3. Email Delivery Engine:</b> Implemented in <font name='Courier'>backend/app/services/email_service.py</font> using standard library <font name='Courier'>smtplib</font> and <font name='Courier'>email.mime</font>. Supports <font name='Courier'>MockEmailService</font> (for deterministic offline testing) and <font name='Courier'>SMTPEmailService</font> (for production SMTP relay with TLS/SSL)."))
    story.append(p("<b>4. Image & File Upload Status:</b> <b>NOT IMPLEMENTED</b>. Medication shapes, routes, and colors use SVG/vector icons (<font name='Courier'>@expo/vector-icons</font>); no prescription photo uploads or cloud object storage services (S3/Cloudinary) exist in code."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 14. SYSTEM ARCHITECTURE FLOW
    # =========================================================================
    story.append(heading1("14. SYSTEM ARCHITECTURE"))
    story.append(p("The runtime architecture consists strictly of the following verified flow:"))
    story.append(callout(
        "<b>END-TO-END DATA FLOW:</b><br/>"
        "User (Patient / Caregiver)<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;↓ Touch Interactions / Local Alarm Tap<br/>"
        "React Native Mobile App (Expo SDK 57 / Hermes JS Engine)<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;↓ Native Kotlin ExactAlarm Module &lt;--&gt; Android OS AlarmManager<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;↓ Axios HTTP Client (Bearer JWT attached via interceptor)<br/>"
        "REST API Interface (JSON over HTTP/HTTPS on Port 8000)<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;↓ FastAPI ASGI Application (Python 3.13 / Uvicorn Server)<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;↓ Pydantic v2 Schema Validation &amp; RBAC Auth Dependencies<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;↓ Domain Services (Adherence Engine, Missed Dose Rules, PDF, Email)<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;↓ Official PyMongo Async Driver (Connection Pool &amp; Index Setup)<br/>"
        "MongoDB Atlas (Replica Set Document Database / 8 Collections)"
    ))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 15. USE CASE MASTER LIST
    # =========================================================================
    story.append(heading1("15. USE CASE MASTER LIST"))
    story.append(p("The following 17 formal use cases represent the complete implemented functional specification:"))

    uc_data = [
        [p("UC ID", tbl_header), p("Use Case Name", tbl_header), p("Actor", tbl_header), p("Preconditions", tbl_header), p("Postconditions & Implementation Evidence", tbl_header)],
        [p("UC-01", tbl_body), p("Register User Account", tbl_body), p("Patient / Caregiver", tbl_body), p("App installed, network available", tbl_body), p("User document created in DB with Bcrypt hash; routers/auth.py:44", tbl_body)],
        [p("UC-02", tbl_body), p("User Authentication", tbl_body), p("Patient / Caregiver", tbl_body), p("Registered account exists", tbl_body), p("JWT token issued and stored in SecureStore; routers/auth.py:102", tbl_body)],
        [p("UC-03", tbl_body), p("Recover Forgotten Password", tbl_body), p("Patient / Caregiver", tbl_body), p("Account exists, email valid", tbl_body), p("OTP generated, hashed, verified; password reset; routers/auth.py:270", tbl_body)],
        [p("UC-04", tbl_body), p("Manage User Profile", tbl_body), p("Patient / Caregiver", tbl_body), p("Authenticated session", tbl_body), p("Profile fields and notification preferences updated; routers/auth.py:192", tbl_body)],
        [p("UC-05", tbl_body), p("Manage Prescribed Medicines", tbl_body), p("Patient", tbl_body), p("Authenticated patient", tbl_body), p("Medicine CRUD completed; inventory tracked; routers/medicines.py:35", tbl_body)],
        [p("UC-06", tbl_body), p("Configure Medication Schedule", tbl_body), p("Patient", tbl_body), p("Medicine created", tbl_body), p("Schedule saved; local alarms synced; routers/schedules.py:36", tbl_body)],
        [p("UC-07", tbl_body), p("Receive Medication Reminder", tbl_body), p("Patient", tbl_body), p("Schedule active, alarm due", tbl_body), p("Alarm banner/sound triggered; notificationService.ts:162", tbl_body)],
        [p("UC-08", tbl_body), p("Record Taken Dose Action", tbl_body), p("Patient", tbl_body), p("Reminder due or active", tbl_body), p("Activity logged; inventory stock decremented; routers/activities.py:43", tbl_body)],
        [p("UC-09", tbl_body), p("Snooze Medication Reminder", tbl_body), p("Patient", tbl_body), p("Reminder active", tbl_body), p("Snooze activity logged; 10m reminder scheduled; notificationService.ts:310", tbl_body)],
        [p("UC-10", tbl_body), p("Skip Dose with Clinical Reason", tbl_body), p("Patient", tbl_body), p("Reminder active", tbl_body), p("Skipped activity logged with validated reason; schemas/activity.py:36", tbl_body)],
        [p("UC-11", tbl_body), p("Inspect Activity History Log", tbl_body), p("Patient", tbl_body), p("Authenticated patient", tbl_body), p("Chronological audit log retrieved; routers/activities.py:106", tbl_body)],
        [p("UC-12", tbl_body), p("View Medication Calendar", tbl_body), p("Patient", tbl_body), p("Active regimen exists", tbl_body), p("Occurrences and day-status dots rendered; adherence_service.py:39", tbl_body)],
        [p("UC-13", tbl_body), p("Track Adherence Streak", tbl_body), p("Patient", tbl_body), p("Historical activity exists", tbl_body), p("Non-fabricated current/longest streak displayed; adherence_service.py:206", tbl_body)],
        [p("UC-14", tbl_body), p("Manage Caregivers", tbl_body), p("Patient", tbl_body), p("Authenticated patient", tbl_body), p("Caregiver invited by email or revoked; routers/caregivers.py:44", tbl_body)],
        [p("UC-15", tbl_body), p("Monitor Linked Patients", tbl_body), p("Caregiver", tbl_body), p("Caregiver linked to patient", tbl_body), p("Patient adherence metrics and streaks monitored; routers/caregivers.py:171", tbl_body)],
        [p("UC-16", tbl_body), p("Receive Missed-Dose Alerts", tbl_body), p("Caregiver", tbl_body), p("Patient missed >=2 doses", tbl_body), p("Deduplicated alert delivered to caregiver; missed_dose_rules.py:100", tbl_body)],
        [p("UC-17", tbl_body), p("Export Adherence PDF Report", tbl_body), p("Patient / Caregiver", tbl_body), p("Activity history exists", tbl_body), p("ReportLab PDF generated and streamed; services/pdf_service.py:84", tbl_body)],
    ]
    t_uc = Table(uc_data, colWidths=[38, 115, 75, 110, 194])
    t_uc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_HEADER),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_uc)
    story.append(Spacer(1, 10))

    # =========================================================================
    # 16-21. UML, ERD & DATA DICTIONARY SPECIFICATIONS
    # =========================================================================
    story.append(heading1("16. UML & DESIGN SPECIFICATIONS"))
    story.append(p("<b>A. Class Diagram Master Entities:</b>"))
    story.append(b("<b>Domain Entities:</b> <font name='Courier'>User</font>, <font name='Courier'>Medicine</font>, <font name='Courier'>MedicationSchedule</font>, <font name='Courier'>MedicationActivity</font>, <font name='Courier'>Caregiver</font>, <font name='Courier'>Notification</font>, <font name='Courier'>ScheduledReportDelivery</font>."))
    story.append(b("<b>Service Classes:</b> <font name='Courier'>PdfService</font>, <font name='Courier'>EmailServiceInterface</font> (<font name='Courier'>MockEmailService</font>, <font name='Courier'>SMTPEmailService</font>), <font name='Courier'>MissedDoseRuleEvaluator</font>, <font name='Courier'>CaregiverAlertService</font>, <font name='Courier'>AdherenceService</font>."))
    story.append(b("<b>Relationships:</b> User 1--* Medicine; Medicine 1--* MedicationSchedule; MedicationSchedule 1--* MedicationActivity; User (Patient) 1--* Caregiver; User 1--* Notification."))

    story.append(heading2("B. Deployment Diagram Master Nodes"))
    story.append(b("<b>Node 1: Mobile Device (Android 14)</b> — Runtime: React Native / Hermes Engine / Native Kotlin ExactAlarm Module. Communicates via HTTPS."))
    story.append(b("<b>Node 2: Application Server (FastAPI / Uvicorn)</b> — Runtime: Python 3.13 ASGI on port 8000. Handles validation, auth, and business logic."))
    story.append(b("<b>Node 3: Database Server (MongoDB Atlas)</b> — Cloud replica set database. Communicates via MongoDB Wire Protocol over TLS on port 27017."))
    story.append(b("<b>Node 4: Mail Relay Server (SMTP Server)</b> — Standard SMTP host on port 587/465 with STARTTLS."))

    story.append(heading2("C. Conceptual ERD vs. Document Model Representation"))
    story.append(callout("<b>ACADEMIC ERD GUIDANCE:</b> In academic reports, represent MediTrack+ using standard Entity-Relationship notation (Entities, Attributes, Primary Keys, Foreign References, and Cardinality). Explicitly state that while the conceptual model is relational-compatible, the physical implementation uses <b>MongoDB Atlas Document Collections</b> with BSON ObjectIds serving as logical foreign reference pointers."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 22-25. TESTING, VALIDATION & GAP ANALYSIS
    # =========================================================================
    story.append(heading1("22. TESTING EVIDENCE & VERIFICATION AUDIT"))
    story.append(p("<b>1. Automated Pytest Suite:</b> 385 automated test cases collected across 24 test files in <font name='Courier'>backend/tests/</font>. Under static milestone commit <font name='Courier'>6a0b085</font>, all 385 passed. At current dynamic runtime, 382 pass, with 3 calendar boundary tests reflecting real-time date advancement."))
    story.append(p("<b>2. Static TypeScript Verification:</b> 0 type errors across all mobile screens, services, navigators, and local modules (<font name='Courier'>npx tsc --noEmit</font>)."))
    story.append(p("<b>3. Native Build Compilation:</b> Clean Expo prebuild (<font name='Courier'>npx expo prebuild --platform android --clean</font>) followed by successful Gradle compilation (<font name='Courier'>gradlew.bat assembleDebug</font>) completed in <b>7m 3s</b> (351 tasks executed), producing <font name='Courier'>app-debug.apk</font> (164,789,558 bytes)."))
    story.append(p("<b>4. Formal 93-Case Test Matrix Summary:</b>"))
    story.append(b("<b>Total Cases:</b> 93 &nbsp;|&nbsp; <b>Passed:</b> 89 (95.70%) &nbsp;|&nbsp; <b>Partially Verified:</b> 3 (3.23%) &nbsp;|&nbsp; <b>Platform Limitations:</b> 1 (1.08%) &nbsp;|&nbsp; <b>Failed:</b> 0 (0.00%)"))
    story.append(b("<b>TC-NOTIF-009 (Limitation):</b> Android Doze mode background delivery."))
    story.append(b("<b>TC-CAL-005 (Partial):</b> Dynamic calendar date advancement boundary."))
    story.append(b("<b>TC-AND-004 (Partial):</b> Physical LAN Wi-Fi API connectivity required host IP binding."))
    story.append(b("<b>TC-AND-005 (Partial):</b> Sound verified; vibration not observed on physical Android 14 hardware."))
    story.append(Spacer(1, 10))

    # =========================================================================
    # 26. GAP ANALYSIS
    # =========================================================================
    story.append(heading1("25. IMPLEMENTATION VS. DOCUMENTATION GAP ANALYSIS"))
    story.append(p("Discrepancies between common academic report templates and actual code:"))

    gap_data = [
        [p("Report / Theoretical Concept", tbl_header), p("Code Status", tbl_header), p("Actual Implementation Reality", tbl_header), p("Mandatory Report Correction", tbl_header)],
        [p("System Administrator Actor", tbl_body), p("NOT IMPLEMENTED", tbl_body), p("Only Patient and Caregiver roles exist in UserRole enum.", tbl_body), p("Remove Admin actor, admin use cases, and web portal diagrams.", tbl_body)],
        [p("Firebase Cloud Messaging (FCM)", tbl_body), p("NOT IMPLEMENTED", tbl_body), p("Reminders are 100% device-side local exact alarms via AlarmManager.", tbl_body), p("Replace 'Push Notifications' with 'Local AlarmManager Reminders'.", tbl_body)],
        [p("Prescription Photo OCR", tbl_body), p("NOT IMPLEMENTED", tbl_body), p("Medicine data is entered textually via AddMedicineScreen form.", tbl_body), p("Remove OCR camera capture claims and image processing pipelines.", tbl_body)],
        [p("AWS S3 / Cloud Storage", tbl_body), p("NOT IMPLEMENTED", tbl_body), p("PDF reports are generated dynamically in-memory (io.BytesIO).", tbl_body), p("Remove S3 bucket descriptions; describe in-memory streaming.", tbl_body)],
        [p("Relational Tables / SQL", tbl_body), p("NOT IMPLEMENTED", tbl_body), p("Database is MongoDB Atlas document store with 8 collections.", tbl_body), p("Represent ERD as logical document schema; explain ObjectId links.", tbl_body)],
        [p("Third-Party Email SDK (SendGrid)", tbl_body), p("NOT IMPLEMENTED", tbl_body), p("Standard library smtplib with TLS/SSL is implemented.", tbl_body), p("Document smtplib/MIME architecture; do not claim SendGrid/SES.", tbl_body)],
    ]
    t_gap = Table(gap_data, colWidths=[105, 75, 175, 177])
    t_gap.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_HEADER),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_gap)
    story.append(Spacer(1, 10))

    # =========================================================================
    # CRITICAL FACTS FOR REPORT COMPLETION
    # =========================================================================
    story.append(heading1("CRITICAL FACTS FOR REPORT COMPLETION"))
    story.append(p("The following <b>30 authoritative facts</b> must be respected by any AI or human author completing academic chapters:"))
    
    facts = [
        "Project official title is 'MediTrack+: Smart Medication Management & Adherence Platform'.",
        "Target actors are strictly Patient and Caregiver; Admin is NOT implemented.",
        "Mobile framework is React Native 0.86.3 with Expo SDK 57.0.21 and React 19.2.3.",
        "Backend framework is FastAPI 0.141.1 on Python 3.13 with Uvicorn ASGI on port 8000.",
        "Database is MongoDB Atlas using official PyMongo 4.18.0 Async API; Motor was replaced.",
        "There are exactly 8 MongoDB collections: users, medicines, medication_schedules, medication_activities, caregivers, notifications, scheduled_report_deliveries, rate_limits.",
        "There are exactly 38 registered REST endpoints across 9 routers.",
        "Reminders are 100% device-side local notifications; NO push server (FCM/APNs) is used.",
        "Android exact alarms use custom native Kotlin module (exact-alarm) querying AlarmManager.",
        "Android notification channel is 'medication-reminders' with MAX importance and ALARM audio stream.",
        "Password hashing uses Bcrypt with 12 computational rounds.",
        "Registration password min length is 6; password reset min length is 8.",
        "Authentication tokens are HS256 signed JWTs with 7-day expiration.",
        "Mobile JWT tokens are persisted in hardware-backed Expo SecureStore.",
        "Skip dose action requires a mandatory clinical skip reason (min length 1).",
        "Adherence percentage formula is (Taken Doses / Expected Scheduled Doses) * 100.0%.",
        "Adherence streak evaluates strictly consecutive adherent days backwards from today.",
        "Caregiver missed-dose alert Rule A requires >=2 missed doses in a rolling 24-hour window.",
        "Caregiver missed-dose alert Rule B requires 2 consecutive missed doses of the same medicine.",
        "Caregiver alerts are deduplicated via SHA-256 fingerprint in notifications collection.",
        "Caregivers have read-only clinical access; they CANNOT create/edit/delete patient medicines.",
        "PDF reports are rendered in-memory via ReportLab 5.0.1 and streamed directly over HTTP.",
        "Zero files are uploaded to AWS S3, Cloudinary, or remote cloud object storage.",
        "Email delivery supports MockEmailService and SMTPEmailService via standard smtplib.",
        "Prescription photo scanning / OCR camera upload is NOT implemented.",
        "There is no Admin web dashboard or admin portal.",
        "Automated pytest suite contains 385 tests across 24 test files.",
        "Formal test matrix contains exactly 93 test cases: 89 Passed, 3 Partial, 1 Limitation, 0 Failed.",
        "Physical Android 14 test verified visual banners and audio sound, but vibration was not observed.",
        "MediTrack+ is strictly a reminder/tracking tool; it contains authoritative medical safety disclaimers."
    ]

    for idx, fact in enumerate(facts, 1):
        story.append(Paragraph(f"• <b>Fact {idx:02d}:</b> {fact}", fact_bullet_style))

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(Paragraph("<b>END OF AUTHORITATIVE PROJECT AUDIT &amp; SOURCE OF TRUTH</b>", ParagraphStyle('EndDoc', parent=base_styles['Normal'], alignment=1, fontName='Helvetica-Bold', fontSize=9, textColor=PRIMARY_DARK)))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Master Audit PDF successfully compiled: {filename}")

if __name__ == "__main__":
    out_file = "C:\\SampleMediTrack\\MediTrack_Master_Project_Audit.pdf"
    build_pdf(out_file)
