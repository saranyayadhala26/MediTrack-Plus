/**
 * Caregiver Alerts Screen (PDF Page 10 / 33 Redesign).
 *
 * Dedicated healthcare alert center for authenticated caregivers.
 * Displays real-time medication, missed-dose, snooze, skip, and adherence alerts
 * for all linked patients.
 *
 * Features:
 * - Real API data: getCaregiverAlerts(), getLinkedPatients(), markCaregiverAlertRead()
 * - Safe area handling protecting against Android status bar & notch overlap
 * - Top Header: Back arrow, "Caregiver Alerts" title & supporting description
 * - Filter segment pills: "All (count)", "Unread (count)", "Resolved (count)"
 * - "Needs Attention" highlighted container for missed & pending doses with "Mark all as read"
 * - "Earlier Alerts" chronological feed with status badges & patient details
 * - Real patient lookup & one-tap navigation to Patient Monitoring ("View Patient >")
 * - Read / Unread visual states with persistent backend mark-as-read integration
 * - Alert Details Modal with full alert metadata and quick actions
 * - Robust pull-to-refresh & shared LoadingState, ErrorState, EmptyState components
 * - Strictly read-only caregiver security (zero schedule/prescription mutation controls)
 * - Android hardware back press navigation support
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  getCaregiverAlerts,
  getLinkedPatients,
  markCaregiverAlertRead,
} from "../../api/caregivers";
import { Button } from "../../components/common/Button";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { colors, spacing } from "../../constants/theme";
import { CaregiverNotificationAlert, LinkedPatient } from "../../types";

interface CaregiverAlertsScreenProps {
  initialPatientId?: string | null;
  onBack?: () => void;
  onSelectPatient?: (patient: LinkedPatient) => void;
}

type FilterTab = "all" | "unread" | "resolved";

interface ClassifiedAlert {
  alert: CaregiverNotificationAlert;
  patientName: string;
  medicineName: string;
  scheduledTimeStr: string;
  relativeTime: string;
  kind: "missed" | "pending" | "snoozed" | "skipped" | "taken" | "info";
  isAttention: boolean;
}

export const CaregiverAlertsScreen: React.FC<CaregiverAlertsScreenProps> = ({
  initialPatientId,
  onBack,
  onSelectPatient,
}) => {
  // Safe area insets handling
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
  const [filter, setFilter] = useState<FilterTab>("all");
  const [alerts, setAlerts] = useState<CaregiverNotificationAlert[]>([]);
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Mutation tracking
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);

  // Selected alert detail modal
  const [selectedAlert, setSelectedAlert] = useState<ClassifiedAlert | null>(null);

  // Hardware back press handler
  useEffect(() => {
    const handleHardwareBack = () => {
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handleHardwareBack);
    return () => sub.remove();
  }, [onBack]);

  // Load real caregiver alerts and linked patients
  const fetchAlertsAndPatients = useCallback(async () => {
    try {
      setError(null);
      const [alertsData, patientsData] = await Promise.all([
        getCaregiverAlerts(undefined, initialPatientId || undefined),
        getLinkedPatients().catch(() => []),
      ]);
      setAlerts(alertsData || []);
      setPatients(patientsData || []);
    } catch (err: any) {
      console.error("[CaregiverAlerts] Error fetching data:", err);
      const msg =
        err?.response?.data?.detail ||
        "Unable to load caregiver alerts. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [initialPatientId]);

  useEffect(() => {
    fetchAlertsAndPatients();
  }, [fetchAlertsAndPatients]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAlertsAndPatients();
  };

  // Patients lookup map (patientId -> LinkedPatient)
  const patientsMap = useMemo(() => {
    const map = new Map<string, LinkedPatient>();
    patients.forEach((p) => {
      if (p.patientId) map.set(p.patientId, p);
    });
    return map;
  }, [patients]);

  // Format 12-hour time (e.g. "14:30" -> "2:30 PM", "09:00" -> "9:00 AM")
  const formatTime12h = (timeStr?: string): string => {
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
    return `${hours}:${minutes} ${ampm}`;
  };

  // Format relative timestamp (e.g. "Today • 2:45 PM", "Yesterday • 8:00 PM")
  const formatRelativeTimestamp = (isoString?: string): string => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timeStr = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      if (isToday) return `Today • ${timeStr}`;
      if (isYesterday) return `Yesterday • ${timeStr}`;
      const month = d.toLocaleDateString("en-US", { month: "short" });
      return `${month} ${d.getDate()} • ${timeStr}`;
    } catch {
      return isoString;
    }
  };

  // Classify each alert with extracted fields, styling category, and patient lookup
  const classifiedAlerts: ClassifiedAlert[] = useMemo(() => {
    return alerts.map((alert) => {
      const meta = alert.metadata || {};
      const linked = alert.patientId ? patientsMap.get(alert.patientId) : undefined;
      const patientName =
        linked?.fullName || meta.patientName || "Patient";
      const medicineName =
        meta.medicineName || alert.title || "Medication";
      const scheduledTimeStr = formatTime12h(meta.scheduledTime);
      const relativeTime = formatRelativeTimestamp(alert.createdAt);

      const typeStr = (alert.alertType || "").toLowerCase();
      const titleStr = (alert.title || "").toLowerCase();
      const msgStr = (alert.message || "").toLowerCase();

      let kind: ClassifiedAlert["kind"] = "info";
      if (typeStr.includes("missed") || titleStr.includes("missed") || msgStr.includes("missed")) {
        kind = "missed";
      } else if (
        typeStr.includes("pending") ||
        titleStr.includes("pending") ||
        msgStr.includes("pending")
      ) {
        kind = "pending";
      } else if (
        typeStr.includes("snooze") ||
        titleStr.includes("snooze") ||
        msgStr.includes("snooze")
      ) {
        kind = "snoozed";
      } else if (
        typeStr.includes("skip") ||
        titleStr.includes("skip") ||
        msgStr.includes("skip")
      ) {
        kind = "skipped";
      } else if (
        typeStr.includes("taken") ||
        titleStr.includes("taken") ||
        msgStr.includes("taken")
      ) {
        kind = "taken";
      }

      // Attention category: missed or pending doses, or unread critical alerts
      const isAttention =
        kind === "missed" ||
        kind === "pending" ||
        (alert.status === "unread" && !["snoozed", "skipped", "taken"].includes(kind));

      return {
        alert,
        patientName,
        medicineName,
        scheduledTimeStr,
        relativeTime,
        kind,
        isAttention,
      };
    });
  }, [alerts, patientsMap]);

  // Dynamic filter counts based on real alert data
  const totalCount = alerts.length;
  const unreadCount = alerts.filter((a) => a.status === "unread").length;
  const resolvedCount = alerts.filter((a) => a.status === "read").length;

  // Filtered alert list
  const filteredAlerts = useMemo(() => {
    if (filter === "unread") {
      return classifiedAlerts.filter((item) => item.alert.status === "unread");
    }
    if (filter === "resolved") {
      return classifiedAlerts.filter((item) => item.alert.status === "read");
    }
    return classifiedAlerts;
  }, [classifiedAlerts, filter]);

  // Separate into "Needs Attention" and "Earlier Alerts"
  const needsAttentionList = useMemo(() => {
    return filteredAlerts.filter((item) => item.isAttention);
  }, [filteredAlerts]);

  const earlierAlertsList = useMemo(() => {
    return filteredAlerts.filter((item) => !item.isAttention);
  }, [filteredAlerts]);

  // Mark single alert as read
  const handleMarkAsRead = async (alertId: string) => {
    if (markingId === alertId) return;
    try {
      setMarkingId(alertId);
      await markCaregiverAlertRead(alertId);
      // Immediately reflect state locally without screen flicker
      setAlerts((prev) =>
        prev.map((item) =>
          item.id === alertId ? { ...item, status: "read" as const } : item
        )
      );
      if (selectedAlert && selectedAlert.alert.id === alertId) {
        setSelectedAlert((prev) =>
          prev
            ? { ...prev, alert: { ...prev.alert, status: "read" as const } }
            : null
        );
      }
    } catch (err: any) {
      console.error("[CaregiverAlerts] Error marking alert as read:", err);
      Alert.alert(
        "Update Failed",
        err?.response?.data?.detail || "Could not mark alert as read. Please try again."
      );
    } finally {
      setMarkingId(null);
    }
  };

  // Mark all unread alerts in the current list as read
  const handleMarkAllAsRead = async () => {
    const unreadItems = alerts.filter((a) => a.status === "unread");
    if (unreadItems.length === 0 || isMarkingAll) return;

    setIsMarkingAll(true);
    try {
      await Promise.allSettled(
        unreadItems.map((item) => markCaregiverAlertRead(item.id))
      );
      setAlerts((prev) =>
        prev.map((item) => ({ ...item, status: "read" as const }))
      );
    } catch (err: any) {
      console.error("[CaregiverAlerts] Error marking all as read:", err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Navigate to patient monitoring detail screen
  const handleViewPatient = (item: ClassifiedAlert) => {
    if (!item.alert.patientId) return;
    const targetPatient = patientsMap.get(item.alert.patientId) || {
      patientId: item.alert.patientId,
      fullName: item.patientName,
      email: "",
      relationship: "Monitored Patient",
      status: "active",
      linkedAt: new Date().toISOString(),
    };
    if (onSelectPatient) {
      onSelectPatient(targetPatient);
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Safe-Area Protected Header Bar */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          {onBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Back to previous screen"
            >
              <Ionicons name="arrow-back" size={24} color="#0F172A" />
            </TouchableOpacity>
          )}

          <View style={styles.headerTitleCol}>
            <Text style={styles.headerTitle}>Caregiver Alerts</Text>
            <Text style={styles.headerSubtitle}>
              Medication alerts that may need your attention.
            </Text>
          </View>
        </View>

        {/* 2. Filter Segment Tabs (All / Unread / Resolved) */}
        <View style={styles.filterTabsRow}>
          <TouchableOpacity
            style={[styles.filterTab, filter === "all" && styles.filterTabActive]}
            onPress={() => setFilter("all")}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === "all" }}
            accessibilityLabel={`All alerts, ${totalCount} total`}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === "all" && styles.filterTabTextActive,
              ]}
            >
              All ({totalCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === "unread" && styles.filterTabActive]}
            onPress={() => setFilter("unread")}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === "unread" }}
            accessibilityLabel={`Unread alerts, ${unreadCount} unread`}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === "unread" && styles.filterTabTextActive,
              ]}
            >
              Unread ({unreadCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === "resolved" && styles.filterTabActive]}
            onPress={() => setFilter("resolved")}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === "resolved" }}
            accessibilityLabel={`Resolved alerts, ${resolvedCount} resolved`}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === "resolved" && styles.filterTabTextActive,
              ]}
            >
              Resolved ({resolvedCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerContainer}>
          <LoadingState message="Loading caregiver alerts..." />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <ErrorState
            title="Unable to Load Alerts"
            message={error}
            onRetry={fetchAlertsAndPatients}
          />
        </View>
      ) : filteredAlerts.length === 0 ? (
        <View style={styles.centerContainer}>
          <EmptyState
            title={filter === "unread" ? "No Unread Alerts" : "No Alerts"}
            description={
              filter === "unread"
                ? "All medication adherence alerts have been marked as read."
                : "There are currently no medication or adherence alerts requiring attention for your monitored patients."
            }
            iconName="notifications-outline"
            actionTitle={filter !== "all" ? "View All Alerts" : undefined}
            onActionPress={filter !== "all" ? () => setFilter("all") : undefined}
          />
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
          {/* =============================================================== */}
          {/* SECTION 1: Needs Attention (Soft Pink/Red Container)            */}
          {/* =============================================================== */}
          {needsAttentionList.length > 0 && (
            <View style={styles.attentionContainer}>
              <View style={styles.attentionHeaderRow}>
                <Text style={styles.attentionSectionTitle}>
                  Needs Attention ({needsAttentionList.length})
                </Text>

                {unreadCount > 0 && (
                  <TouchableOpacity
                    onPress={handleMarkAllAsRead}
                    disabled={isMarkingAll}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isMarkingAll ? (
                      <ActivityIndicator size="small" color="#0D9488" />
                    ) : (
                      <Text style={styles.markAllReadText}>Mark all as read</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.attentionCardsList}>
                {needsAttentionList.map((item) => {
                  const isUnread = item.alert.status === "unread";
                  const isMissed = item.kind === "missed";
                  const isPending = item.kind === "pending";

                  return (
                    <TouchableOpacity
                      key={item.alert.id}
                      style={[
                        styles.attentionCard,
                        !isUnread && styles.attentionCardSubdued,
                      ]}
                      onPress={() => setSelectedAlert(item)}
                      activeOpacity={0.7}
                    >
                      {/* Left Icon Badge */}
                      <View
                        style={[
                          styles.alertIconBadge,
                          isMissed
                            ? styles.badgeMissedBg
                            : isPending
                            ? styles.badgePendingBg
                            : styles.badgeAlertBg,
                        ]}
                      >
                        {isMissed ? (
                          <Ionicons name="alert" size={18} color="#DC2626" />
                        ) : isPending ? (
                          <Ionicons name="time" size={18} color="#D97706" />
                        ) : (
                          <Ionicons name="alert-circle" size={18} color="#0D9488" />
                        )}
                      </View>

                      {/* Middle Details Col */}
                      <View style={styles.alertDetailsCol}>
                        <Text style={styles.alertCardTitle} numberOfLines={1}>
                          {item.kind === "missed"
                            ? "Missed Medication"
                            : item.kind === "pending"
                            ? "Pending Medication"
                            : item.alert.title}
                        </Text>

                        <Text style={styles.alertMedicineText} numberOfLines={1}>
                          {item.medicineName}
                        </Text>

                        {Boolean(item.scheduledTimeStr) && (
                          <View style={styles.alertMetaLine}>
                            <Ionicons
                              name="time-outline"
                              size={13}
                              color="#64748B"
                            />
                            <Text style={styles.alertMetaLineText}>
                              Scheduled for {item.scheduledTimeStr}
                            </Text>
                          </View>
                        )}

                        <View style={styles.alertMetaLine}>
                          <Ionicons
                            name="person-outline"
                            size={13}
                            color="#64748B"
                          />
                          <Text style={styles.alertMetaLineText}>
                            Patient: {item.patientName}
                          </Text>
                        </View>

                        <Text style={styles.alertTimestampText}>
                          {item.relativeTime}
                        </Text>
                      </View>

                      {/* Right Status Pill & View Patient Button */}
                      <View style={styles.alertRightCol}>
                        <View
                          style={[
                            styles.statusPill,
                            isMissed
                              ? styles.pillMissed
                              : isPending
                              ? styles.pillPending
                              : styles.pillInfo,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              isMissed
                                ? styles.pillMissedText
                                : isPending
                                ? styles.pillPendingText
                                : styles.pillInfoText,
                            ]}
                          >
                            {isMissed ? "Missed" : isPending ? "Pending" : "Alert"}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.viewPatientBtn}
                          onPress={() => handleViewPatient(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`View Patient ${item.patientName}`}
                        >
                          <Text style={styles.viewPatientBtnText}>
                            View Patient &gt;
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* =============================================================== */}
          {/* SECTION 2: Earlier Alerts (Clean White Cards)                   */}
          {/* =============================================================== */}
          {earlierAlertsList.length > 0 && (
            <View style={styles.earlierSection}>
              <Text style={styles.earlierSectionTitle}>
                {needsAttentionList.length > 0 ? "Earlier Alerts" : "All Alerts"}
              </Text>

              <View style={styles.earlierCardsList}>
                {earlierAlertsList.map((item) => {
                  const isUnread = item.alert.status === "unread";
                  const isSnoozed = item.kind === "snoozed";
                  const isSkipped = item.kind === "skipped";
                  const isTaken = item.kind === "taken";

                  return (
                    <TouchableOpacity
                      key={item.alert.id}
                      style={[
                        styles.earlierCard,
                        !isUnread && styles.earlierCardRead,
                      ]}
                      onPress={() => setSelectedAlert(item)}
                      activeOpacity={0.7}
                    >
                      {/* Left Icon Badge */}
                      <View
                        style={[
                          styles.alertIconBadge,
                          isSnoozed
                            ? styles.badgeSnoozedBg
                            : isSkipped
                            ? styles.badgeSkippedBg
                            : isTaken
                            ? styles.badgeTakenBg
                            : styles.badgeDefaultBg,
                        ]}
                      >
                        {isSnoozed ? (
                          <Ionicons
                            name="alarm-outline"
                            size={18}
                            color="#2563EB"
                          />
                        ) : isSkipped ? (
                          <Ionicons name="close" size={18} color="#DC2626" />
                        ) : isTaken ? (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color="#16A34A"
                          />
                        ) : (
                          <Ionicons
                            name="notifications-outline"
                            size={18}
                            color="#64748B"
                          />
                        )}
                      </View>

                      {/* Middle Details Col */}
                      <View style={styles.alertDetailsCol}>
                        <Text style={styles.alertCardTitle} numberOfLines={1}>
                          {isSnoozed
                            ? "Dose Snoozed"
                            : isSkipped
                            ? "Dose Skipped"
                            : isTaken
                            ? "Dose Taken"
                            : item.alert.title}
                        </Text>

                        <Text style={styles.alertMedicineText} numberOfLines={1}>
                          {item.medicineName}
                        </Text>

                        {Boolean(item.scheduledTimeStr) && (
                          <View style={styles.alertMetaLine}>
                            <Ionicons
                              name="time-outline"
                              size={13}
                              color="#64748B"
                            />
                            <Text style={styles.alertMetaLineText}>
                              {isSnoozed
                                ? `New reminder set for ${item.scheduledTimeStr}`
                                : `Scheduled for ${item.scheduledTimeStr}`}
                            </Text>
                          </View>
                        )}

                        <View style={styles.alertMetaLine}>
                          <Ionicons
                            name="person-outline"
                            size={13}
                            color="#64748B"
                          />
                          <Text style={styles.alertMetaLineText}>
                            Patient: {item.patientName}
                          </Text>
                        </View>

                        <Text style={styles.alertTimestampText}>
                          {item.relativeTime}
                        </Text>
                      </View>

                      {/* Right Status Pill & Chevron */}
                      <View style={styles.earlierRightCol}>
                        <View
                          style={[
                            styles.statusPill,
                            isSnoozed
                              ? styles.pillSnoozed
                              : isSkipped
                              ? styles.pillSkipped
                              : isTaken
                              ? styles.pillTaken
                              : styles.pillInfo,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              isSnoozed
                                ? styles.pillSnoozedText
                                : isSkipped
                                ? styles.pillSkippedText
                                : isTaken
                                ? styles.pillTakenText
                                : styles.pillInfoText,
                            ]}
                          >
                            {isSnoozed
                              ? "Snoozed"
                              : isSkipped
                              ? "Skipped"
                              : isTaken
                              ? "Taken"
                              : "Info"}
                          </Text>
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="#94A3B8"
                          style={{ marginTop: 12 }}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* =================================================================== */}
      {/* MODAL: Alert Details & Patient Action Sheet                         */}
      {/* =================================================================== */}
      <Modal
        visible={Boolean(selectedAlert)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedAlert(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Alert Details</Text>
              <TouchableOpacity
                onPress={() => setSelectedAlert(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {selectedAlert && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Status:</Text>
                  <View
                    style={[
                      styles.statusPill,
                      selectedAlert.alert.status === "unread"
                        ? styles.pillMissed
                        : styles.pillTaken,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        selectedAlert.alert.status === "unread"
                          ? styles.pillMissedText
                          : styles.pillTakenText,
                      ]}
                    >
                      {selectedAlert.alert.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Alert:</Text>
                  <Text style={styles.modalInfoValue}>
                    {selectedAlert.alert.title}
                  </Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Patient:</Text>
                  <Text style={styles.modalInfoValue}>
                    {selectedAlert.patientName}
                  </Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Medication:</Text>
                  <Text style={styles.modalInfoValue}>
                    {selectedAlert.medicineName}
                  </Text>
                </View>

                {Boolean(selectedAlert.scheduledTimeStr) && (
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalInfoLabel}>Scheduled Time:</Text>
                    <Text style={styles.modalInfoValue}>
                      {selectedAlert.scheduledTimeStr}
                    </Text>
                  </View>
                )}

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Created:</Text>
                  <Text style={styles.modalInfoValue}>
                    {selectedAlert.relativeTime}
                  </Text>
                </View>

                <View style={styles.modalMessageCard}>
                  <Text style={styles.modalMessageLabel}>Alert Message:</Text>
                  <Text style={styles.modalMessageBody}>
                    {selectedAlert.alert.message}
                  </Text>
                </View>

                {/* Actions */}
                <View style={{ marginTop: 14, gap: 8 }}>
                  {selectedAlert.alert.status === "unread" && (
                    <Button
                      title="✓ Mark as Read"
                      onPress={() => {
                        handleMarkAsRead(selectedAlert.alert.id);
                      }}
                      loading={markingId === selectedAlert.alert.id}
                      variant="primary"
                    />
                  )}

                  {selectedAlert.alert.patientId && onSelectPatient && (
                    <Button
                      title={`👤 Open ${selectedAlert.patientName}'s Monitoring`}
                      onPress={() => {
                        const alertItem = selectedAlert;
                        setSelectedAlert(null);
                        handleViewPatient(alertItem);
                      }}
                      variant="outline"
                    />
                  )}

                  <Button
                    title="Close"
                    onPress={() => setSelectedAlert(null)}
                    variant="text"
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
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
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },

  /* Safe Area Header */
  headerContainer: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    marginTop: -2,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 2,
  },

  /* Filter Segment Tabs */
  filterTabsRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterTab: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  filterTabActive: {
    backgroundColor: "#0D9488",
    borderColor: "#0D9488",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  scrollContent: {
    padding: 16,
  },

  /* Needs Attention Section (Pink/Red Container) */
  attentionContainer: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  attentionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  attentionSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  markAllReadText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D9488",
  },
  attentionCardsList: {
    gap: 10,
  },
  attentionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    padding: 12,
    flexDirection: "row",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  attentionCardSubdued: {
    opacity: 0.9,
    borderColor: "#E2E8F0",
  },

  /* Earlier Alerts Section */
  earlierSection: {
    marginBottom: 16,
  },
  earlierSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  earlierCardsList: {
    gap: 10,
  },
  earlierCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    flexDirection: "row",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  earlierCardRead: {
    opacity: 0.9,
  },

  /* Alert Card Inner Layout */
  alertIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeMissedBg: {
    backgroundColor: "#FEE2E2",
  },
  badgePendingBg: {
    backgroundColor: "#FEF3C7",
  },
  badgeSnoozedBg: {
    backgroundColor: "#EFF6FF",
  },
  badgeSkippedBg: {
    backgroundColor: "#FEE2E2",
  },
  badgeTakenBg: {
    backgroundColor: "#ECFDF5",
  },
  badgeAlertBg: {
    backgroundColor: "#CCFBF1",
  },
  badgeDefaultBg: {
    backgroundColor: "#F1F5F9",
  },

  alertDetailsCol: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  alertCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  alertMedicineText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginTop: 1,
  },
  alertMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  alertMetaLineText: {
    fontSize: 12,
    color: "#64748B",
  },
  alertTimestampText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
  },

  alertRightCol: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  earlierRightCol: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  /* Status Pills */
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pillMissed: {
    backgroundColor: "#FEE2E2",
  },
  pillMissedText: {
    color: "#DC2626",
  },
  pillPending: {
    backgroundColor: "#FEF3C7",
  },
  pillPendingText: {
    color: "#D97706",
  },
  pillSnoozed: {
    backgroundColor: "#EFF6FF",
  },
  pillSnoozedText: {
    color: "#2563EB",
  },
  pillSkipped: {
    backgroundColor: "#FEE2E2",
  },
  pillSkippedText: {
    color: "#DC2626",
  },
  pillTaken: {
    backgroundColor: "#DCFCE7",
  },
  pillTakenText: {
    color: "#166534",
  },
  pillInfo: {
    backgroundColor: "#F1F5F9",
  },
  pillInfoText: {
    color: "#475569",
  },

  /* Action Buttons */
  viewPatientBtn: {
    borderWidth: 1,
    borderColor: "#0D9488",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#FFFFFF",
    minHeight: 30,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  viewPatientBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Modal Details */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalInfoLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  modalInfoValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
    marginLeft: 8,
  },
  modalMessageCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  modalMessageLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  modalMessageBody: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 18,
  },
});
