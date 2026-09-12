/**
 * Production Reports Screen for MediTrack+ (Phase 11 Step 9).
 *
 * Provides weekly and monthly medication adherence reports and clinical PDF export:
 * - Senior-friendly accessible design with high contrast and WCAG 48dp touch targets.
 * - Weekly | Monthly segmented period selector.
 * - Role-based authorization:
 *     - Patients view their own reports (JWT-derived identity).
 *     - Caregivers view actively linked patients with linked-patient selector.
 *     - Revocation safety: clears sensitive report data immediately on 403.
 * - Primary adherence percentage card with 5-state breakdown (Taken, Skipped, Missed, Snoozed, Pending).
 * - Streak metrics evaluated as of report endDate.
 * - Per-medicine breakdown list.
 * - Day-by-day occurrence log.
 * - In-memory PDF download to local filesystem + native PDF sharing (expo-sharing).
 * - Automated email report guidance consistent with backend notification preferences.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getLinkedPatients } from "../../api/caregivers";
import {
  downloadMonthlyReportPdf,
  downloadPatientMonthlyReportPdf,
  downloadPatientWeeklyReportPdf,
  downloadWeeklyReportPdf,
  getMonthlyReport,
  getPatientMonthlyReport,
  getPatientWeeklyReport,
  getWeeklyReport,
  shareReportPdf,
} from "../../api/reports";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import {
  LinkedPatient,
  MedicationReportResponse,
  ReportPeriodType,
} from "../../types";

interface ReportsScreenProps {
  onBack?: () => void;
  initialPatientId?: string;
  onNavigateToProfile?: () => void;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  onBack,
  initialPatientId,
  onNavigateToProfile,
}) => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  // Navigation / Period state
  const [period, setPeriod] = useState<ReportPeriodType>("weekly");

  // Caregiver Patient state
  const [linkedPatients, setLinkedPatients] = useState<LinkedPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    initialPatientId || null
  );
  const [isLoadingPatients, setIsLoadingPatients] = useState<boolean>(isCaregiver);

  // Report data state
  const [report, setReport] = useState<MedicationReportResponse | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRevoked, setIsRevoked] = useState<boolean>(false);

  // PDF actions state
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadedPdfUri, setDownloadedPdfUri] = useState<string | null>(null);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);

  // 1. Load Caregiver Linked Patients if user is caregiver
  useEffect(() => {
    if (!isCaregiver) return;
    let isMounted = true;

    async function fetchPatients() {
      setIsLoadingPatients(true);
      try {
        const patients = await getLinkedPatients();
        if (!isMounted) return;
        setLinkedPatients(patients || []);
        if (patients && patients.length > 0) {
          // If initialPatientId is provided and valid, keep it; otherwise select the first patient
          if (!selectedPatientId || !patients.some((p) => p.patientId === selectedPatientId)) {
            setSelectedPatientId(patients[0].patientId);
          }
        } else {
          setSelectedPatientId(null);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("[ReportsScreen] Failed to fetch linked patients:", err);
        setError("Unable to load monitored patients. Please check your connection.");
      } finally {
        if (isMounted) setIsLoadingPatients(false);
      }
    }

    fetchPatients();
    return () => {
      isMounted = false;
    };
  }, [isCaregiver]);

  // Handle Android hardware back press
  useEffect(() => {
    const backAction = () => {
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [onBack]);

  // 2. Fetch Report Data
  const fetchReport = useCallback(async () => {
    // If caregiver has no patients, stop
    if (isCaregiver && !selectedPatientId) {
      setReport(null);
      setIsLoadingReport(false);
      setIsRefreshing(false);
      return;
    }

    setError(null);
    setIsRevoked(false);
    setPdfSuccessMessage(null);
    setDownloadedPdfUri(null);

    try {
      let data: MedicationReportResponse;
      if (isCaregiver) {
        if (period === "weekly") {
          data = await getPatientWeeklyReport(selectedPatientId!);
        } else {
          data = await getPatientMonthlyReport(selectedPatientId!);
        }
      } else {
        if (period === "weekly") {
          data = await getWeeklyReport();
        } else {
          data = await getMonthlyReport();
        }
      }
      setReport(data);
    } catch (err: any) {
      console.error("[ReportsScreen] Error fetching report:", err);
      if (err?.response?.status === 403) {
        setIsRevoked(true);
        setReport(null); // Never retain or expose sensitive patient report data after revocation
        setError(
          "Access Denied: You do not have an active caregiver relationship with this patient, or access has been revoked."
        );
      } else if (err?.response?.status === 404) {
        setReport(null);
        setError("Patient records not found.");
      } else if (err?.response?.status === 422) {
        setError("Invalid report period requested.");
      } else {
        const msg =
          err?.response?.data?.detail ||
          "Unable to load adherence report. Please check your network connection and try again.";
        setError(msg);
      }
    } finally {
      setIsLoadingReport(false);
      setIsRefreshing(false);
    }
  }, [isCaregiver, period, selectedPatientId]);

  useEffect(() => {
    setIsLoadingReport(true);
    fetchReport();
  }, [fetchReport]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchReport();
  };

  // 3. Handle PDF Download
  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsDownloadingPdf(true);
    setPdfSuccessMessage(null);

    try {
      let fileUri: string;
      if (isCaregiver) {
        if (period === "weekly") {
          fileUri = await downloadPatientWeeklyReportPdf(selectedPatientId!, report.endDate);
        } else {
          fileUri = await downloadPatientMonthlyReportPdf(selectedPatientId!, report.endDate);
        }
      } else {
        if (period === "weekly") {
          fileUri = await downloadWeeklyReportPdf(report.endDate);
        } else {
          fileUri = await downloadMonthlyReportPdf(report.endDate);
        }
      }

      setDownloadedPdfUri(fileUri);
      const filename = fileUri.split("/").pop() || "Report.pdf";
      setPdfSuccessMessage(`Report saved locally: ${filename}`);

      // Prompt user to open/share immediately
      Alert.alert(
        "Report PDF Ready",
        `Your clinical adherence report has been successfully generated and saved to your device.`,
        [
          { text: "Done", style: "cancel" },
          {
            text: "Share / Open",
            onPress: () => handleSharePdf(fileUri),
          },
        ]
      );
    } catch (err: any) {
      console.error("[ReportsScreen] PDF download error:", err);
      const errorMsg =
        err?.message || "Failed to download PDF report. Please try again.";
      Alert.alert("Download Failed", errorMsg);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // 4. Handle PDF Share / Open
  const handleSharePdf = async (uriOverride?: string) => {
    const targetUri = uriOverride || downloadedPdfUri;
    if (!targetUri) {
      Alert.alert("No PDF Downloaded", "Please download the PDF report first.");
      return;
    }

    try {
      const success = await shareReportPdf(targetUri);
      if (!success) {
        Alert.alert(
          "Sharing Unavailable",
          `Sharing is not supported on this platform, but your PDF has been safely saved at:\n${targetUri}`
        );
      }
    } catch (err: any) {
      console.error("[ReportsScreen] PDF share error:", err);
      Alert.alert("Share Failed", "Unable to open system share sheet for this file.");
    }
  };

  // 5. Handle Email Report Information
  const handleEmailReportPress = () => {
    Alert.alert(
      "Automated Email Reports",
      "Medication adherence reports are automatically sent to registered accounts based on your notification preferences.\n\nYou can configure weekly and monthly email reports in your Profile Settings, or share the clinical PDF report immediately.",
      [
        { text: "Close", style: "cancel" },
        ...(onNavigateToProfile && !isCaregiver
          ? [
              {
                text: "Notification Settings",
                onPress: onNavigateToProfile,
              },
            ]
          : []),
        {
          text: "Share PDF Now",
          onPress: () => {
            if (downloadedPdfUri) {
              handleSharePdf();
            } else {
              handleDownloadPdf();
            }
          },
        },
      ]
    );
  };

  // Format Helper
  const formatDateLabel = (isoDate?: string): string => {
    if (!isoDate) return "";
    try {
      const [y, m, d] = isoDate.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoDate;
    }
  };

  const formatDayName = (isoDate?: string): string => {
    if (!isoDate) return "";
    try {
      const [y, m, d] = isoDate.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString("en-US", { weekday: "short" });
    } catch {
      return "";
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {onBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          )}
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>
              {isCaregiver ? "Adherence Reports" : "Reports"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isCaregiver
                ? "Monitored patient clinical adherence"
                : "Medication adherence overview"}
            </Text>
          </View>
        </View>

        {/* Period Selector (Weekly | Monthly) */}
        <View
          style={styles.segmentedContainer}
          accessibilityRole="tablist"
          accessibilityLabel="Report period selection"
        >
          <TouchableOpacity
            style={[
              styles.segmentButton,
              period === "weekly" && styles.segmentButtonActive,
            ]}
            onPress={() => setPeriod("weekly")}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === "weekly" }}
            accessibilityLabel="Weekly Report"
          >
            <Text
              style={[
                styles.segmentText,
                period === "weekly" && styles.segmentTextActive,
              ]}
            >
              📅 Weekly
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentButton,
              period === "monthly" && styles.segmentButtonActive,
            ]}
            onPress={() => setPeriod("monthly")}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === "monthly" }}
            accessibilityLabel="Monthly Report"
          >
            <Text
              style={[
                styles.segmentText,
                period === "monthly" && styles.segmentTextActive,
              ]}
            >
              🗓️ Monthly
            </Text>
          </TouchableOpacity>
        </View>

        {/* Caregiver Patient Selector */}
        {isCaregiver && (
          <View style={styles.caregiverSelectorContainer}>
            <Text style={styles.caregiverSelectorLabel}>Select Monitored Patient:</Text>
            {isLoadingPatients ? (
              <ActivityIndicator size="small" color={colors.primaryLight} style={{ marginVertical: 8 }} />
            ) : linkedPatients.length === 0 ? (
              <Text style={styles.noPatientsText}>No linked patients available</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.patientPillRow}
              >
                {linkedPatients.map((p) => {
                  const isSelected = p.patientId === selectedPatientId;
                  return (
                    <TouchableOpacity
                      key={p.patientId}
                      style={[
                        styles.patientPill,
                        isSelected && styles.patientPillSelected,
                      ]}
                      onPress={() => setSelectedPatientId(p.patientId)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Select patient ${p.fullName}`}
                    >
                      <Text
                        style={[
                          styles.patientPillText,
                          isSelected && styles.patientPillTextSelected,
                        ]}
                      >
                        👤 {p.fullName} ({p.relationship})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
      >
        {/* Loading State */}
        {isLoadingReport && (
          <LoadingState message="Preparing your adherence report..." style={styles.stateContainer} />
        )}

        {/* Error / Revocation State */}
        {!isLoadingReport && error && (
          <View style={styles.errorWrapper}>
            {isRevoked ? (
              <Card style={styles.revokedCard}>
                <Text style={styles.revokedTitle}>⚠️ Access Revoked</Text>
                <Text style={styles.revokedMessage}>{error}</Text>
                <Text style={styles.revokedHint}>
                  The patient has disconnected caregiver monitoring access. Stale clinical data has been safely cleared.
                </Text>
              </Card>
            ) : (
              <ErrorState
                title="Unable to Load Report"
                message={error}
                onRetry={fetchReport}
              />
            )}
          </View>
        )}

        {/* Caregiver Empty State (No Patients) */}
        {!isLoadingReport && !error && isCaregiver && linkedPatients.length === 0 && (
          <EmptyState
            title="No Monitored Patients"
            description="You do not have any actively linked patients. Once a patient adds you as a caregiver, their adherence reports will appear here."
          />
        )}

        {/* Main Report Content */}
        {!isLoadingReport && !error && report && (
          <>
            {/* Report Metadata Banner */}
            <Card style={styles.metaCard}>
              <View style={styles.metaHeaderRow}>
                <View style={styles.periodBadge}>
                  <Text style={styles.periodBadgeText}>
                    {report.reportType === "weekly" ? "📅 WEEKLY REPORT" : "🗓️ MONTHLY REPORT"}
                  </Text>
                </View>
                <Text style={styles.metaGenerated}>
                  Updated: {new Date(report.generatedAt).toLocaleDateString()}
                </Text>
              </View>

              <Text style={styles.metaDateRange}>
                {period === "weekly" ? "Weekly" : "Monthly"} {formatDateLabel(report.startDate)} — {formatDateLabel(report.endDate)}
              </Text>

              <View style={styles.metaPatientRow}>
                <Text style={styles.metaPatientLabel}>Patient:</Text>
                <Text style={styles.metaPatientName}>{report.patientName}</Text>
              </View>
            </Card>

            {/* Primary Adherence Summary Card */}
            <Card style={styles.adherenceCard}>
              <Text style={styles.cardHeaderTitle}>Adherence Summary</Text>

              {report.summary.hasScheduledDoses ? (
                <View style={styles.adherenceScoreRow}>
                  <View
                    style={[
                      styles.adherenceScoreCircle,
                      report.summary.adherencePercentage >= 80
                        ? styles.scoreHigh
                        : report.summary.adherencePercentage >= 50
                        ? styles.scoreMedium
                        : styles.scoreLow,
                    ]}
                  >
                    <Text
                      style={[
                        styles.adherenceScoreText,
                        report.summary.adherencePercentage >= 80
                          ? styles.scoreHighText
                          : report.summary.adherencePercentage >= 50
                          ? styles.scoreMediumText
                          : styles.scoreLowText,
                      ]}
                    >
                      {report.summary.adherencePercentage}%
                    </Text>
                    <Text style={styles.adherenceScoreLabel}>Adherence</Text>
                  </View>

                  <View style={styles.adherenceMetricsOverview}>
                    <Text style={styles.overviewHeadline}>
                      {report.summary.adherencePercentage >= 80
                        ? "🌟 Excellent Adherence"
                        : report.summary.adherencePercentage >= 50
                        ? "⚖️ Moderate Adherence"
                        : "⚠️ Needs Attention"}
                    </Text>
                    <Text style={styles.overviewSubtext}>
                      {report.summary.takenCount} of {report.summary.totalScheduled} doses taken on schedule.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.adherenceScoreRow}>
                  <View style={[styles.adherenceScoreCircle, styles.scoreNone]}>
                    <Text style={[styles.adherenceScoreText, styles.scoreNoneText]}>
                      N/A
                    </Text>
                    <Text style={styles.adherenceScoreLabel}>No Doses</Text>
                  </View>

                  <View style={styles.adherenceMetricsOverview}>
                    <Text style={styles.overviewHeadline}>ℹ️ No Scheduled Doses</Text>
                    <Text style={styles.overviewSubtext}>
                      No medication doses were scheduled during this reporting period ({formatDateLabel(report.startDate)} — {formatDateLabel(report.endDate)}).
                    </Text>
                  </View>
                </View>
              )}

              {/* 6-Metric Breakdown Grid */}
              <View style={styles.statsGrid}>
                <View style={[styles.statBox, styles.statBoxTotal]}>
                  <Text style={styles.statBoxIcon}>📅</Text>
                  <Text style={styles.statBoxNumber}>{report.summary.totalScheduled}</Text>
                  <Text style={styles.statBoxLabel}>Scheduled</Text>
                </View>

                <View style={[styles.statBox, styles.statBoxTaken]}>
                  <Text style={styles.statBoxIcon}>✅</Text>
                  <Text style={[styles.statBoxNumber, { color: colors.taken }]}>
                    {report.summary.takenCount}
                  </Text>
                  <Text style={styles.statBoxLabel}>Taken</Text>
                </View>

                <View style={[styles.statBox, styles.statBoxSkipped]}>
                  <Text style={styles.statBoxIcon}>⏭️</Text>
                  <Text style={[styles.statBoxNumber, { color: colors.skipped }]}>
                    {report.summary.skippedCount}
                  </Text>
                  <Text style={styles.statBoxLabel}>Skipped</Text>
                </View>

                <View style={[styles.statBox, styles.statBoxMissed]}>
                  <Text style={styles.statBoxIcon}>❌</Text>
                  <Text style={[styles.statBoxNumber, { color: colors.error }]}>
                    {report.summary.missedCount}
                  </Text>
                  <Text style={styles.statBoxLabel}>Missed</Text>
                </View>

                <View style={[styles.statBox, styles.statBoxSnoozed]}>
                  <Text style={styles.statBoxIcon}>⏰</Text>
                  <Text style={[styles.statBoxNumber, { color: colors.snoozed }]}>
                    {report.summary.unresolvedSnoozedCount}
                  </Text>
                  <Text style={styles.statBoxLabel}>Snoozed</Text>
                </View>

                <View style={[styles.statBox, styles.statBoxPending]}>
                  <Text style={styles.statBoxIcon}>⏳</Text>
                  <Text style={[styles.statBoxNumber, { color: colors.due }]}>
                    {report.summary.pendingCount}
                  </Text>
                  <Text style={styles.statBoxLabel}>Pending</Text>
                </View>
              </View>
            </Card>

            {/* PDF Export & Email Actions */}
            <Card style={styles.actionsCard}>
              <Text style={styles.cardHeaderTitle}>Report Actions</Text>
              <Text style={styles.actionsSubtitle}>
                Download formatted clinical PDF for physician visits or insurance verification.
              </Text>

              {pdfSuccessMessage && (
                <View style={styles.pdfSuccessBox}>
                  <Text style={styles.pdfSuccessText}>✓ {pdfSuccessMessage}</Text>
                </View>
              )}

              {downloadedPdfUri ? (
                <View style={styles.singleActionButtonContainer}>
                  <Button
                    title="📤 Share PDF Report"
                    onPress={() => handleSharePdf()}
                    variant="primary"
                    style={styles.fullWidthButton}
                  />
                  <TouchableOpacity
                    onPress={handleDownloadPdf}
                    disabled={isDownloadingPdf}
                    style={styles.reDownloadButton}
                    accessibilityRole="button"
                    accessibilityLabel="Re-download PDF"
                  >
                    <Text style={styles.reDownloadButtonText}>
                      {isDownloadingPdf ? "Re-generating PDF..." : "📥 Re-download PDF"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actionButtonsRow}>
                  <Button
                    title={isDownloadingPdf ? "Generating PDF..." : "📥 Download PDF"}
                    onPress={handleDownloadPdf}
                    variant="primary"
                    loading={isDownloadingPdf}
                    disabled={isDownloadingPdf}
                    style={styles.actionButton}
                  />

                  <Button
                    title="📧 Email Report"
                    onPress={handleEmailReportPress}
                    variant="outline"
                    disabled={isDownloadingPdf}
                    style={styles.actionButton}
                  />
                </View>
              )}
            </Card>

            {/* Historical Streak Card */}
            <Card style={styles.streakCard}>
              <View style={styles.streakHeaderRow}>
                <Text style={styles.cardHeaderTitle}>Adherence Streaks</Text>
                <Text style={styles.streakEvalDate}>
                  As of {formatDateLabel(report.streak.evaluatedDate)}
                </Text>
              </View>

              <View style={styles.streakMetricsRow}>
                <View style={styles.streakBox}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <Text style={styles.streakNumber}>{report.streak.currentStreak}</Text>
                  <Text style={styles.streakLabel}>Current Streak</Text>
                </View>

                <View style={styles.streakBox}>
                  <Text style={styles.streakEmoji}>🏆</Text>
                  <Text style={styles.streakNumber}>{report.streak.longestStreak}</Text>
                  <Text style={styles.streakLabel}>Best Streak</Text>
                </View>

                <View style={styles.streakBox}>
                  <Text style={styles.streakEmoji}>⭐</Text>
                  <Text style={styles.streakNumber}>{report.streak.totalAdherentDays}</Text>
                  <Text style={styles.streakLabel}>Adherent Days</Text>
                </View>

                <View style={styles.streakBox}>
                  <Text style={styles.streakEmoji}>📊</Text>
                  <Text style={styles.streakNumber}>{report.streak.totalTrackedDays}</Text>
                  <Text style={styles.streakLabel}>Tracked Days</Text>
                </View>
              </View>

              {report.streak.lastAdherentDate && (
                <Text style={styles.lastAdherentNote}>
                  Last fully adherent date: {formatDateLabel(report.streak.lastAdherentDate)}
                </Text>
              )}
            </Card>

            {/* Medicine Breakdown Section */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardHeaderTitle}>Medication Breakdown</Text>
                <Text style={styles.sectionItemCount}>
                  {report.medicines.length} {report.medicines.length === 1 ? "medication" : "medications"}
                </Text>
              </View>

              {report.medicines.length === 0 ? (
                <Text style={styles.emptySectionText}>
                  No medications were active during this reporting period.
                </Text>
              ) : (
                report.medicines.map((med) => (
                  <View key={med.medicineId} style={styles.medicineItem}>
                    <View style={styles.medicineItemHeader}>
                      <View style={styles.medicineInfoCol}>
                        <Text style={styles.medicineName}>{med.medicineName}</Text>
                        <Text style={styles.medicineDosage}>
                          {med.dosage} ({med.dosageUnit})
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.medAdherenceBadge,
                          med.hasScheduledDoses && med.adherencePercentage >= 80
                            ? styles.scoreHigh
                            : med.hasScheduledDoses && med.adherencePercentage >= 50
                            ? styles.scoreMedium
                            : med.hasScheduledDoses
                            ? styles.scoreLow
                            : styles.scoreNone,
                        ]}
                      >
                        <Text
                          style={[
                            styles.medAdherenceBadgeText,
                            med.hasScheduledDoses && med.adherencePercentage >= 80
                              ? styles.scoreHighText
                              : med.hasScheduledDoses && med.adherencePercentage >= 50
                              ? styles.scoreMediumText
                              : med.hasScheduledDoses
                              ? styles.scoreLowText
                              : styles.scoreNoneText,
                          ]}
                        >
                          {med.hasScheduledDoses ? `${med.adherencePercentage}%` : "N/A"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.medicineStatsRow}>
                      <Text style={styles.medStatText}>
                        Scheduled: <Text style={styles.boldText}>{med.totalScheduled}</Text>
                      </Text>
                      <Text style={[styles.medStatText, { color: colors.taken }]}>
                        Taken: <Text style={styles.boldText}>{med.takenCount}</Text>
                      </Text>
                      <Text style={[styles.medStatText, { color: colors.skipped }]}>
                        Skipped: <Text style={styles.boldText}>{med.skippedCount}</Text>
                      </Text>
                      <Text style={[styles.medStatText, { color: colors.error }]}>
                        Missed: <Text style={styles.boldText}>{med.missedCount}</Text>
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Card>

            {/* Day-by-Day Occurrence Log */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardHeaderTitle}>Day-by-Day Adherence Log</Text>
                <Text style={styles.sectionItemCount}>
                  {report.dailySummaries.length} days
                </Text>
              </View>

              {report.dailySummaries.length === 0 ? (
                <Text style={styles.emptySectionText}>No daily data recorded.</Text>
              ) : (
                <>
                  <View style={styles.dailyTableHeader}>
                    <Text style={[styles.dailyTableHeadText, styles.dailyDateCol]}>Date</Text>
                    <Text style={[styles.dailyTableHeadText, styles.dailyMetricsCol]}>
                      Status & Counts
                    </Text>
                    <Text style={[styles.dailyTableHeadText, styles.dailyPercentCol]}>
                      Adherence
                    </Text>
                  </View>

                  {report.dailySummaries.map((day) => (
                    <View key={day.date} style={styles.dailyRow}>
                      <View style={styles.dailyDateCol}>
                        <Text style={styles.dailyDayName}>{formatDayName(day.date)}</Text>
                        <Text style={styles.dailyDateString}>
                          {formatDateLabel(day.date).split(",")[0]}
                        </Text>
                      </View>

                      <View style={styles.dailyMetricsCol}>
                        {day.hasScheduledDoses ? (
                          <View style={styles.dailyBadgesRow}>
                            <Text style={[styles.dailyBadge, styles.badgeTaken]}>
                              ✓ {day.takenCount}
                            </Text>
                            {day.skippedCount > 0 && (
                              <Text style={[styles.dailyBadge, styles.badgeSkipped]}>
                                ✕ {day.skippedCount}
                              </Text>
                            )}
                            {day.missedCount > 0 && (
                              <Text style={[styles.dailyBadge, styles.badgeMissed]}>
                                ! {day.missedCount}
                              </Text>
                            )}
                            {day.unresolvedSnoozedCount > 0 && (
                              <Text style={[styles.dailyBadge, styles.badgeSnoozed]}>
                                ⏰ {day.unresolvedSnoozedCount}
                              </Text>
                            )}
                            {day.pendingCount > 0 && (
                              <Text style={[styles.dailyBadge, styles.badgePending]}>
                                ⏳ {day.pendingCount}
                              </Text>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.noDailyDoses}>No doses scheduled</Text>
                        )}
                      </View>

                      <View style={styles.dailyPercentCol}>
                        <Text
                          style={[
                            styles.dailyPercentText,
                            day.hasScheduledDoses && day.adherencePercentage >= 80
                              ? { color: colors.taken }
                              : day.hasScheduledDoses && day.adherencePercentage >= 50
                              ? { color: colors.snoozed }
                              : day.hasScheduledDoses
                              ? { color: colors.error }
                              : { color: colors.textMuted },
                          ]}
                        >
                          {day.hasScheduledDoses ? `${Math.round(day.adherencePercentage)}%` : "—"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </Card>

            {/* Medical Disclaimer Box */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerTitle}>⚠️ Medical Disclaimer</Text>
              <Text style={styles.disclaimerText}>
                {report.medicalDisclaimer ||
                  "This report is generated for tracking and communication purposes only and does not substitute professional medical advice."}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ? StatusBar.currentHeight + spacing.sm : spacing.xl) : spacing.md,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primaryLight,
  },
  titleContainer: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textInverse,
    fontWeight: "800",
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: 2,
  },
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.22)",
    borderRadius: borderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    marginTop: spacing.xs,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  segmentText: {
    ...typography.body,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
  },
  segmentTextActive: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  caregiverSelectorContainer: {
    marginTop: spacing.md,
  },
  caregiverSelectorLabel: {
    ...typography.small,
    color: colors.primaryLight,
    marginBottom: spacing.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noPatientsText: {
    ...typography.caption,
    color: colors.surface,
    fontStyle: "italic",
  },
  patientPillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  patientPill: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.3)",
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  patientPillSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryHover,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  patientPillText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textInverse,
  },
  patientPillTextSelected: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.huge,
  },
  stateContainer: {
    marginVertical: spacing.huge,
  },
  errorWrapper: {
    marginVertical: spacing.md,
  },
  revokedCard: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  revokedTitle: {
    ...typography.h3,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
  revokedMessage: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  revokedHint: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  metaCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  metaHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  periodBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  periodBadgeText: {
    ...typography.small,
    fontWeight: "800",
    color: colors.primaryDark,
    letterSpacing: 0.5,
  },
  metaGenerated: {
    ...typography.small,
    color: colors.textMuted,
  },
  metaDateRange: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  metaPatientRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  metaPatientLabel: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  metaPatientName: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  adherenceCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  cardHeaderTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  adherenceScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  adherenceScoreCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  scoreHigh: {
    backgroundColor: colors.takenLight,
    borderColor: colors.taken,
  },
  scoreMedium: {
    backgroundColor: colors.snoozedLight,
    borderColor: colors.snoozed,
  },
  scoreLow: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.error,
  },
  scoreNone: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  scoreHighText: {
    color: colors.taken,
  },
  scoreMediumText: {
    color: colors.snoozed,
  },
  scoreLowText: {
    color: colors.error,
  },
  scoreNoneText: {
    color: colors.textMuted,
  },
  adherenceScoreText: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  adherenceScoreLabel: {
    ...typography.small,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: -2,
  },
  adherenceMetricsOverview: {
    flex: 1,
  },
  overviewHeadline: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  overviewSubtext: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statBox: {
    width: "30.5%",
    flexGrow: 1,
    minWidth: 95,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statBoxTotal: {
    borderTopWidth: 3.5,
    borderTopColor: colors.textSecondary,
  },
  statBoxTaken: {
    borderTopWidth: 3.5,
    borderTopColor: colors.taken,
  },
  statBoxSkipped: {
    borderTopWidth: 3.5,
    borderTopColor: colors.skipped,
  },
  statBoxMissed: {
    borderTopWidth: 3.5,
    borderTopColor: colors.error,
  },
  statBoxSnoozed: {
    borderTopWidth: 3.5,
    borderTopColor: colors.snoozed,
  },
  statBoxPending: {
    borderTopWidth: 3.5,
    borderTopColor: colors.due,
  },
  statBoxIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  statBoxNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  statBoxLabel: {
    ...typography.small,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: "center",
  },
  actionsCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  actionsSubtitle: {
    ...typography.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  pdfSuccessBox: {
    backgroundColor: colors.takenLight,
    borderColor: colors.taken,
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  pdfSuccessText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.taken,
  },
  singleActionButtonContainer: {
    gap: spacing.sm,
  },
  fullWidthButton: {
    width: "100%",
    minHeight: 48,
  },
  reDownloadButton: {
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  reDownloadButtonText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
  },
  streakCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  streakHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  streakEvalDate: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: "500",
  },
  streakMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  streakBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  streakEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  streakNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  streakLabel: {
    ...typography.small,
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  lastAdherentNote: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: spacing.md,
    textAlign: "center",
  },
  sectionCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionItemCount: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: "600",
  },
  emptySectionText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: "italic",
    marginVertical: spacing.sm,
  },
  medicineItem: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  medicineItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  medicineInfoCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  medicineName: {
    ...typography.h3,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "700",
    flexWrap: "wrap",
  },
  medicineDosage: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  medAdherenceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    minWidth: 52,
    alignItems: "center",
  },
  medAdherenceBadgeText: {
    ...typography.caption,
    fontWeight: "800",
  },
  medicineStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  medStatText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  boldText: {
    fontWeight: "700",
  },
  dailyTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: spacing.xs + 2,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  dailyTableHeadText: {
    ...typography.small,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  dailyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dailyDateCol: {
    width: 75,
  },
  dailyDayName: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  dailyDateString: {
    ...typography.small,
    color: colors.textMuted,
  },
  dailyMetricsCol: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  dailyBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  dailyBadge: {
    ...typography.small,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  badgeTaken: {
    backgroundColor: colors.takenLight,
    color: colors.taken,
  },
  badgeSkipped: {
    backgroundColor: colors.skippedLight,
    color: colors.skipped,
  },
  badgeMissed: {
    backgroundColor: colors.dangerLight,
    color: colors.error,
  },
  badgeSnoozed: {
    backgroundColor: colors.snoozedLight,
    color: colors.snoozed,
  },
  badgePending: {
    backgroundColor: colors.dueLight,
    color: colors.due,
  },
  noDailyDoses: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  dailyPercentCol: {
    width: 80,
    alignItems: "flex-end",
  },
  dailyPercentText: {
    ...typography.body,
    fontWeight: "800",
    fontSize: 15,
  },
  disclaimerBox: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.huge,
  },
  disclaimerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: spacing.xs,
  },
  disclaimerText: {
    ...typography.small,
    color: "#78350F",
    lineHeight: 18,
  },
});
