/**
 * Medication Adherence Reports Screen for MediTrack+
 * Redesigned to match the finalized MediTrack+ UI design reference (page 25 of ui.pdf).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import {
  LinkedPatient,
  MedicationReportResponse,
  ReportMedicineBreakdown,
  ReportPeriodType,
} from "../../types";

export interface ReportsScreenProps {
  onBack?: () => void;
  initialPatientId?: string;
  onNavigateToProfile?: () => void;
  onNavigateToMedicines?: () => void;
  onNavigateToCalendar?: () => void;
  hideBottomNav?: boolean;
}

type PeriodFilterTab = "7 Days" | "30 Days" | "Custom";
type SortOption = "high-to-low" | "low-to-high" | "alphabetical";

const PERIOD_TABS: PeriodFilterTab[] = ["7 Days", "30 Days", "Custom"];

const PILL_COLORS = [
  { bg: "#E0F2FE", color: "#0284C7" }, // Blue
  { bg: "#DCFCE7", color: "#16A34A" }, // Green
  { bg: "#FEE2E2", color: "#DC2626" }, // Red
  { bg: "#F3E8FF", color: "#9333EA" }, // Purple
  { bg: "#FEF3C7", color: "#D97706" }, // Amber
  { bg: "#CCFBF1", color: "#0D9488" }, // Teal
];

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatReportDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const dayStr = String(d).padStart(2, "0");
    const monthStr = SHORT_MONTHS[m - 1] || "";
    return `${dayStr} ${monthStr} ${y}`;
  } catch {
    return dateStr;
  }
}

function formatDayName(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return "";
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayIndex = dateObj.getDay();
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[dayIndex] || "";
  } catch {
    return "";
  }
}

/**
 * Circular progress ring for adherence percentage in Report Summary.
 */
