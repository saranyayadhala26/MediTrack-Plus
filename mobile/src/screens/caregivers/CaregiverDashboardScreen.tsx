/**
 * Caregiver Dashboard Screen (Redesigned matching PDF Page 12 / 33).
 *
 * Central healthcare monitoring hub for authenticated caregivers.
 * Features:
 * - Real API data: getLinkedPatients(), getPatientSummary(), getCaregiverAlerts()
 * - Safe area handling for Android status bar
 * - Monitored patient banner with multi-patient switcher support
 * - Today's Medication Adherence card with circular progress, doses count & stat tiles
 * - "Needs Attention" alert card for missed doses with pill icon
 * - "Today's Activity" timeline overview
 * - Quick Actions: "View Patient" & "View Alerts"
 * - Pull-to-refresh & robust loading / error / empty states
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getCaregiverAlerts,
  getLinkedPatients,
  getPatientSummary,
} from "../../api/caregivers";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { colors } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import {
  CaregiverMonitoringSummary,
  CaregiverNotificationAlert,
  LinkedPatient,
} from "../../types";

interface CaregiverDashboardScreenProps {
  onSelectPatient: (patient: LinkedPatient) => void;
  onViewAlerts: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToReports?: (patient?: LinkedPatient) => void;
}

export const CaregiverDashboardScreen: React.FC<CaregiverDashboardScreenProps> = ({
  onSelectPatient,
  onViewAlerts,
  onNavigateToProfile,
  onNavigateToReports,
}) => {
  const { user } = useAuth();

  // Safe area insets handling
  let insetsTop = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
  } catch {
    insetsTop = 0;
  }
  const statusBarHeight =
    Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

  // Component state
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [selectedPatientIndex, setSelectedPatientIndex] = useState<number>(0);
  const [summary, setSummary] = useState<CaregiverMonitoringSummary | null>(null);
  const [alerts, setAlerts] = useState<CaregiverNotificationAlert[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-patient switcher modal
  const [isPatientSwitcherOpen, setIsPatientSwitcherOpen] = useState<boolean>(false);

  // Active monitored patient
  const currentPatient: LinkedPatient | undefined = patients[selectedPatientIndex];

  // Fetch dashboard data
  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);
      const [patientsData, alertsData] = await Promise.all([
        getLinkedPatients(),
        getCaregiverAlerts("unread").catch(() => []),
      ]);

      const activePatients = patientsData || [];
      setPatients(activePatients);
      setAlerts(alertsData || []);
      setUnreadAlertsCount(alertsData?.length || 0);

      // If patients exist, load summary for the currently active patient
      if (activePatients.length > 0) {
        const activeIdx =
          selectedPatientIndex < activePatients.length ? selectedPatientIndex : 0;
        const targetPatient = activePatients[activeIdx];
        setIsLoadingSummary(true);
        try {
          const summaryData = await getPatientSummary(targetPatient.patientId);
          setSummary(summaryData);
        } catch {
          setSummary(null);
        } finally {
          setIsLoadingSummary(false);
        }
      } else {
        setSummary(null);
      }
    } catch (err: any) {
      console.error("[CaregiverDashboard] Error fetching data:", err);
      const msg =
        err?.response?.data?.detail ||
        "Unable to load monitored patients. Please check your connection and try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedPatientIndex]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Load summary whenever selected patient changes
  const handleSelectActivePatient = async (index: number) => {
    setSelectedPatientIndex(index);
    setIsPatientSwitcherOpen(false);
    const targetPatient = patients[index];
    if (targetPatient) {
      setIsLoadingSummary(true);
      try {
        const summaryData = await getPatientSummary(targetPatient.patientId);
        setSummary(summaryData);
      } catch {
        setSummary(null);
      } finally {
        setIsLoadingSummary(false);
      }
    }
  };

  // Hardware back press handler
  useEffect(() => {
    const onBackPress = () => {
      if (isPatientSwitcherOpen) {
        setIsPatientSwitcherOpen(false);
        return true;
      }
      return false;
    };

    const backSub = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );
    return () => backSub.remove();
  }, [isPatientSwitcherOpen]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboardData();
  };

  // Greeting based on current time
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  // Formatted date string for Page 12 adherence header
  const getFormattedDate = (): string => {
    const d = new Date();
    return `Today, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  };

  // Helper to format ISO time or HH:mm string to "02:30 PM"
  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return "Today";
    if (timeStr.includes("AM") || timeStr.includes("PM")) return timeStr;
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
      const hour = parseInt(parts[0], 10);
      const m = parts[1];
      const ampm = hour >= 12 ? "PM" : "AM";
      const formattedHour = hour % 12 || 12;
      return `${formattedHour.toString().padStart(2, "0")}:${m} ${ampm}`;
    }
    return timeStr;
  };

  // Extract patient 1-2 letter initial
  const getPatientInitials = (name?: string): string => {
    if (!name) return "P";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 1).toUpperCase();
  };

  // Derived metrics from summary
  const adherencePct = summary ? Math.round(summary.adherencePercentage) : 100;
  const totalDoses = summary?.totalScheduledToday ?? 0;
  const takenDoses = summary?.takenToday ?? 0;
  const skippedDoses = (summary?.skippedToday ?? 0) + (summary?.missedToday ?? 0);
  const pendingDoses = Math.max(0, totalDoses - takenDoses - (summary?.skippedToday ?? 0));

  // Determine most relevant missed/urgent alert for this patient
  const patientAlerts = alerts.filter(
    (a) => !currentPatient || a.patientId === currentPatient.patientId
  );
  const recentAlertItem =
    summary?.recentAlerts && summary.recentAlerts.length > 0
      ? summary.recentAlerts[0]
      : null;
  const notificationAlertItem = patientAlerts.length > 0 ? patientAlerts[0] : null;

  // Render initial loading state
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={[styles.centerContainer, { paddingTop: topInset }]}>
          <LoadingState message="Loading caregiver dashboard..." />
        </View>
      </SafeAreaView>
    );
  }

  // Render error state
  if (error && patients.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={[styles.centerContainer, { paddingTop: topInset }]}>
          <ErrorState
            title="Dashboard Unavailable"
            message={error}
            onRetry={loadDashboardData}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ================================================================= */}
      {/* 1. CAREGIVER DASHBOARD HEADER (Matching Page 12)                  */}
      {/* ================================================================= */}
      <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerGreeting}>{getGreeting()}</Text>
          <Text style={styles.screenTitle}>Caregiver Dashboard</Text>
        </View>

        <View style={styles.headerActionsRow}>
          {/* Unread Alerts Notification Bell */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onViewAlerts}
            accessibilityRole="button"
            accessibilityLabel={`Caregiver alerts. ${unreadAlertsCount} unread.`}
          >
            <Ionicons name="notifications-outline" size={22} color="#0F172A" />
            {unreadAlertsCount > 0 && <View style={styles.unreadBadgeDot} />}
          </TouchableOpacity>

          {/* Profile Navigation Button */}
          {onNavigateToProfile && (
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={onNavigateToProfile}
              accessibilityRole="button"
              accessibilityLabel="View profile"
            >
              <Ionicons name="person-outline" size={20} color="#0D9488" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
      >
        {patients.length === 0 ? (
          /* =============================================================== */
          /* EMPTY STATE (When no patients are linked)                       */
          /* =============================================================== */
          <EmptyState
            iconName="people-outline"
            title="No Patients Linked"
            description={`You are not currently monitoring any patients. When a MediTrack+ patient links your email address (${user?.email || "caregiver account"}) as their caregiver, their profile will appear here automatically.`}
            actionTitle="Refresh Patients"
            onActionPress={handleRefresh}
            style={styles.emptyContainer}
          />
        ) : (
          /* =============================================================== */
          /* ACTIVE CAREGIVER DASHBOARD CONTENT (Matching Page 12)           */
          /* =============================================================== */
          <>
            {/* 2. Monitored Patient Card / Selector */}
            {currentPatient && (
              <TouchableOpacity
                style={styles.monitoredPatientCard}
                onPress={() => {
                  if (patients.length > 1) {
                    setIsPatientSwitcherOpen(true);
                  } else {
                    onSelectPatient(currentPatient);
                  }
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Monitoring patient: ${currentPatient.fullName}. Tap to view or switch.`}
              >
                <View style={styles.patientAvatar}>
                  <Text style={styles.patientAvatarText}>
                    {getPatientInitials(currentPatient.fullName)}
                  </Text>
                </View>

                <View style={styles.patientMetaCol}>
                  <Text style={styles.monitoringLabel} numberOfLines={1}>
                    Monitoring: {currentPatient.fullName}
                  </Text>
                  <View style={styles.connectionActiveRow}>
                    <View style={styles.statusDotGreen} />
                    <Text style={styles.connectionActiveText}>
                      Caregiver connection active
                    </Text>
                  </View>
                </View>

                {patients.length > 1 ? (
                  <View style={styles.switchBadge}>
                    <Text style={styles.switchBadgeText}>Switch</Text>
                    <Ionicons name="chevron-down" size={14} color="#0D9488" />
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#0D9488" />
                )}
              </TouchableOpacity>
            )}

            {/* 3. Today's Medication Adherence Card */}
            <View style={styles.adherenceCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Today's Medication Adherence</Text>
                <View style={styles.dateBadge}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color="#64748B"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.dateBadgeText}>{getFormattedDate()}</Text>
                </View>
              </View>

              {isLoadingSummary ? (
                <View style={styles.summaryLoadingBox}>
                  <ActivityIndicator size="small" color="#0D9488" />
                  <Text style={styles.summaryLoadingText}>
                    Evaluating today's adherence...
                  </Text>
                </View>
              ) : (
                <>
                  {/* Progress Display Row */}
                  <View style={styles.progressRow}>
                    {/* Circular Percentage Badge */}
                    <View style={styles.circleRing}>
                      <Text style={styles.circlePercentText}>{adherencePct}%</Text>
                    </View>

                    {/* Doses Completed & Bar */}
                    <View style={styles.progressTextCol}>
                      <Text style={styles.dosesCompletedText}>
                        {totalDoses > 0
                          ? `${takenDoses} of ${totalDoses} doses completed`
                          : "No doses scheduled for today"}
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

                  {/* 3 Metric Stat Tiles */}
                  <View style={styles.statsRow}>
                    {/* Taken */}
                    <View style={[styles.statTile, styles.takenTile]}>
                      <View style={styles.statTileHeader}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color="#16A34A"
                        />
                        <Text style={styles.statTileLabel}>Taken</Text>
                      </View>
                      <Text style={[styles.statTileNumber, { color: "#16A34A" }]}>
                        {takenDoses}
                      </Text>
                    </View>

                    {/* Pending */}
                    <View style={[styles.statTile, styles.pendingTile]}>
                      <View style={styles.statTileHeader}>
                        <Ionicons name="time" size={16} color="#D97706" />
                        <Text style={styles.statTileLabel}>Pending</Text>
                      </View>
                      <Text style={[styles.statTileNumber, { color: "#D97706" }]}>
                        {pendingDoses}
                      </Text>
                    </View>

                    {/* Skipped */}
                    <View style={[styles.statTile, styles.skippedTile]}>
                      <View style={styles.statTileHeader}>
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color="#DC2626"
                        />
                        <Text style={styles.statTileLabel}>Skipped</Text>
                      </View>
                      <Text style={[styles.statTileNumber, { color: "#DC2626" }]}>
                        {skippedDoses}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* 4. Needs Attention Area */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color="#DC2626"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.sectionTitle}>Needs Attention</Text>
              </View>
              <TouchableOpacity
                onPress={onViewAlerts}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="View all alerts"
              >
                <Text style={styles.viewAllTextRed}>View All &gt;</Text>
              </TouchableOpacity>
            </View>

            {recentAlertItem || notificationAlertItem ? (
              /* Urgent Missed-Dose Card (Matching Page 12) */
              <View style={styles.attentionCard}>
                <View style={styles.pillIconBadge}>
                  <Ionicons name="medical" size={18} color="#DC2626" />
                </View>

                <View style={styles.attentionTextCol}>
                  <Text style={styles.attentionMedName} numberOfLines={1}>
                    {recentAlertItem?.medicineName ||
                      notificationAlertItem?.metadata?.medicineName ||
                      notificationAlertItem?.title ||
                      "Missed Medication Dose"}
                  </Text>
                  <Text style={styles.attentionScheduledTime}>
                    Scheduled{" "}
                    {formatTime(
                      recentAlertItem?.scheduledTimes?.[0] ||
                        notificationAlertItem?.metadata?.scheduledTime
                    )}
                  </Text>
                </View>

                <View style={styles.attentionActionCol}>
                  <View style={styles.missedBadge}>
                    <Text style={styles.missedBadgeText}>Missed</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.viewDetailsLink}
                    onPress={onViewAlerts}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="View missed dose alert details"
                  >
                    <Text style={styles.viewDetailsLinkText}>View Details &gt;</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Reassuring Healthy State Card */
              <View style={styles.healthyCard}>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color="#16A34A"
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.healthyTitle}>All medications on track</Text>
                  <Text style={styles.healthySubtitle}>
                    No missed doses or urgent alerts recorded for this patient.
                  </Text>
                </View>
              </View>
            )}

            {/* 5. Today's Activity Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Today's Activity</Text>
              <TouchableOpacity
                onPress={() => currentPatient && onSelectPatient(currentPatient)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="View all today's activity"
              >
                <Text style={styles.viewAllTextTeal}>View All &gt;</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activityCard}>
              {/* Activity Item 1: Completed Dose */}
              {takenDoses > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.activityRow}
                    onPress={() => currentPatient && onSelectPatient(currentPatient)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.activityTimeCol}>
                      <Text style={styles.activityTimeText}>Morning</Text>
                    </View>
                    <View style={styles.activityStatusIconCircle}>
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color="#16A34A"
                      />
                    </View>
                    <View style={styles.activityMedCol}>
                      <Text style={styles.activityMedName} numberOfLines={1}>
                        Prescribed Medication
                      </Text>
                      <Text style={styles.activityDoseText}>
                        {takenDoses} dose{takenDoses > 1 ? "s" : ""} recorded
                      </Text>
                    </View>
                    <View style={styles.statusPillGreen}>
                      <Text style={styles.statusPillGreenText}>Taken</Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                  <View style={styles.rowDivider} />
                </>
              )}

              {/* Activity Item 2: Missed Dose (if applicable) */}
              {skippedDoses > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.activityRow}
                    onPress={onViewAlerts}
                    activeOpacity={0.7}
                  >
                    <View style={styles.activityTimeCol}>
                      <Text style={styles.activityTimeText}>
                        {formatTime(
                          recentAlertItem?.scheduledTimes?.[0] ||
                            notificationAlertItem?.metadata?.scheduledTime
                        )}
                      </Text>
                    </View>
                    <View style={styles.activityStatusIconCircleRed}>
                      <Ionicons name="close" size={14} color="#DC2626" />
                    </View>
                    <View style={styles.activityMedCol}>
                      <Text style={styles.activityMedName} numberOfLines={1}>
                        {recentAlertItem?.medicineName ||
                          notificationAlertItem?.metadata?.medicineName ||
                          "Scheduled Dose"}
                      </Text>
                      <Text style={styles.activityDoseText}>
                        {skippedDoses} missed dose{skippedDoses > 1 ? "s" : ""}
                      </Text>
                    </View>
                    <View style={styles.statusPillRed}>
                      <Text style={styles.statusPillRedText}>Missed</Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                  <View style={styles.rowDivider} />
                </>
              )}

              {/* Activity Item 3: Upcoming / Pending Dose */}
              {pendingDoses > 0 ? (
                <TouchableOpacity
                  style={styles.activityRow}
                  onPress={() => currentPatient && onSelectPatient(currentPatient)}
                  activeOpacity={0.7}
                >
                  <View style={styles.activityTimeCol}>
                    <Text style={styles.activityTimeText}>Upcoming</Text>
                  </View>
                  <View style={styles.activityStatusIconCircleSlate}>
                    <Ionicons name="time" size={14} color="#64748B" />
                  </View>
                  <View style={styles.activityMedCol}>
                    <Text style={styles.activityMedName} numberOfLines={1}>
                      Scheduled Doses
                    </Text>
                    <Text style={styles.activityDoseText}>
                      {pendingDoses} dose{pendingDoses > 1 ? "s" : ""} pending intake
                    </Text>
                  </View>
                  <View style={styles.statusPillSlate}>
                    <Text style={styles.statusPillSlateText}>Upcoming</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color="#94A3B8"
                  />
                </TouchableOpacity>
              ) : (
                takenDoses === 0 &&
                skippedDoses === 0 && (
                  <View style={styles.emptyActivityRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color="#94A3B8"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.emptyActivityText}>
                      No medication activity recorded today.
                    </Text>
                  </View>
                )
              )}
            </View>

            {/* 6. Quick Actions Section */}
            <View style={styles.quickActionsHeader}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
            </View>

            <View style={styles.quickActionsRow}>
              {/* Action 1: View Patient */}
              <TouchableOpacity
                style={styles.quickActionCard}
                onPress={() => currentPatient && onSelectPatient(currentPatient)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View full patient medication details"
              >
                <View style={styles.quickActionIconCircle}>
                  <Ionicons name="people" size={20} color="#0D9488" />
                </View>
                <View style={styles.quickActionTextCol}>
                  <Text style={styles.quickActionTitle}>View Patient</Text>
                  <Text style={styles.quickActionSubtitle}>
                    See full medication details
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#0D9488" />
              </TouchableOpacity>

              {/* Action 2: View Alerts */}
              <TouchableOpacity
                style={styles.quickActionCard}
                onPress={onViewAlerts}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Check recent caregiver alerts"
              >
                <View style={styles.quickActionIconCircle}>
                  <Ionicons
                    name="notifications"
                    size={20}
                    color="#0D9488"
                  />
                </View>
                <View style={styles.quickActionTextCol}>
                  <Text style={styles.quickActionTitle}>View Alerts</Text>
                  <Text style={styles.quickActionSubtitle}>
                    Check recent alerts
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#0D9488" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* =================================================================== */}
      {/* MULTI-PATIENT SWITCHER MODAL                                        */}
      {/* =================================================================== */}
      <Modal
        visible={isPatientSwitcherOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPatientSwitcherOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsPatientSwitcherOpen(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Monitored Patient</Text>
              <TouchableOpacity
                onPress={() => setIsPatientSwitcherOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {patients.map((pat, idx) => {
                const isSelected = idx === selectedPatientIndex;
                return (
                  <TouchableOpacity
                    key={pat.patientId}
                    style={[
                      styles.patientOptionRow,
                      isSelected && styles.patientOptionRowSelected,
                    ]}
                    onPress={() => handleSelectActivePatient(idx)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.patientOptionAvatar,
                        isSelected && styles.patientOptionAvatarSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.patientOptionAvatarText,
                          isSelected && styles.patientOptionAvatarTextSelected,
                        ]}
                      >
                        {getPatientInitials(pat.fullName)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.patientOptionName,
                          isSelected && styles.patientOptionNameSelected,
                        ]}
                      >
                        {pat.fullName}
                      </Text>
                      <Text style={styles.patientOptionSub}>
                        {pat.relationship || "Patient"} • {pat.email}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#0D9488"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyContainer: {
    marginTop: 40,
  },

  /* Header (Page 12) */
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  headerTextCol: {
    flex: 1,
  },
  headerGreeting: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    marginBottom: 2,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 28,
  },
  headerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  unreadBadgeDot: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DC2626",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  /* Monitored Patient Card */
  monitoredPatientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 14,
    marginBottom: 18,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  patientAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  patientAvatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  patientMetaCol: {
    flex: 1,
  },
  monitoringLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F766E",
    marginBottom: 3,
  },
  connectionActiveRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
    marginRight: 6,
  },
  connectionActiveText: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "500",
  },
  switchBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#CCFBF1",
    borderRadius: 8,
    gap: 2,
  },
  switchBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Today's Medication Adherence Card */
  adherenceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 20,
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
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
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
  summaryLoadingBox: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  summaryLoadingText: {
    fontSize: 12,
    color: "#64748B",
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
    borderWidth: 5,
    borderColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 16,
  },
  circlePercentText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D9488",
  },
  progressTextCol: {
    flex: 1,
  },
  dosesCompletedText: {
    fontSize: 14,
    fontWeight: "700",
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
  statsRow: {
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

  /* Section Header Row */
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  viewAllTextRed: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },
  viewAllTextTeal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Needs Attention Card */
  attentionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 14,
    marginBottom: 20,
  },
  pillIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  attentionTextCol: {
    flex: 1,
  },
  attentionMedName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  attentionScheduledTime: {
    fontSize: 12,
    color: "#64748B",
  },
  attentionActionCol: {
    alignItems: "flex-end",
  },
  missedBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  missedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
  },
  viewDetailsLink: {
    paddingVertical: 2,
  },
  viewDetailsLinkText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0D9488",
  },
  healthyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCFCE7",
    padding: 14,
    marginBottom: 20,
  },
  healthyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
    marginBottom: 2,
  },
  healthySubtitle: {
    fontSize: 12,
    color: "#15803D",
  },

  /* Today's Activity Card */
  activityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    marginBottom: 20,
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
  },
  activityTimeCol: {
    width: 68,
  },
  activityTimeText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  activityStatusIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  activityStatusIconCircleRed: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  activityStatusIconCircleSlate: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  activityMedCol: {
    flex: 1,
  },
  activityMedName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  activityDoseText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  statusPillGreen: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  statusPillGreenText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#16A34A",
  },
  statusPillRed: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  statusPillRedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
  },
  statusPillSlate: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  statusPillSlateText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  emptyActivityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    justifyContent: "center",
  },
  emptyActivityText: {
    fontSize: 12,
    color: "#94A3B8",
  },

  /* Quick Actions */
  quickActionsHeader: {
    marginBottom: 10,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  quickActionCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  quickActionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  quickActionTextCol: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  quickActionSubtitle: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },

  /* Patient Switcher Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  patientOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: "#F8FAFC",
  },
  patientOptionRowSelected: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  patientOptionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  patientOptionAvatarSelected: {
    backgroundColor: "#0D9488",
  },
  patientOptionAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  patientOptionAvatarTextSelected: {
    color: "#FFFFFF",
  },
  patientOptionName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  patientOptionNameSelected: {
    color: "#0F766E",
    fontWeight: "700",
  },
  patientOptionSub: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
});
