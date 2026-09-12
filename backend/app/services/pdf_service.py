"""PDF Generation Service for Medication Adherence Reports (Phase 11).

Generates professional, printable, and clinically structured adherence reports using ReportLab.
- Pure presentation service: consumes already-calculated MedicationReportResponse models
- Decoupled from database access and HTTP routing
- Zero exposure of passwords, JWTs, SMTP credentials, or authentication tokens
- Contains branding, four-box metrics, streak statistics, medicine breakdown, daily logs, and medical disclaimer
"""

import io
import os
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.report import MedicationReportResponse, ReportPeriod

# Canonical Brand Colors
COLOR_TEAL = colors.HexColor("#008080")
COLOR_TEAL_DARK = colors.HexColor("#005A5A")
COLOR_TEAL_LIGHT = colors.HexColor("#E6F4F4")
COLOR_SLATE_DARK = colors.HexColor("#0F172A")
COLOR_SLATE_MED = colors.HexColor("#334155")
COLOR_SLATE_LIGHT = colors.HexColor("#64748B")
COLOR_BG_CARD = colors.HexColor("#F8FAFC")
COLOR_BORDER = colors.HexColor("#E2E8F0")
COLOR_SUCCESS = colors.HexColor("#059669")
COLOR_DANGER = colors.HexColor("#DC2626")
COLOR_WARNING = colors.HexColor("#D97706")
COLOR_INFO = colors.HexColor("#2563EB")


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas that dynamically calculates and renders running total page counts."""

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
            self.draw_footer(num_pages)
            super().showPage()
        super().save()

    def draw_footer(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(COLOR_SLATE_LIGHT)

        # Footer divider line
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(36, 32, 612 - 36, 32)

        # Left label
        self.drawString(36, 20, "MediTrack+ • Confidential Patient Adherence Report")

        # Right running page indicator
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 36, 20, page_text)
        self.restoreState()


class PdfService:
    """Service for rendering PDF reports from adherence report calculation data."""

    def generate_report_pdf(self, report: MedicationReportResponse) -> bytes:
        """Render a calculated MedicationReportResponse into PDF bytes.

        Pure rendering function: does not perform database queries or mutate input data.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=45,
        )

        styles = getSampleStyleSheet()

        # Custom Typography Styles
        style_title = ParagraphStyle(
            "DocTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=COLOR_TEAL,
        )
        style_subtitle = ParagraphStyle(
            "DocSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=COLOR_SLATE_LIGHT,
        )
        style_badge = ParagraphStyle(
            "BadgeText",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=colors.white,
            alignment=1,  # Center
        )
        style_meta_label = ParagraphStyle(
            "MetaLabel",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=11,
            textColor=COLOR_SLATE_MED,
        )
        style_meta_val = ParagraphStyle(
            "MetaVal",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=COLOR_SLATE_DARK,
        )
        style_h2 = ParagraphStyle(
            "SectionH2",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=COLOR_TEAL_DARK,
            spaceBefore=10,
            spaceAfter=6,
        )
        style_th = ParagraphStyle(
            "TableHeader",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.white,
            alignment=1,
        )
        style_td = ParagraphStyle(
            "TableCell",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=COLOR_SLATE_DARK,
            alignment=0,
        )
        style_td_center = ParagraphStyle(
            "TableCellCenter",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=COLOR_SLATE_DARK,
            alignment=1,
        )
        style_td_bold_center = ParagraphStyle(
            "TableCellBoldCenter",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=COLOR_SLATE_DARK,
            alignment=1,
        )
        style_card_num = ParagraphStyle(
            "CardNum",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
            textColor=COLOR_TEAL_DARK,
            alignment=1,
        )
        style_card_lbl = ParagraphStyle(
            "CardLbl",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=COLOR_SLATE_LIGHT,
            alignment=1,
        )
        style_disclaimer = ParagraphStyle(
            "Disclaimer",
            parent=styles["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=7,
            leading=10,
            textColor=COLOR_SLATE_LIGHT,
            alignment=0,
        )

        elements = []

        # 1. Header Banner
        is_weekly = report.reportType == ReportPeriod.WEEKLY
        period_title = "WEEKLY ADHERENCE REPORT" if is_weekly else "MONTHLY ADHERENCE REPORT"

        badge_table = Table(
            [[Paragraph(period_title, style_badge)]],
            colWidths=[180],
            rowHeights=[24],
        )
        badge_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_TEAL),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))

        # Check for brand logo asset
        logo_path = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")
        if os.path.isfile(logo_path):
            logo_img = RLImage(logo_path, width=28, height=28)
            title_cell = Table(
                [[logo_img, Paragraph("MediTrack+", style_title)]],
                colWidths=[34, 326],
            )
            title_cell.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
        else:
            title_cell = Paragraph("MediTrack+", style_title)

        header_table = Table(
            [
                [
                    title_cell,
                    badge_table,
                ],
                [
                    Paragraph("Smart Medication Management & Adherence Platform", style_subtitle),
                    "",
                ]
            ],
            colWidths=[360, 180],
        )
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("SPAN", (0, 0), (0, 0)),
            ("SPAN", (1, 0), (1, 1)),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 8))

        # Thin Teal Line
        elements.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_TEAL, spaceAfter=8))

        # 2. Metadata Box
        generated_str = report.generatedAt.strftime("%Y-%m-%d %H:%M UTC")
        meta_data = [
            [
                Paragraph("<b>Patient Name:</b>", style_meta_label),
                Paragraph(report.patientName, style_meta_val),
                Paragraph("<b>Report Period:</b>", style_meta_label),
                Paragraph(f"{report.startDate} to {report.endDate}", style_meta_val),
            ],
            [
                Paragraph("<b>Account Email:</b>", style_meta_label),
                Paragraph(report.patientEmail, style_meta_val),
                Paragraph("<b>Generated On:</b>", style_meta_label),
                Paragraph(generated_str, style_meta_val),
            ],
        ]
        meta_table = Table(meta_data, colWidths=[80, 190, 80, 190])
        meta_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_BG_CARD),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 10))

        # 3. Four-Box Summary Cards
        adherence_str = f"{report.summary.adherencePercentage}%"
        taken_str = f"{report.summary.takenCount} / {report.summary.totalScheduled}"
        missed_str = f"{report.summary.missedCount}"
        streak_str = f"{report.streak.currentStreak} Days"

        cards_data = [
            [
                Paragraph(adherence_str, style_card_num),
                Paragraph(taken_str, style_card_num),
                Paragraph(missed_str, style_card_num),
                Paragraph(streak_str, style_card_num),
            ],
            [
                Paragraph("ADHERENCE RATE", style_card_lbl),
                Paragraph("DOSES TAKEN", style_card_lbl),
                Paragraph("DOSES MISSED", style_card_lbl),
                Paragraph("CURRENT STREAK", style_card_lbl),
            ],
        ]
        cards_table = Table(cards_data, colWidths=[135, 135, 135, 135], rowHeights=[24, 16])
        cards_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_BG_CARD),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(cards_table)
        elements.append(Spacer(1, 10))

        # 4. Detailed Intake Metrics & Streak Statistics Panel (2 side-by-side boxes)
        stats_left = [
            [Paragraph("<b>Dose Intake Statuses</b>", style_meta_label), Paragraph("", style_meta_val)],
            [Paragraph("Total Scheduled Doses:", style_td), Paragraph(str(report.summary.totalScheduled), style_td_bold_center)],
            [Paragraph("Confirmed Taken:", style_td), Paragraph(str(report.summary.takenCount), style_td_bold_center)],
            [Paragraph("Confirmed Skipped:", style_td), Paragraph(str(report.summary.skippedCount), style_td_bold_center)],
            [Paragraph("Missed Doses:", style_td), Paragraph(str(report.summary.missedCount), style_td_bold_center)],
            [Paragraph("Unresolved Snoozed:", style_td), Paragraph(str(report.summary.unresolvedSnoozedCount), style_td_bold_center)],
            [Paragraph("Pending Future:", style_td), Paragraph(str(report.summary.pendingCount), style_td_bold_center)],
        ]
        stats_left_table = Table(stats_left, colWidths=[180, 80], rowHeights=[16] * 7)
        stats_left_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLOR_TEAL_LIGHT),
            ("SPAN", (0, 0), (1, 0)),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("INNERGRID", (0, 1), (-1, -1), 0.5, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))

        stats_right = [
            [Paragraph("<b>Adherence Streak Statistics</b>", style_meta_label), Paragraph("", style_meta_val)],
            [Paragraph("Current Adherent Streak:", style_td), Paragraph(f"{report.streak.currentStreak} days", style_td_bold_center)],
            [Paragraph("Longest Historical Streak:", style_td), Paragraph(f"{report.streak.longestStreak} days", style_td_bold_center)],
            [Paragraph("Total Adherent Days:", style_td), Paragraph(str(report.streak.totalAdherentDays), style_td_bold_center)],
            [Paragraph("Total Tracked Days:", style_td), Paragraph(str(report.streak.totalTrackedDays), style_td_bold_center)],
            [Paragraph("Last Adherent Date:", style_td), Paragraph(report.streak.lastAdherentDate or "None", style_td_bold_center)],
            [Paragraph("Evaluated Reference Date:", style_td), Paragraph(report.streak.evaluatedDate, style_td_bold_center)],
        ]
        stats_right_table = Table(stats_right, colWidths=[180, 80], rowHeights=[16] * 7)
        stats_right_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLOR_TEAL_LIGHT),
            ("SPAN", (0, 0), (1, 0)),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("INNERGRID", (0, 1), (-1, -1), 0.5, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))

        overview_grid = Table(
            [[stats_left_table, stats_right_table]],
            colWidths=[265, 265],
        )
        overview_grid.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(overview_grid)
        elements.append(Spacer(1, 12))

        # 5. Medication Breakdown Table
        elements.append(Paragraph("Medication-Wise Adherence Breakdown", style_h2))

        med_headers = [
            Paragraph("Medicine", style_th),
            Paragraph("Dosage", style_th),
            Paragraph("Scheduled", style_th),
            Paragraph("Taken", style_th),
            Paragraph("Skipped", style_th),
            Paragraph("Missed", style_th),
            Paragraph("Pending", style_th),
            Paragraph("Adherence", style_th),
        ]
        med_rows = [med_headers]

        if report.medicines:
            for m in report.medicines:
                dosage_display = f"{m.dosage} {m.dosageUnit}"
                pending_or_snooze = m.pendingCount + m.unresolvedSnoozedCount
                adh_display = f"{m.adherencePercentage}%" if m.hasScheduledDoses else "N/A"
                med_rows.append([
                    Paragraph(m.medicineName, style_td),
                    Paragraph(dosage_display, style_td_center),
                    Paragraph(str(m.totalScheduled), style_td_center),
                    Paragraph(str(m.takenCount), style_td_center),
                    Paragraph(str(m.skippedCount), style_td_center),
                    Paragraph(str(m.missedCount), style_td_center),
                    Paragraph(str(pending_or_snooze), style_td_center),
                    Paragraph(adh_display, style_td_bold_center),
                ])
        else:
            med_rows.append([
                Paragraph("No active scheduled medications found for this report period.", style_td_center),
                "", "", "", "", "", "", "",
            ])

        med_table = Table(
            med_rows,
            colWidths=[150, 70, 55, 50, 50, 50, 55, 60],
        )
        med_style = [
            ("BACKGROUND", (0, 0), (-1, 0), COLOR_TEAL),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if not report.medicines:
            med_style.append(("SPAN", (0, 1), (-1, 1)))
        else:
            for idx in range(1, len(med_rows)):
                if idx % 2 == 0:
                    med_style.append(("BACKGROUND", (0, idx), (-1, idx), COLOR_BG_CARD))
        med_table.setStyle(TableStyle(med_style))
        elements.append(med_table)
        elements.append(Spacer(1, 12))

        # 6. Daily Adherence Log Table
        elements.append(Paragraph("Daily Adherence Log", style_h2))

        daily_headers = [
            Paragraph("Date", style_th),
            Paragraph("Scheduled", style_th),
            Paragraph("Taken", style_th),
            Paragraph("Skipped", style_th),
            Paragraph("Missed", style_th),
            Paragraph("Snoozed", style_th),
            Paragraph("Pending", style_th),
            Paragraph("Daily Adherence", style_th),
        ]
        daily_rows = [daily_headers]

        for d in report.dailySummaries:
            adh_display = f"{d.adherencePercentage}%" if d.hasScheduledDoses else "No doses"
            daily_rows.append([
                Paragraph(d.date, style_td_center),
                Paragraph(str(d.totalScheduled), style_td_center),
                Paragraph(str(d.takenCount), style_td_center),
                Paragraph(str(d.skippedCount), style_td_center),
                Paragraph(str(d.missedCount), style_td_center),
                Paragraph(str(d.unresolvedSnoozedCount), style_td_center),
                Paragraph(str(d.pendingCount), style_td_center),
                Paragraph(adh_display, style_td_bold_center),
            ])

        daily_table = Table(
            daily_rows,
            colWidths=[80, 65, 55, 55, 55, 60, 60, 110],
        )
        daily_style = [
            ("BACKGROUND", (0, 0), (-1, 0), COLOR_TEAL_DARK),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
        for idx in range(1, len(daily_rows)):
            if idx % 2 == 0:
                daily_style.append(("BACKGROUND", (0, idx), (-1, idx), COLOR_BG_CARD))
        daily_table.setStyle(TableStyle(daily_style))
        elements.append(daily_table)
        elements.append(Spacer(1, 14))

        # 7. Medical Safety Disclaimer Box
        disclaimer_data = [
            [
                Paragraph(
                    f"<b>IMPORTANT MEDICAL DISCLAIMER:</b> {report.medicalDisclaimer}",
                    style_disclaimer,
                )
            ]
        ]
        disclaimer_table = Table(disclaimer_data, colWidths=[540])
        disclaimer_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_BG_CARD),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(KeepTogether(disclaimer_table))

        # Build document
        doc.build(elements, canvasmaker=NumberedCanvas)
        return buffer.getvalue()


# Global singleton instance for shared usage
pdf_service = PdfService()


def generate_adherence_report_pdf(report: MedicationReportResponse) -> bytes:
    """Convenience helper to render a report PDF using the default service."""
    return pdf_service.generate_report_pdf(report)