const AdherenceProgressRing: React.FC<{ percentage: number; size?: number }> = ({
  percentage,
  size = 112,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

  const topColor = clamped > 0 ? "#0D9488" : "#E2E8F0";
  const rightColor = clamped >= 25 ? "#0D9488" : "#E2E8F0";
  const bottomColor = clamped >= 50 ? "#0D9488" : "#E2E8F0";
  const leftColor = clamped >= 75 ? "#0D9488" : "#E2E8F0";

  return (
    <View
      style={[
        styles.progressRingWrapper,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <View
        style={[
          styles.progressRingCircle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderTopColor: topColor,
            borderRightColor: rightColor,
            borderBottomColor: bottomColor,
            borderLeftColor: leftColor,
          },
        ]}
      >
        <View style={styles.progressRingInner}>
          <Text style={styles.progressPercentageText}>{clamped}%</Text>
          <Text style={styles.progressLabelText}>Adherence</Text>
        </View>
      </View>
    </View>
  );
};

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  onBack,
  initialPatientId,
  onNavigateToProfile,
  onNavigateToMedicines,
  onNavigateToCalendar,
  hideBottomNav = false,
}) => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  // Period state
  const [selectedPeriodTab, setSelectedPeriodTab] = useState<PeriodFilterTab>("7 Days");
  const [period, setPeriod] = useState<ReportPeriodType>("weekly");

  // Medication sort state
  const [sortOption, setSortOption] = useState<SortOption>("high-to-low");

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
    if (isCaregiver && !selectedPatientId) {
      setReport(null);
      setIsLoadingReport(false);
      setIsRefreshing(false);
      return;
    }

    setError(null);
    setIsRevoked(false);
    setPdfSuccessMessage(null);

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
        setReport(null);
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

  // Switch Period Tab
  const handlePeriodTabSelect = (tab: PeriodFilterTab) => {
    setSelectedPeriodTab(tab);
    if (tab === "7 Days") {
      setPeriod("weekly");
    } else if (tab === "30 Days") {
      setPeriod("monthly");
    } else {
      // Custom: toggle between weekly and monthly or show prompt
      Alert.alert(
        "Custom Report Period",
        "Select a standard reporting window or custom period.",
        [
          { text: "7 Days (Weekly)", onPress: () => { setSelectedPeriodTab("7 Days"); setPeriod("weekly"); } },
          { text: "30 Days (Monthly)", onPress: () => { setSelectedPeriodTab("30 Days"); setPeriod("monthly"); } },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  };

  // 3. Handle PDF Download & Share
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
      setPdfSuccessMessage(`Report generated: ${filename}`);

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

  const handleSharePdf = async (uriOverride?: string) => {
    const targetUri = uriOverride || downloadedPdfUri;
    if (!targetUri) {
      // If no PDF generated yet, generate one first
      handleDownloadPdf();
      return;
    }

    try {
      const success = await shareReportPdf(targetUri);
      if (!success) {
        Alert.alert(
          "Sharing Unavailable",
          `Your report PDF is stored safely at:\n${targetUri}`
        );
      }
    } catch (err: any) {
      console.error("[ReportsScreen] PDF share error:", err);
      Alert.alert("Share Failed", "Unable to open system share sheet for this file.");
    }
  };

  const handleViewPreviousReports = () => {
    if (downloadedPdfUri) {
      Alert.alert(
        "Previous Report Available",
        `A clinical report PDF was previously generated:\n${downloadedPdfUri.split("/").pop()}`,
        [
          { text: "Close", style: "cancel" },
          {
            text: "Share / Open",
            onPress: () => handleSharePdf(downloadedPdfUri),
          },
          {
            text: "Generate Fresh",
            onPress: handleDownloadPdf,
          },
        ]
      );
    } else {
      Alert.alert(
        "No Previous Reports Stored Locally",
        "You can generate a fresh clinical report for the current period now.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Generate Report", onPress: handleDownloadPdf },
        ]
      );
    }
  };

  // Sorted Medicines
  const sortedMedicines = useMemo(() => {
    if (!report?.medicines) return [];
    const list = [...report.medicines];
    if (sortOption === "high-to-low") {
      return list.sort((a, b) => b.adherencePercentage - a.adherencePercentage);
    }
    if (sortOption === "low-to-high") {
      return list.sort((a, b) => a.adherencePercentage - b.adherencePercentage);
    }
    return list.sort((a, b) => a.medicineName.localeCompare(b.medicineName));
  }, [report?.medicines, sortOption]);

  const toggleSortOption = () => {
    if (sortOption === "high-to-low") {
      setSortOption("low-to-high");
    } else if (sortOption === "low-to-high") {
      setSortOption("alphabetical");
    } else {
      setSortOption("high-to-low");
    }
  };

  const sortLabel =
    sortOption === "high-to-low"
      ? "Adherence (High to Low)"
      : sortOption === "low-to-high"
      ? "Adherence (Low to High)"
      : "Alphabetical";

  // Trend data points (up to 7 days for the chart)
  const trendDays = useMemo(() => {
    if (!report?.dailySummaries || report.dailySummaries.length === 0) {
      return [];
    }
    // Take the last 7 daily summaries
    const slice = report.dailySummaries.slice(-7);
    return slice.map((day) => ({
      date: day.date,
      dayName: formatDayName(day.date),
      percentage: Math.round(day.adherencePercentage),
      hasScheduledDoses: day.hasScheduledDoses,
    }));
  }, [report?.dailySummaries]);

  // Derived Summary Counts
  const adherencePercentage = report?.summary?.adherencePercentage ?? 0;
  const totalScheduled = report?.summary?.totalScheduled ?? 0;
  const takenCount = report?.summary?.takenCount ?? 0;
  const skippedCount = (report?.summary?.skippedCount ?? 0) + (report?.summary?.missedCount ?? 0);
  const pendingCount = report?.summary?.pendingCount ?? 0;

  const progressTitle =
    adherencePercentage >= 80
      ? "Good progress!"
      : adherencePercentage >= 50
      ? "Steady progress"
      : "Needs attention";

  const progressMessage =
    adherencePercentage >= 80
      ? "You've taken most of your scheduled doses this period."
      : adherencePercentage >= 50
      ? "Keep taking your doses consistently to stay on track."
      : "Try setting reminder alarms to improve adherence.";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. Header */}
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>Reports</Text>
          <Text style={styles.headerSubtitle}>Review your medication adherence.</Text>
        </View>
      </View>

      {/* Caregiver Patient Selector (if Caregiver) */}
      {isCaregiver && (
        <View style={styles.caregiverSelectorContainer}>
          <Text style={styles.caregiverSelectorLabel}>Monitored Patient:</Text>
          {isLoadingPatients ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 4 }} />
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
                      {p.fullName} ({p.relationship})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* 2. Report Period Control Header */}
      <View style={styles.periodControlContainer}>
        <View style={styles.periodRow}>
          <Text style={styles.periodSectionLabel}>Report Period</Text>
          <View style={styles.periodPillGroup}>
            {PERIOD_TABS.map((tab) => {
              const isSelected = selectedPeriodTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.periodPill,
                    isSelected ? styles.periodPillSelected : styles.periodPillUnselected,
                  ]}
                  onPress={() => handlePeriodTabSelect(tab)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${tab} period`}
                >
                  <Text
                    style={[
                      styles.periodPillText,
                      isSelected ? styles.periodPillTextSelected : styles.periodPillTextUnselected,
                    ]}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 3. Report Date Range Box */}
        {report && (
          <TouchableOpacity
            style={styles.dateRangeBox}
            onPress={() => handlePeriodTabSelect("Custom")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Select date range"
          >
            <Ionicons
              name="calendar-outline"
              size={16}
              color={colors.textSecondary}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.dateRangeText}>
              {formatReportDate(report.startDate)} - {formatReportDate(report.endDate)}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={colors.textSecondary}
              style={{ marginLeft: "auto" }}
            />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Loading State */}
        {isLoadingReport && !isRefreshing && (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading adherence report...</Text>
          </View>
        )}

        {/* Error / Revoked State */}
        {!isLoadingReport && error && (
          <View style={styles.errorWrapper}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={colors.danger}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Empty State if no report */}
        {!isLoadingReport && !error && !report && (
          <EmptyState
            title="No Report Available"
            description="There are currently no report records available for the selected period."
          />
        )}

        {/* Main Content */}
        {!isLoadingReport && !error && report && (
          <>
            {/* 4. Report Summary Card */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Report Summary</Text>
              <View style={styles.summaryCard}>
                {/* Top Part: Progress Ring & Status Message */}
                <View style={styles.summaryTopRow}>
                  <View style={styles.ringCol}>
                    <AdherenceProgressRing percentage={adherencePercentage} />
                  </View>

                  <View style={styles.summaryMessageCol}>
                    <Text style={styles.progressTitleText}>{progressTitle}</Text>
                    <Text style={styles.progressSubtitleText}>{progressMessage}</Text>
                  </View>
                </View>

                {/* Bottom Part: 4 Metric Tiles */}
                <View style={styles.metricTilesRow}>
                  {/* Scheduled */}
                  <View style={[styles.metricTile, styles.tileScheduled]}>
                    <View style={[styles.metricIconCircle, { backgroundColor: "#475569" }]}>
                      <Ionicons name="calendar-outline" size={12} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.metricNumberText, { color: "#1E293B" }]}>
                      {totalScheduled}
                    </Text>
                    <Text style={[styles.metricLabelText, { color: "#1E293B" }]}>Scheduled</Text>
                    <Text style={styles.metricSublabelText}>Total doses</Text>
                  </View>

                  {/* Taken */}
                  <View style={[styles.metricTile, styles.tileTaken]}>
                    <View style={[styles.metricIconCircle, { backgroundColor: "#16A34A" }]}>
                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.metricNumberText, { color: "#16A34A" }]}>
                      {takenCount}
                    </Text>
                    <Text style={[styles.metricLabelText, { color: "#16A34A" }]}>Taken</Text>
                    <Text style={styles.metricSublabelText}>Completed doses</Text>
                  </View>

                  {/* Skipped */}
                  <View style={[styles.metricTile, styles.tileSkipped]}>
                    <View style={[styles.metricIconCircle, { backgroundColor: "#DC2626" }]}>
                      <Ionicons name="close" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.metricNumberText, { color: "#DC2626" }]}>
                      {skippedCount}
                    </Text>
                    <Text style={[styles.metricLabelText, { color: "#DC2626" }]}>Skipped</Text>
                    <Text style={styles.metricSublabelText}>Missed doses</Text>
                  </View>

                  {/* Pending */}
                  <View style={[styles.metricTile, styles.tilePending]}>
                    <View style={[styles.metricIconCircle, { backgroundColor: "#D97706" }]}>
                      <Ionicons name="time-outline" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.metricNumberText, { color: "#D97706" }]}>
                      {pendingCount}
                    </Text>
                    <Text style={[styles.metricLabelText, { color: "#D97706" }]}>Pending</Text>
                    <Text style={styles.metricSublabelText}>Upcoming doses</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 5. Medication Breakdown Section */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Medication Breakdown</Text>
                <TouchableOpacity
                  style={styles.sortDropdownButton}
                  onPress={toggleSortOption}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort medications: currently ${sortLabel}`}
                >
                  <Text style={styles.sortDropdownText}>{sortLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>

              <View style={styles.medicationsListCard}>
                {sortedMedicines.length === 0 ? (
                  <Text style={styles.emptyMedicationsText}>
                    No medications were active during this reporting period.
                  </Text>
                ) : (
                  sortedMedicines.map((med, idx) => {
                    const themeColor = PILL_COLORS[idx % PILL_COLORS.length];
                    const medPct = Math.max(0, Math.min(100, Math.round(med.adherencePercentage)));

                    return (
                      <View
                        key={med.medicineId}
                        style={[
                          styles.medicineRow,
                          idx < sortedMedicines.length - 1 && styles.medicineRowBorder,
                        ]}
                      >
                        {/* Pill Icon Circle */}
                        <View
                          style={[
                            styles.medicineIconCircle,
                            { backgroundColor: themeColor.bg },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name="pill"
                            size={18}
                            color={themeColor.color}
                          />
                        </View>

                        {/* Medicine Info */}
                        <View style={styles.medicineInfoCol}>
                          <Text style={styles.medicineNameText} numberOfLines={1}>
                            {med.medicineName}
                          </Text>
                          <Text style={styles.medicineDosageText} numberOfLines={1}>
                            {med.dosage} {med.dosageUnit}
                          </Text>
                        </View>

                        {/* Progress Bar & Doses Count */}
                        <View style={styles.medicineProgressCol}>
                          <Text style={styles.medicineDosesRatioText}>
                            {med.takenCount} taken / {med.totalScheduled} scheduled
                          </Text>
                          <View style={styles.medicineProgressBarTrack}>
                            <View
                              style={[
                                styles.medicineProgressBarFill,
                                { width: `${medPct}%` },
                              ]}
                            />
                          </View>
                        </View>

                        {/* Percentage Badge */}
                        <Text style={styles.medicinePercentageText}>{medPct}%</Text>

                        {/* Chevron */}
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#94A3B8"
                          style={{ marginLeft: 6 }}
                        />
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* 6. Adherence Over Time Section */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Adherence Over Time</Text>
              <View style={styles.chartCard}>
                <View style={styles.chartContainer}>
                  {/* Y-axis */}
                  <View style={styles.yAxisCol}>
                    <Text style={styles.yAxisLabel}>100%</Text>
                    <Text style={styles.yAxisLabel}>75%</Text>
                    <Text style={styles.yAxisLabel}>50%</Text>
                    <Text style={styles.yAxisLabel}>25%</Text>
                    <Text style={styles.yAxisLabel}>0%</Text>
                  </View>

                  {/* Bars & Gridlines area */}
                  <View style={styles.barsAreaWrapper}>
                    {/* Horizontal gridlines */}
                    <View style={styles.gridLinesContainer}>
                      <View style={styles.gridLine} />
                      <View style={styles.gridLine} />
                      <View style={styles.gridLine} />
                      <View style={styles.gridLine} />
                      <View style={styles.gridLine} />
                    </View>

                    {/* Bars */}
                    <View style={styles.barsRow}>
                      {trendDays.map((td, idx) => {
                        const barHeight = Math.max(6, Math.min(100, td.percentage));
                        return (
                          <View key={`${td.date}-${idx}`} style={styles.barCol}>
                            {/* Top percentage */}
                            <Text style={styles.barTopLabel}>{td.percentage}%</Text>

                            {/* Bar Track & Fill */}
                            <View style={styles.barTrack}>
                              <View
                                style={[
                                  styles.barFill,
                                  {
                                    height: `${barHeight}%`,
                                  },
                                ]}
                              />
                            </View>

                            {/* Day Name */}
                            <Text style={styles.barDayLabel}>{td.dayName}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* 7. Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              {/* Primary: Generate Report */}
              <TouchableOpacity
                style={styles.generateReportButton}
                onPress={handleDownloadPdf}
                disabled={isDownloadingPdf}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Generate report"
              >
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#FFFFFF"
                  style={{ marginRight: 10 }}
                />
                <View style={styles.generateButtonTextCol}>
                  <Text style={styles.generateButtonTitle}>
                    {isDownloadingPdf ? "Generating Report..." : "Generate Report"}
                  </Text>
                  <Text style={styles.generateButtonSubtitle}>
                    Create a report for the selected period.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Secondary: View Previous Reports */}
              <TouchableOpacity
                style={styles.previousReportsButton}
                onPress={handleViewPreviousReports}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="View previous reports"
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.previousReportsButtonText}>View Previous Reports</Text>
              </TouchableOpacity>
            </View>

            {/* Medical Disclaimer */}
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

      {/* 8. Bottom Navigation */}
      {!hideBottomNav && (
        <View style={styles.bottomTabBar}>
          {/* Home Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={onBack}
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            accessibilityLabel="Home tab"
          >
            <Ionicons name="home-outline" size={22} color="#94A3B8" />
            <Text style={styles.tabItemLabel}>Home</Text>
          </TouchableOpacity>

          {/* Medicines Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={onNavigateToMedicines}
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            accessibilityLabel="Medicines tab"
          >
            <Ionicons name="medkit-outline" size={22} color="#94A3B8" />
            <Text style={styles.tabItemLabel}>Medicines</Text>
          </TouchableOpacity>

          {/* Calendar Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={onNavigateToCalendar}
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            accessibilityLabel="Calendar tab"
          >
            <Ionicons name="calendar-outline" size={22} color="#94A3B8" />
            <Text style={styles.tabItemLabel}>Calendar</Text>
          </TouchableOpacity>

          {/* Profile Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={onNavigateToProfile}
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            accessibilityLabel="Profile tab"
          >
            <Ionicons name="person-outline" size={22} color="#94A3B8" />
            <Text style={styles.tabItemLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

export default ReportsScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  /* 1. Header */
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 12,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    marginRight: 12,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Caregiver Selector */
  caregiverSelectorContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  caregiverSelectorLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  patientPillRow: {
    flexDirection: "row",
    gap: 8,
  },
  patientPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  patientPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  patientPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  patientPillTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  noPatientsText: {
    fontSize: 12,
    color: colors.textMuted,
  },

  /* 2. Period Control Header */
  periodControlContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  periodSectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  periodPillGroup: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    padding: 3,
    gap: 4,
  },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  periodPillSelected: {
    backgroundColor: colors.primary,
  },
  periodPillUnselected: {
    backgroundColor: "transparent",
  },
  periodPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  periodPillTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  periodPillTextUnselected: {
    color: colors.textSecondary,
  },

  /* 3. Date Range Box */
  dateRangeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  dateRangeText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
  },

  loaderBox: {
    paddingVertical: 60,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
    fontWeight: "500",
  },
  errorWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    fontWeight: "500",
  },

  /* Sections */
  sectionContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sortDropdownButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  sortDropdownText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  /* 4. Report Summary Card */
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  ringCol: {
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingCircle: {
    borderWidth: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  progressPercentageText: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  progressLabelText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: 1,
  },
  summaryMessageCol: {
    flex: 1,
    marginLeft: 18,
  },
  progressTitleText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  progressSubtitleText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },

  /* Metric Tiles Row */
  metricTilesRow: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 14,
  },
  metricTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tileScheduled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  tileTaken: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
  },
  tileSkipped: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FEE2E2",
  },
  tilePending: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FEF3C7",
  },
  metricIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  metricNumberText: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 6,
  },
  metricLabelText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  metricSublabelText: {
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },

  /* 5. Medication Breakdown */
  medicationsListCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  medicineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  medicineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  medicineIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  medicineInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  medicineNameText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  medicineDosageText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  medicineProgressCol: {
    width: 110,
    marginRight: 8,
  },
  medicineDosesRatioText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  medicineProgressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  medicineProgressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  medicinePercentageText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    minWidth: 32,
    textAlign: "right",
  },
  emptyMedicationsText: {
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: 20,
    textAlign: "center",
  },

  /* 6. Adherence Over Time */
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  chartContainer: {
    flexDirection: "row",
    height: 160,
    alignItems: "flex-end",
  },
  yAxisCol: {
    width: 34,
    height: 120,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 6,
    paddingBottom: 20,
  },
  yAxisLabel: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
  },
  barsAreaWrapper: {
    flex: 1,
    height: 160,
    position: "relative",
  },
  gridLinesContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 120,
    justifyContent: "space-between",
  },
  gridLine: {
    height: 1,
    backgroundColor: "#F1F5F9",
    width: "100%",
  },
  barsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    height: 160,
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    height: 160,
    justifyContent: "flex-end",
  },
  barTopLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  barTrack: {
    width: 18,
    height: 100,
    backgroundColor: "#E2E8F0",
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  barDayLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: 6,
  },

  /* 7. Action Buttons */
  actionButtonsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  generateReportButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  generateButtonTextCol: {
    flex: 1,
  },
  generateButtonTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  generateButtonSubtitle: {
    fontSize: 11,
    color: "#CCFBF1",
    marginTop: 1,
  },
  previousReportsButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  previousReportsButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },

  /* Disclaimer Box */
  disclaimerBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  disclaimerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
    marginBottom: 2,
  },
  disclaimerText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },

  /* 8. Bottom Navigation */
  bottomTabBar: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingBottom: Platform.OS === "android" ? 8 : 12,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 3,
  },
});
