/**
 * Patient Monitoring Detail Screen (PDF Page 11 / 33 Redesign).
 *
 * Dedicated healthcare monitoring screen for authenticated caregivers
 * viewing a selected linked patient's real-time adherence and medication status.
 *
 * Features:
 * - Strictly read-only for caregiver accounts (zero mutation/schedule modification controls)
 * - Safe area protected header ensuring zero collision with Android status bar or notch
 * - Patient overview card with initial avatar, connection status, and "View Profile >"
 * - Medication Adherence card with circular percentage gauge, dose count, progress bar & 3 stat tiles
 * - Today's Medications list with pill icons, scheduled times, status badges, and details
 * - "Needs Attention" card highlighting missed doses with "View Activity" action
 * - "Recent Activity" timeline with status icons, timestamps, and badges
 * - Modals for Patient Profile, Full Day Schedule, and Header Options (⋮)
 * - Pull-to-refresh and comprehensive loading / error / empty states
 * - Hardware back press handling returning to Caregiver Dashboard
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMedicationCalendar, getLocalTodayString } from "../../api/calendar";
import { getCaregiverAlerts, getPatientSummary } from "../../api/caregivers";
import { Button } from "../../components/common/Button";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import {
  CalendarOccurrence,
  CaregiverMonitoringSummary,
  CaregiverNotificationAlert,
} from "../../types";

interface PatientMonitoringDetailScreenProps {
  patientId: string;
  patientName: string;
  relationship: string;
  onBack: () => void;
  onViewAlerts: () => void;
  onViewReports?: () => void;
}

interface ActivityEvent {
  id: string;
  time: string;
  medicineName: string;
  description: string;
  type: "missed" | "taken" | "snoozed" | "skipped";
}

export const PatientMonitoringDetailScreen: React.FC<PatientMonitoringDetailScreenProps> = ({
  patientId,
  patientName,
  relationship,
  onBack,
  onViewAlerts,
  onViewReports,
}) => {
  // Safe area handling for Android status bar & camera notch
  let insetsTop = 0;
  let insetsBottom = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
    insetsBottom = insets?.bottom || 0;
  } catch {
    insetsTop = 0;
    insetsBottom = 0;
  }
  const statusBarHeight =
    Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

  // Screen state
  const [summary, setSummary] = useState<CaregiverMonitoringSummary | null>(null);
  const [occurrences, setOccurrences] = useState<CalendarOccurrence[]>([]);
  const [patientAlerts, setPatientAlerts] = useState<CaregiverNotificationAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRevoked, setIsRevoked] = useState<boolean>(false);

  // Modals
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState<boolean>(false);
  const [selectedMedDetail, setSelectedMedDetail] = useState<CalendarOccurrence | null>(null);

  // Hardware back button handler (Android)
  useEffect(() => {
    const handleHardwareBack = () => {
      onBack();
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handleHardwareBack);
    return () => sub.remove();
  }, [onBack]);

  // Load all real data for this patient
  const loadPatientData = useCallback(async () => {
    try {
      setError(null);
      setIsRevoked(false);
      const todayStr = getLocalTodayString();

      const [summaryRes, calendarRes, alertsRes] = await Promise.all([
        getPatientSummary(patientId),
        getMedicationCalendar({
          startDate: todayStr,
          endDate: todayStr,
          patientId,
        }).catch(() => null),
        getCaregiverAlerts(undefined, patientId).catch(() => []),
      ]);

      setSummary(summaryRes);
      if (calendarRes && Array.isArray(calendarRes.occurrences)) {
        setOccurrences(calendarRes.occurrences);
      } else {
        setOccurrences([]);
      }
      setPatientAlerts(alertsRes || []);
    } catch (err: any) {
      console.error("[PatientMonitoringDetail] Error fetching data:", err);
      if (err?.response?.status === 403) {
        setIsRevoked(true);
        setError(
          "Access Revoked: You do not have an active caregiver relationship with this patient, or access was revoked."
        );
      } else {
        const msg =
          err?.response?.data?.detail ||
          "Unable to load patient adherence data. Please try again.";
        setError(msg);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadPatientData();
  };

  // Format today's date label (e.g. "Today, Sep 24")
  const getFormattedToday = (): string => {
    const d = new Date();
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    return `Today, ${month} ${day}`;
  };

  // Format dose time string (e.g. "09:00" -> "09:00 AM", "14:30" -> "02:30 PM")
  const formatDoseTime = (timeStr?: string): string => {
    if (!timeStr) return "";
    const cleanStr = timeStr.trim();
    const parts = cleanStr.split(":");
    if (parts.length < 2) return cleanStr;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].slice(0, 2);
    if (isNaN(hours)) return cleanStr;
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const paddedHours = hours < 10 ? `0${hours}` : `${hours}`;
    return `${paddedHours}:${minutes} ${ampm}`;
  };

  // Format timestamp for activity items
  const formatActivityTime = (isoString?: string, fallbackTime?: string): string => {
    if (fallbackTime) return formatDoseTime(fallbackTime);
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timeStr = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (isToday) return timeStr;
      if (isYesterday) return `Yesterday ${timeStr}`;
      return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${timeStr}`;
    } catch {
      return fallbackTime || "";
    }
  };

  // Derive metrics
  const totalDoses =
    summary?.totalScheduledToday ?? (occurrences.length || 0);
  const takenDoses =
    summary?.takenToday ??
    occurrences.filter((o) => (o.status as string).toLowerCase() === "taken").length;
  const skippedDoses =
    summary
      ? summary.skippedToday + summary.missedToday
      : occurrences.filter((o) => {
          const st = (o.status as string).toLowerCase();
          return st === "skipped" || st === "missed";
        }).length;
  const pendingDoses = Math.max(0, totalDoses - takenDoses - skippedDoses);
  const adherencePct = Math.round(
    summary?.adherencePercentage ?? (totalDoses > 0 ? (takenDoses / totalDoses) * 100 : 100)
  );

  const effectivePatientName = summary?.patientName || patientName || "Patient";
  const patientInitial = effectivePatientName.charAt(0).toUpperCase();

  // Today's medications list: sorted by time
  const todayMeds = [...occurrences].sort((a, b) =>
    (a.scheduledTime || "").localeCompare(b.scheduledTime || "")
  );

  // Needs Attention item derivation
  const missedOccurrence = occurrences.find(
    (o) => (o.status as string).toLowerCase() === "missed"
  );
  const recentMissedAlert = summary?.recentAlerts?.find(
    (a) => a.missedDosesCount > 0 || a.alertMessage?.toLowerCase().includes("missed")
  );
  const unreadAlert = patientAlerts.find((a) => a.status === "unread");

  let attentionItem: {
    medicineName: string;
    message: string;
  } | null = null;

  if (missedOccurrence) {
    const formattedTime = formatDoseTime(missedOccurrence.scheduledTime);
    attentionItem = {
      medicineName: `${missedOccurrence.medicineName} ${missedOccurrence.dosage}${missedOccurrence.dosageUnit || ""}`.trim(),
      message: `Dose scheduled for ${formattedTime} was missed.`,
    };
  } else if (recentMissedAlert) {
    const formattedTime = formatDoseTime(recentMissedAlert.scheduledTimes?.[0]);
    attentionItem = {
      medicineName: recentMissedAlert.medicineName,
      message:
        recentMissedAlert.alertMessage ||
        (formattedTime
          ? `Dose scheduled for ${formattedTime} was missed.`
          : "Scheduled medication dose was missed."),
    };
  } else if (unreadAlert) {
    const schedTime = formatDoseTime(unreadAlert.metadata?.scheduledTime);
    attentionItem = {
      medicineName: unreadAlert.metadata?.medicineName || unreadAlert.title,
      message:
        unreadAlert.message ||
        (schedTime
          ? `Dose scheduled for ${schedTime} was missed.`
          : "Medication adherence alert recorded."),
    };
  }

  // Derive Recent Activity items
  const recentActivities: ActivityEvent[] = [];

  // 1. Add alert items
  if (summary?.recentAlerts) {
    summary.recentAlerts.forEach((a, idx) => {
      recentActivities.push({
        id: `alert-${idx}`,
        time: formatActivityTime(a.timestamp, a.scheduledTimes?.[0]),
        medicineName: a.medicineName,
        description: a.alertMessage || "Scheduled dose missed",
        type: "missed",
      });
    });
  }

  // 2. Add occurrences with active events
  occurrences.forEach((o, idx) => {
    const st = (o.status as string).toLowerCase();
    if (st === "taken") {
      recentActivities.push({
        id: `occ-taken-${idx}`,
        time: formatActivityTime(o.actionTime || undefined, o.scheduledTime),
        medicineName: `${o.medicineName} ${o.dosage}${o.dosageUnit || ""}`.trim(),
        description: "Taken as scheduled",
        type: "taken",
      });
    } else if (st === "snoozed" || o.wasSnoozed) {
      recentActivities.push({
        id: `occ-snooze-${idx}`,
        time: formatDoseTime(o.scheduledTime),
        medicineName: `${o.medicineName} ${o.dosage}${o.dosageUnit || ""}`.trim(),
        description: "Snoozed by patient",
        type: "snoozed",
      });
    } else if (st === "missed" && !summary?.recentAlerts?.some((a) => a.medicineName === o.medicineName)) {
      recentActivities.push({
        id: `occ-missed-${idx}`,
        time: formatDoseTime(o.scheduledTime),
        medicineName: `${o.medicineName} ${o.dosage}${o.dosageUnit || ""}`.trim(),
        description: "Scheduled dose missed",
        type: "missed",
      });
    } else if (st === "skipped") {
      recentActivities.push({
        id: `occ-skipped-${idx}`,
        time: formatDoseTime(o.scheduledTime),
        medicineName: `${o.medicineName} ${o.dosage}${o.dosageUnit || ""}`.trim(),
        description: o.skipReason ? `Skipped: ${o.skipReason}` : "Dose skipped by patient",
        type: "skipped",
      });
    }
  });

  return (
    <View style={styles.container}>
      {/* 1. Safe-Area Protected Top Header */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={onBack}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="Back to patients list"
          >
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Patient Details</Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setIsOptionsMenuOpen(true)}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="Options menu"
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerContainer}>
          <LoadingState message="Loading patient monitoring details..." />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <ErrorState
            title={isRevoked ? "Access Not Authorized" : "Unable to Load Details"}
            message={error}
            onRetry={isRevoked ? undefined : loadPatientData}
          />
          {isRevoked && (
            <Button
              title="Return to Dashboard"
              onPress={onBack}
              variant="primary"
              style={{ marginTop: spacing.md, minWidth: 160 }}
            />
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insetsBottom + spacing.xxl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={["#0D9488"]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* 2. Patient Profile Overview Card (Teal Initial + View Profile >) */}
          <View style={styles.patientCard}>
            <View style={styles.patientAvatar}>
              <Text style={styles.patientAvatarText}>{patientInitial}</Text>
            </View>

            <View style={styles.patientInfoCol}>
              <Text style={styles.patientNameText} numberOfLines={1}>
                {effectivePatientName}
              </Text>
              <Text style={styles.patientSubText}>
                Connected Patient{relationship ? ` • ${relationship}` : ""}
              </Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Caregiver connection active</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.viewProfileBtn}
              onPress={() => setIsProfileModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="View Patient Profile"
            >
              <Text style={styles.viewProfileBtnText}>View Profile &gt;</Text>
            </TouchableOpacity>
          </View>

          {/* 3. Medication Adherence Card (Circular Ring + Doses Bar + 3 Stat Tiles) */}
          <View style={styles.adherenceCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardSectionTitle}>Medication Adherence</Text>
              <View style={styles.dateBadge}>
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color="#64748B"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.dateBadgeText}>{getFormattedToday()}</Text>
              </View>
            </View>

            {/* Circular Percentage + Horizontal Progress Bar */}
            <View style={styles.progressRow}>
              {/* Circular Gauge */}
              <View style={styles.circleRing}>
                <Text style={styles.circlePercentText}>{adherencePct}%</Text>
              </View>

              {/* Doses Completed & Fill Bar */}
              <View style={styles.progressTextCol}>
                <Text style={styles.dosesCompletedText}>
                  {totalDoses > 0
                    ? `${takenDoses} of ${totalDoses} scheduled doses completed`
                    : "No scheduled doses for today"}
                </Text>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width:
                          totalDoses > 0
                            ? `${Math.min(100, Math.max(0, adherencePct))}%`
                            : "100%",
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* 3 Stat Tiles: Taken, Pending, Skipped */}
            <View style={styles.statsTilesRow}>
              {/* Taken Tile */}
              <View style={[styles.statTile, styles.takenTile]}>
                <View style={styles.statTileHeader}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                  <Text style={styles.statTileLabel}>Taken</Text>
                </View>
                <Text style={[styles.statTileNumber, { color: "#16A34A" }]}>
                  {takenDoses}
                </Text>
              </View>

              {/* Pending Tile */}
              <View style={[styles.statTile, styles.pendingTile]}>
                <View style={styles.statTileHeader}>
                  <Ionicons name="time" size={16} color="#D97706" />
                  <Text style={styles.statTileLabel}>Pending</Text>
                </View>
                <Text style={[styles.statTileNumber, { color: "#D97706" }]}>
                  {pendingDoses}
                </Text>
              </View>

              {/* Skipped Tile */}
              <View style={[styles.statTile, styles.skippedTile]}>
                <View style={styles.statTileHeader}>
                  <Ionicons name="close-circle" size={16} color="#DC2626" />
                  <Text style={styles.statTileLabel}>Skipped</Text>
                </View>
                <Text style={[styles.statTileNumber, { color: "#DC2626" }]}>
                  {skippedDoses}
                </Text>
              </View>
            </View>
          </View>

          {/* 4. Today's Medications Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Today's Medications</Text>
              <TouchableOpacity
                onPress={() => setIsScheduleModalOpen(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.sectionLinkTeal}>View Schedule &gt;</Text>
              </TouchableOpacity>
            </View>

            {todayMeds.length > 0 ? (
              todayMeds.map((item, idx) => {
                const itemSt = (item.status as string).toLowerCase();
                const isTaken = itemSt === "taken";
                const isMissed = itemSt === "missed";
                const isSkipped = itemSt === "skipped";
                const isUpcoming = itemSt === "pending" || itemSt === "snoozed";

                const badgeBg = isTaken
                  ? "#ECFDF5"
                  : isMissed || isSkipped
                  ? "#FEF2F2"
                  : "#F0F9FF";
                const iconColor = isTaken
                  ? "#059669"
                  : isMissed || isSkipped
                  ? "#DC2626"
                  : "#0284C7";

                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.medicationCard}
                    onPress={() => setSelectedMedDetail(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.medIconBadge, { backgroundColor: badgeBg }]}>
                      <Ionicons name="medical" size={18} color={iconColor} />
                    </View>

                    <View style={styles.medInfoCol}>
                      <Text style={styles.medNameText} numberOfLines={1}>
                        {item.medicineName}
                      </Text>
                      <Text style={styles.medDosageText} numberOfLines={1}>
                        {item.dosage} {item.dosageUnit || ""} •{" "}
                        {item.frequencyType || "1 tablet"}
                      </Text>
                    </View>

                    <View style={styles.medRightCol}>
                      <Text style={styles.medTimeText}>
                        {formatDoseTime(item.scheduledTime)}
                      </Text>

                      {isTaken && (
                        <View style={styles.statusPillTaken}>
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color="#166534"
                            style={{ marginRight: 2 }}
                          />
                          <Text style={styles.statusPillTakenText}>Taken</Text>
                        </View>
                      )}
                      {isMissed && (
                        <View style={styles.statusPillMissed}>
                          <Ionicons
                            name="close"
                            size={12}
                            color="#DC2626"
                            style={{ marginRight: 2 }}
                          />
                          <Text style={styles.statusPillMissedText}>Missed</Text>
                        </View>
                      )}
                      {isSkipped && (
                        <View style={styles.statusPillMissed}>
                          <Ionicons
                            name="close"
                            size={12}
                            color="#DC2626"
                            style={{ marginRight: 2 }}
                          />
                          <Text style={styles.statusPillMissedText}>Skipped</Text>
                        </View>
                      )}
                      {isUpcoming && (
                        <View style={styles.statusPillUpcoming}>
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color="#475569"
                            style={{ marginRight: 2 }}
                          />
                          <Text style={styles.statusPillUpcomingText}>Upcoming</Text>
                        </View>
                      )}

                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color="#94A3B8"
                        style={{ marginLeft: 4 }}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyMedsCard}>
                <Ionicons name="calendar-outline" size={24} color="#94A3B8" />
                <Text style={styles.emptyMedsText}>
                  No medications scheduled for today.
                </Text>
              </View>
            )}
          </View>

          {/* 5. "Needs Attention" Section (Missed Dose Red Card) */}
          {attentionItem && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.attentionHeaderTitleRow}>
                  <View style={styles.redExclamationCircle}>
                    <Text style={styles.redExclamationText}>!</Text>
                  </View>
                  <Text style={styles.attentionSectionTitle}>Needs Attention</Text>
                </View>
                <TouchableOpacity
                  onPress={onViewAlerts}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.viewAllTextRed}>View All &gt;</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.attentionCard}>
                <View style={styles.attentionPillBadge}>
                  <Ionicons name="medical" size={18} color="#DC2626" />
                </View>

                <View style={styles.attentionInfoCol}>
                  <Text style={styles.attentionMedName} numberOfLines={1}>
                    {attentionItem.medicineName}
                  </Text>
                  <Text style={styles.attentionMessageText} numberOfLines={2}>
                    {attentionItem.message}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.viewActivityBtn}
                  onPress={onViewAlerts}
                  accessibilityRole="button"
                  accessibilityLabel="View Activity"
                >
                  <Text style={styles.viewActivityBtnText}>View Activity</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 6. "Recent Activity" Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity
                onPress={onViewAlerts}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.sectionLinkTeal}>View All &gt;</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activityContainerCard}>
              {recentActivities.length > 0 ? (
                recentActivities.slice(0, 5).map((act, idx) => {
                  const isMissed = act.type === "missed";
                  const isTaken = act.type === "taken";
                  const isSnoozed = act.type === "snoozed";

                  return (
                    <View
                      key={act.id || idx}
                      style={[
                        styles.activityRow,
                        idx === Math.min(recentActivities.length, 5) - 1 && {
                          borderBottomWidth: 0,
                        },
                      ]}
                    >
                      {/* Status Icon Circle */}
                      <View
                        style={[
                          styles.activityIconCircle,
                          isMissed
                            ? styles.activityIconMissed
                            : isTaken
                            ? styles.activityIconTaken
                            : styles.activityIconSnoozed,
                        ]}
                      >
                        {isMissed && (
                          <Ionicons name="close" size={13} color="#FFFFFF" />
                        )}
                        {isTaken && (
                          <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                        )}
                        {isSnoozed && (
                          <Ionicons name="time" size={13} color="#FFFFFF" />
                        )}
                      </View>

                      {/* Time Column */}
                      <View style={styles.activityTimeCol}>
                        <Text style={styles.activityTimeText}>{act.time}</Text>
                      </View>

                      {/* Detail Column */}
                      <View style={styles.activityDetailCol}>
                        <Text style={styles.activityMedName} numberOfLines={1}>
                          {act.medicineName}
                        </Text>
                        <Text style={styles.activityDescText} numberOfLines={1}>
                          {act.description}
                        </Text>
                      </View>

                      {/* Pill Badge on Right */}
                      <View
                        style={[
                          styles.activityStatusPill,
                          isMissed
                            ? styles.pillMissedBg
                            : isTaken
                            ? styles.pillTakenBg
                            : styles.pillSnoozedBg,
                        ]}
                      >
                        <Text
                          style={[
                            styles.activityStatusPillText,
                            isMissed
                              ? styles.pillMissedText
                              : isTaken
                              ? styles.pillTakenText
                              : styles.pillSnoozedText,
                          ]}
                        >
                          {isMissed
                            ? "Missed"
                            : isTaken
                            ? "Taken"
                            : isSnoozed
                            ? "Snoozed"
                            : "Skipped"}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyActivityBox}>
                  <Text style={styles.emptyActivityText}>
                    No medication activity recorded today.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* 7. Clinical Adherence Reports Shortcut */}
          {onViewReports && (
            <View style={styles.reportsBanner}>
              <View style={styles.reportsBannerLeft}>
                <Text style={styles.reportsBannerTitle}>
                  Clinical Adherence Reports
                </Text>
                <Text style={styles.reportsBannerSub}>
                  Download weekly or monthly PDF reports for {effectivePatientName}.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.reportsBannerBtn}
                onPress={onViewReports}
                accessibilityRole="button"
                accessibilityLabel="View Adherence Reports"
              >
                <Text style={styles.reportsBannerBtnText}>View Reports &gt;</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 8. Medical Safety Notice */}
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
            <Text style={styles.disclaimerText}>
              {summary?.medical_disclaimer || config.medicalDisclaimer}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: Patient Profile & Connection Info                          */}
      {/* =================================================================== */}
      <Modal
        visible={isProfileModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsProfileModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Patient Profile</Text>
              <TouchableOpacity
                onPress={() => setIsProfileModalOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalAvatarRow}>
              <View style={styles.modalAvatarBadge}>
                <Text style={styles.modalAvatarText}>{patientInitial}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalPatientName}>{effectivePatientName}</Text>
                <Text style={styles.modalPatientRel}>
                  Relationship: {relationship || "Connected Patient"}
                </Text>
                <Text style={styles.modalPatientActive}>
                  ● Active Caregiver Connection
                </Text>
              </View>
            </View>

            {/* Streak & Adherence Stats */}
            <View style={styles.modalStatsGrid}>
              <View style={styles.modalStatBox}>
                <Text style={styles.modalStatVal}>
                  {summary?.currentStreak ?? 0}
                </Text>
                <Text style={styles.modalStatLbl}>Current Streak (Days)</Text>
              </View>
              <View style={styles.modalStatBox}>
                <Text style={styles.modalStatVal}>
                  {summary?.longestStreak ?? 0}
                </Text>
                <Text style={styles.modalStatLbl}>Longest Streak</Text>
              </View>
              <View style={styles.modalStatBox}>
                <Text style={styles.modalStatVal}>{adherencePct}%</Text>
                <Text style={styles.modalStatLbl}>Adherence Rate</Text>
              </View>
            </View>

            {/* Quick Actions */}
            {onViewReports && (
              <Button
                title="📊 View Clinical Adherence Reports"
                onPress={() => {
                  setIsProfileModalOpen(false);
                  onViewReports();
                }}
                variant="primary"
                style={{ marginTop: 12 }}
              />
            )}
            <Button
              title="🔔 View Caregiver Alerts"
              onPress={() => {
                setIsProfileModalOpen(false);
                onViewAlerts();
              }}
              variant="outline"
              style={{ marginTop: 8 }}
            />
            <Button
              title="Close"
              onPress={() => setIsProfileModalOpen(false)}
              variant="text"
              style={{ marginTop: 4 }}
            />
          </View>
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL 2: Full Schedule Modal                                        */}
      {/* =================================================================== */}
      <Modal
        visible={isScheduleModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsScheduleModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentCard, { maxHeight: "80%" }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Today's Full Schedule</Text>
              <TouchableOpacity
                onPress={() => setIsScheduleModalOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {todayMeds.length > 0 ? (
                todayMeds.map((med, idx) => (
                  <View key={idx} style={styles.scheduleItemRow}>
                    <View style={styles.scheduleTimeBadge}>
                      <Text style={styles.scheduleTimeBadgeText}>
                        {formatDoseTime(med.scheduledTime)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.scheduleMedName}>{med.medicineName}</Text>
                      <Text style={styles.scheduleMedDosage}>
                        {med.dosage} {med.dosageUnit || ""} • {med.frequencyType}
                      </Text>
                    </View>
                    {(() => {
                      const medSt = (med.status as string).toLowerCase();
                      const isTaken = medSt === "taken";
                      const isMissed = medSt === "missed";
                      return (
                        <View
                          style={[
                            styles.scheduleStatusBadge,
                            isTaken
                              ? styles.pillTakenBg
                              : isMissed
                              ? styles.pillMissedBg
                              : styles.pillSnoozedBg,
                          ]}
                        >
                          <Text
                            style={[
                              styles.scheduleStatusText,
                              isTaken
                                ? styles.pillTakenText
                                : isMissed
                                ? styles.pillMissedText
                                : styles.pillSnoozedText,
                            ]}
                          >
                            {(med.status as string).toUpperCase()}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                ))
              ) : (
                <Text style={styles.emptyActivityText}>
                  No medication occurrences scheduled for today.
                </Text>
              )}
            </ScrollView>

            <Button
              title="Close Schedule"
              onPress={() => setIsScheduleModalOpen(false)}
              variant="outline"
              style={{ marginTop: 14 }}
            />
          </View>
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL 3: Medication Occurrence Detail Modal                         */}
      {/* =================================================================== */}
      <Modal
        visible={Boolean(selectedMedDetail)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedMedDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Medication Details</Text>
              <TouchableOpacity
                onPress={() => setSelectedMedDetail(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {selectedMedDetail && (
              <View style={{ marginTop: 8 }}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Medicine:</Text>
                  <Text style={styles.detailValue}>
                    {selectedMedDetail.medicineName}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Dosage:</Text>
                  <Text style={styles.detailValue}>
                    {selectedMedDetail.dosage} {selectedMedDetail.dosageUnit || ""}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Scheduled Time:</Text>
                  <Text style={styles.detailValue}>
                    {formatDoseTime(selectedMedDetail.scheduledTime)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color:
                          (selectedMedDetail.status as string).toLowerCase() === "taken"
                            ? "#166534"
                            : (selectedMedDetail.status as string).toLowerCase() === "missed"
                            ? "#DC2626"
                            : "#0D9488",
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {(selectedMedDetail.status as string).toUpperCase()}
                  </Text>
                </View>
                {selectedMedDetail.actionTime && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Recorded Time:</Text>
                    <Text style={styles.detailValue}>
                      {formatActivityTime(selectedMedDetail.actionTime)}
                    </Text>
                  </View>
                )}
                {selectedMedDetail.skipReason && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Skip Reason:</Text>
                    <Text style={styles.detailValue}>
                      {selectedMedDetail.skipReason}
                    </Text>
                  </View>
                )}

                <View style={styles.readOnlyDetailBanner}>
                  <Ionicons name="shield-checkmark" size={16} color="#0D9488" />
                  <Text style={styles.readOnlyDetailText}>
                    Caregiver Read-Only Mode: Schedule modifications and dose logging
                    can only be made by the patient.
                  </Text>
                </View>
              </View>
            )}

            <Button
              title="Close"
              onPress={() => setSelectedMedDetail(null)}
              variant="outline"
              style={{ marginTop: 14 }}
            />
          </View>
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL 4: Header Options Sheet (⋮)                                  */}
      {/* =================================================================== */}
      <Modal
        visible={isOptionsMenuOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsOptionsMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOptionsMenuOpen(false)}
        >
          <View style={styles.optionsSheetCard}>
            <Text style={styles.optionsSheetTitle}>Patient Options</Text>

            <TouchableOpacity
              style={styles.optionItemRow}
              onPress={() => {
                setIsOptionsMenuOpen(false);
                setIsProfileModalOpen(true);
              }}
            >
              <Ionicons name="person-circle-outline" size={20} color="#0F172A" />
              <Text style={styles.optionItemText}>View Patient Profile</Text>
            </TouchableOpacity>

            {onViewReports && (
              <TouchableOpacity
                style={styles.optionItemRow}
                onPress={() => {
                  setIsOptionsMenuOpen(false);
                  onViewReports();
                }}
              >
                <Ionicons name="stats-chart-outline" size={20} color="#0D9488" />
                <Text style={styles.optionItemText}>Clinical Adherence Reports</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.optionItemRow}
              onPress={() => {
                setIsOptionsMenuOpen(false);
                onViewAlerts();
              }}
            >
              <Ionicons name="notifications-outline" size={20} color="#DC2626" />
              <Text style={styles.optionItemText}>Caregiver Alerts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionItemRow}
              onPress={() => {
                setIsOptionsMenuOpen(false);
                handleRefresh();
              }}
            >
              <Ionicons name="refresh-outline" size={20} color="#0F172A" />
              <Text style={styles.optionItemText}>Refresh Data</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionItemRow, { borderBottomWidth: 0, marginTop: 4 }]}
              onPress={() => setIsOptionsMenuOpen(false)}
            >
              <Ionicons name="close-circle-outline" size={20} color="#64748B" />
              <Text style={[styles.optionItemText, { color: "#64748B" }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },

  /* Safe Area Header */
  headerContainer: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },

  scrollContent: {
    padding: 16,
  },

  /* Patient Overview Card */
  patientCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  patientAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
  },
  patientAvatarText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  patientInfoCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  patientNameText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  patientSubText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#10B981",
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#059669",
  },
  viewProfileBtn: {
    borderWidth: 1,
    borderColor: "#0D9488",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  viewProfileBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Medication Adherence Card */
  adherenceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateBadgeText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  circleRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 6,
    borderColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 14,
  },
  circlePercentText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0D9488",
  },
  progressTextCol: {
    flex: 1,
  },
  dosesCompletedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 8,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#0D9488",
    borderRadius: 4,
  },

  /* 3 Stat Tiles */
  statsTilesRow: {
    flexDirection: "row",
    gap: 10,
  },
  statTile: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  takenTile: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
  },
  pendingTile: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FEF3C7",
  },
  skippedTile: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  statTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  statTileLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  statTileNumber: {
    fontSize: 18,
    fontWeight: "700",
  },

  /* Sections Common */
  sectionContainer: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  sectionLinkTeal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Medication Cards */
  medicationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  medIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  medInfoCol: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  medNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  medDosageText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  medRightCol: {
    flexDirection: "row",
    alignItems: "center",
  },
  medTimeText: {
    fontSize: 12,
    color: "#64748B",
    marginRight: 8,
    fontWeight: "500",
  },
  statusPillTaken: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillTakenText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
  },
  statusPillMissed: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillMissedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#DC2626",
  },
  statusPillUpcoming: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillUpcomingText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  emptyMedsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyMedsText: {
    fontSize: 13,
    color: "#64748B",
  },

  /* Needs Attention Section */
  attentionHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  redExclamationCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  redExclamationText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  attentionSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#DC2626",
  },
  viewAllTextRed: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
  attentionCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  attentionPillBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  attentionInfoCol: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  attentionMedName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  attentionMessageText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 16,
  },
  viewActivityBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewActivityBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Recent Activity Section */
  activityContainerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  activityIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activityIconMissed: {
    backgroundColor: "#DC2626",
  },
  activityIconTaken: {
    backgroundColor: "#16A34A",
  },
  activityIconSnoozed: {
    backgroundColor: "#64748B",
  },
  activityTimeCol: {
    width: 76,
    marginLeft: 8,
  },
  activityTimeText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  activityDetailCol: {
    flex: 1,
    marginLeft: 4,
    marginRight: 6,
  },
  activityMedName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  activityDescText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  activityStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  activityStatusPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  pillMissedBg: {
    backgroundColor: "#FEE2E2",
  },
  pillMissedText: {
    color: "#DC2626",
  },
  pillTakenBg: {
    backgroundColor: "#DCFCE7",
  },
  pillTakenText: {
    color: "#166534",
  },
  pillSnoozedBg: {
    backgroundColor: "#F1F5F9",
  },
  pillSnoozedText: {
    color: "#475569",
  },
  emptyActivityBox: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyActivityText: {
    fontSize: 13,
    color: "#64748B",
  },

  /* Reports Shortcut Banner */
  reportsBanner: {
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportsBannerLeft: {
    flex: 1,
    marginRight: 8,
  },
  reportsBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
  },
  reportsBannerSub: {
    fontSize: 12,
    color: "#0F766E",
    marginTop: 2,
  },
  reportsBannerBtn: {
    backgroundColor: "#0D9488",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reportsBannerBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  /* Medical Safety Notice */
  disclaimerBox: {
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  disclaimerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 3,
  },
  disclaimerText: {
    fontSize: 11,
    color: "#64748B",
    lineHeight: 16,
  },

  /* Modals Common */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContentCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  modalAvatarBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
  },
  modalAvatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalPatientName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalPatientRel: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  modalPatientActive: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
    marginTop: 2,
  },
  modalStatsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  modalStatBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  modalStatVal: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D9488",
  },
  modalStatLbl: {
    fontSize: 10,
    color: "#64748B",
    textAlign: "center",
    marginTop: 2,
  },

  /* Schedule Modal Row */
  scheduleItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  scheduleTimeBadge: {
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  scheduleTimeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  scheduleMedName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  scheduleMedDosage: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  scheduleStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  scheduleStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },

  /* Med Detail Rows */
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  detailLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  detailValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  readOnlyDetailBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 8,
    padding: 8,
    marginTop: 12,
  },
  readOnlyDetailText: {
    fontSize: 11,
    color: "#0F766E",
    flex: 1,
    lineHeight: 15,
  },

  /* Options Sheet Card */
  optionsSheetCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  optionsSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
    textAlign: "center",
  },
  optionItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  optionItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
});
