/**
 * Authenticated Dashboard / Patient Home Screen for MediTrack+
 * Focused Patient Medication Dashboard matching approved visual design.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { getMedicationActivities, getAdherenceSummary } from "../../api/activities";
import { getSchedules } from "../../api/schedules";
import { useAuth } from "../../context/AuthContext";
import { AdherenceSummary, MedicationActivity, MedicationSchedule } from "../../types";

export interface HomeScreenProps {
  onNavigateToMedicines?: (subScreen?: "list" | "add") => void;
  onNavigateToCaregivers?: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToReports?: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToHistory?: () => void;
  onNavigateToAdherence?: () => void;
}

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function formatScheduleTime(timeStr?: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const hour = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(min)) return timeStr;
  const ampm = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  const formattedMin = String(min).padStart(2, "0");
  return `${formattedHour}:${formattedMin} ${ampm}`;
}

function formatActivityTime(actionTime?: string, scheduledTime?: string): string {
  if (scheduledTime) {
    return formatScheduleTime(scheduledTime);
  }
  if (!actionTime) return "";
  try {
    const d = new Date(actionTime);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function getInitials(name?: string): string {
  if (!name || !name.trim()) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface CircularProgressProps {
  percentage: number;
  size?: number;
}

const CircularProgress: React.FC<CircularProgressProps> = ({ percentage, size = 84 }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

  // Smooth arc representation via segmented border highlights
  const topColor = clamped > 0 ? "#0D9488" : "#CCFBF1";
  const rightColor = clamped >= 25 ? "#0D9488" : "#CCFBF1";
  const bottomColor = clamped >= 50 ? "#0D9488" : "#CCFBF1";
  const leftColor = clamped >= 75 ? "#0D9488" : "#CCFBF1";

  return (
    <View style={[styles.progressRingWrapper, { width: size, height: size, borderRadius: size / 2 }]}>
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
          <Text style={styles.progressLabelText}>Today's progress</Text>
        </View>
      </View>
    </View>
  );
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateToMedicines,
  onNavigateToProfile,
  onNavigateToCalendar,
  onNavigateToHistory,
  onNavigateToReports,
  onNavigateToAdherence,
}) => {
  const { user, refreshProfile } = useAuth();

  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [recentActivities, setRecentActivities] = useState<MedicationActivity[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    const todayStr = getTodayDateString();
    try {
      const [sumRes, schedRes, actRes] = await Promise.allSettled([
        getAdherenceSummary({ startDate: todayStr, endDate: todayStr }),
        getSchedules(),
        getMedicationActivities({ limit: 4 }),
      ]);

      if (sumRes.status === "fulfilled") {
        setSummary(sumRes.value);
      }
      if (schedRes.status === "fulfilled") {
        setSchedules(schedRes.value.items || []);
      }
      if (actRes.status === "fulfilled") {
        setRecentActivities(actRes.value || []);
      }
    } catch (err) {
      console.warn("HomeScreen: Error loading dashboard data:", err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshProfile().catch(() => {});
    loadData();
  }, [loadData, refreshProfile]);

  // Determine next scheduled dose for today
  const getNextDoseInfo = () => {
    const today = new Date();
    const todayDateStr = getTodayDateString();
    const todayDayOfWeek = today.getDay(); // 0 = Sunday

    const todaySchedules = schedules.filter((s) => {
      if (!s.enabled) return false;
      if (s.startDate && s.startDate > todayDateStr) return false;
      if (s.endDate && s.endDate < todayDateStr) return false;
      if (s.frequencyType === "daily") return true;
      if (s.frequencyType === "weekly") {
        return Array.isArray(s.daysOfWeek) && s.daysOfWeek.includes(todayDayOfWeek);
      }
      if (s.frequencyType === "custom") {
        return Array.isArray(s.dates) && s.dates.includes(todayDateStr);
      }
      return true;
    });

    if (todaySchedules.length === 0) {
      return null;
    }

    const takenScheduleIds = new Set(
      recentActivities
        .filter((a) => a.action === "Taken" && a.scheduledDate === todayDateStr)
        .map((a) => a.scheduleId)
    );

    const sorted = [...todaySchedules].sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    const currentHours = String(today.getHours()).padStart(2, "0");
    const currentMins = String(today.getMinutes()).padStart(2, "0");
    const currentTimeStr = `${currentHours}:${currentMins}`;

    const upcoming = sorted.find((s) => !takenScheduleIds.has(s.id) && s.time >= currentTimeStr);
    if (upcoming) {
      return { schedule: upcoming, status: "Upcoming" as const };
    }

    const pending = sorted.find((s) => !takenScheduleIds.has(s.id));
    if (pending) {
      return { schedule: pending, status: "Pending" as const };
    }

    return { schedule: sorted[0], status: "Completed" as const };
  };

  const nextDoseInfo = getNextDoseInfo();

  // Summary counts
  const totalScheduled = summary?.totalScheduled ?? schedules.length;
  const takenCount = summary?.takenCount ?? 0;
  const remainingCount = Math.max(0, totalScheduled - takenCount);
  const adherencePct =
    summary?.adherencePercentage ??
    (totalScheduled > 0 ? Math.round((takenCount / totalScheduled) * 100) : 100);

  // Dynamic user name from auth state
  const userName = user?.fullName?.trim() || "User";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. TOP BRANDING / HEADER */}
      <View style={styles.topBrandingHeader}>
        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>
            <Text style={styles.brandTeal}>MediTrack</Text>
            <Text style={styles.brandPlus}>+</Text>
          </Text>
        </View>
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={() => onNavigateToProfile?.()}
          accessibilityRole="button"
          accessibilityLabel="Open user profile and settings"
          activeOpacity={0.7}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{getInitials(user?.fullName)}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#0D9488"]}
            tintColor="#0D9488"
          />
        }
      >
        {/* 2. GREETING */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>Good morning, {userName} 👋</Text>
          <Text style={styles.greetingSubtitle}>Stay on track with your medicines today.</Text>
        </View>

        {/* 3. TODAY'S MEDICINES CARD */}
        <TouchableOpacity
          style={styles.todayCard}
          onPress={() => (onNavigateToAdherence ? onNavigateToAdherence() : onNavigateToReports?.())}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="View today's adherence summary"
        >
          <View style={styles.todayCardHeader}>
            <Text style={styles.todayCardTitle}>Today's Medicines</Text>
            <Text style={styles.todayCardScheduledCount}>
              {totalScheduled} {totalScheduled === 1 ? "medicine" : "medicines"} scheduled
            </Text>
          </View>

          <View style={styles.todayCardBody}>
            {/* Left: Taken / Remaining Badges */}
            <View style={styles.todayStatsCol}>
              <View style={styles.statPillTaken}>
                <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                <Text style={styles.statPillTakenText}>{takenCount} Taken</Text>
              </View>

              <View
                style={[
                  styles.statPillRemaining,
                  remainingCount > 0 ? styles.statPillRemainingAlert : styles.statPillRemainingNeutral,
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={remainingCount > 0 ? "#DC2626" : "#64748B"}
                />
                <Text
                  style={[
                    styles.statPillRemainingText,
                    remainingCount > 0 ? styles.statPillRemainingTextAlert : styles.statPillRemainingTextNeutral,
                  ]}
                >
                  {remainingCount} Remaining
                </Text>
              </View>
            </View>

            {/* Right: Circular Progress Indicator */}
            <View style={styles.todayProgressCol}>
              <CircularProgress percentage={adherencePct} />
            </View>
          </View>
        </TouchableOpacity>

        {/* 4. NEXT DOSE CARD */}
        <View style={styles.nextDoseCard}>
          <View style={styles.nextDoseHeaderRow}>
            <Text style={styles.nextDoseSectionTag}>Next dose</Text>
            {nextDoseInfo && (
              <View
                style={[
                  styles.statusBadge,
                  nextDoseInfo.status === "Upcoming"
                    ? styles.statusBadgeUpcoming
                    : nextDoseInfo.status === "Pending"
                    ? styles.statusBadgePending
                    : styles.statusBadgeCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    nextDoseInfo.status === "Upcoming"
                      ? styles.statusBadgeTextUpcoming
                      : nextDoseInfo.status === "Pending"
                      ? styles.statusBadgeTextPending
                      : styles.statusBadgeTextCompleted,
                  ]}
                >
                  {nextDoseInfo.status}
                </Text>
              </View>
            )}
          </View>

          {nextDoseInfo ? (
            <View style={styles.nextDoseContentRow}>
              <View style={styles.nextDoseIconBox}>
                <Ionicons name="medkit-outline" size={24} color="#0D9488" />
              </View>
              <View style={styles.nextDoseDetailsCol}>
                <Text style={styles.nextDoseMedicineName} numberOfLines={1}>
                  {nextDoseInfo.schedule.medicineName || "Prescribed Medicine"}
                </Text>
                <Text style={styles.nextDoseDosageText} numberOfLines={1}>
                  {nextDoseInfo.schedule.dosage
                    ? `${nextDoseInfo.schedule.dosage}${
                        nextDoseInfo.schedule.dosageUnit ? ` • 1 ${nextDoseInfo.schedule.dosageUnit}` : ""
                      }`
                    : nextDoseInfo.schedule.dosageUnit
                    ? `1 ${nextDoseInfo.schedule.dosageUnit}`
                    : "Scheduled dose"}
                </Text>
                <View style={styles.nextDoseTimeRow}>
                  <Ionicons name="time-outline" size={14} color="#0D9488" />
                  <Text style={styles.nextDoseTimeText}>
                    {formatScheduleTime(nextDoseInfo.schedule.time)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.nextDoseViewButton}
                onPress={() => onNavigateToMedicines?.("list")}
                accessibilityRole="button"
                accessibilityLabel="View medicine details"
                activeOpacity={0.7}
              >
                <Text style={styles.nextDoseViewButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noDoseRow}>
              <Ionicons name="checkmark-done-circle-outline" size={30} color="#0D9488" />
              <View style={styles.noDoseDetails}>
                <Text style={styles.noDoseTitle}>All clear for today</Text>
                <Text style={styles.noDoseSubtitle}>No more scheduled doses remaining</Text>
              </View>
              <TouchableOpacity
                style={styles.nextDoseViewButton}
                onPress={() => onNavigateToMedicines?.("list")}
                activeOpacity={0.7}
              >
                <Text style={styles.nextDoseViewButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 5. QUICK ACTIONS */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            {/* Tile 1: Add Medicine */}
            <TouchableOpacity
              style={styles.actionTile}
              onPress={() => onNavigateToMedicines?.("add")}
              accessibilityRole="button"
              accessibilityLabel="Add Medicine"
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconCircle, styles.tileIconCircleAdd]}>
                <Ionicons name="add" size={24} color="#0D9488" />
              </View>
              <Text style={styles.tileLabel}>Add Medicine</Text>
            </TouchableOpacity>

            {/* Tile 2: Calendar */}
            <TouchableOpacity
              style={styles.actionTile}
              onPress={() => onNavigateToCalendar?.()}
              accessibilityRole="button"
              accessibilityLabel="Medication Calendar"
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconCircle, styles.tileIconCircleCalendar]}>
                <Ionicons name="calendar-outline" size={22} color="#D97706" />
              </View>
              <Text style={styles.tileLabel}>Calendar</Text>
            </TouchableOpacity>

            {/* Tile 3: Medicines */}
            <TouchableOpacity
              style={styles.actionTile}
              onPress={() => onNavigateToMedicines?.("list")}
              accessibilityRole="button"
              accessibilityLabel="View Medicines"
              activeOpacity={0.7}
            >
              <View style={[styles.tileIconCircle, styles.tileIconCircleMedicines]}>
                <Ionicons name="medkit-outline" size={22} color="#0284C7" />
              </View>
              <Text style={styles.tileLabel}>Medicines</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 6. RECENT ACTIVITY */}
        <View style={styles.recentActivitySection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity
              onPress={() => onNavigateToHistory?.()}
              accessibilityRole="button"
              accessibilityLabel="See all activity history"
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>See all {">"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.activityCard}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#0D9488" style={{ paddingVertical: 16 }} />
            ) : recentActivities.length > 0 ? (
              recentActivities.slice(0, 3).map((act, index) => {
                const isTaken = act.action === "Taken";
                const isSkipped = act.action === "Skipped";
                const iconName = isTaken
                  ? "checkmark-circle"
                  : isSkipped
                  ? "close-circle"
                  : "time";
                const iconColor = isTaken
                  ? "#16A34A"
                  : isSkipped
                  ? "#DC2626"
                  : "#D97706";

                const detailText = `${act.action}${
                  act.dosageUnit
                    ? ` • 1 ${act.dosageUnit}`
                    : act.dosage
                    ? ` • ${act.dosage}`
                    : ""
                }`;

                return (
                  <View
                    key={act.id || `act-${index}`}
                    style={[
                      styles.activityRow,
                      index < Math.min(recentActivities.length, 3) - 1 && styles.activityRowDivider,
                    ]}
                  >
                    <Ionicons name={iconName} size={20} color={iconColor} style={styles.activityIcon} />
                    <View style={styles.activityDetailsCol}>
                      <Text style={styles.activityMedicineName} numberOfLines={1}>
                        {act.medicineName || "Prescribed Medicine"}
                      </Text>
                      <Text style={styles.activitySubtext} numberOfLines={1}>
                        {detailText}
                      </Text>
                    </View>
                    <Text style={styles.activityTimeText}>
                      {formatActivityTime(act.actionTime, act.scheduledTime)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.noActivityBox}>
                <Ionicons name="information-circle-outline" size={20} color="#94A3B8" />
                <Text style={styles.noActivityText}>
                  No medication activity recorded yet today.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Note: In accordance with approved MediTrack+ design, there are NO additional */}
        {/* sections below Recent Activity. Notification settings, alarms, safety notice, */}
        {/* and Sign Out are fully maintained in the Profile screen flow. */}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBrandingHeader: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 10 : 12,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  brandTeal: {
    color: "#0D9488",
  },
  brandPlus: {
    color: "#0D9488",
  },
  avatarButton: {
    padding: 2,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E6FFFA",
    borderWidth: 1.5,
    borderColor: "#99F6E4",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0D9488",
  },
  scrollContent: {
    backgroundColor: "#F8FAFC",
    paddingBottom: 24,
  },
  greetingSection: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  greetingSubtitle: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "400",
  },

  /* 3. Today's Medicines Card */
  todayCard: {
    backgroundColor: "#F0FDFA",
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#99F6E4",
    elevation: 2,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
  },
  todayCardHeader: {
    marginBottom: 14,
  },
  todayCardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  todayCardScheduledCount: {
    fontSize: 13,
    color: "#0F766E",
    fontWeight: "500",
    marginTop: 2,
  },
  todayCardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todayStatsCol: {
    flex: 1,
    gap: 8,
    paddingRight: 10,
  },
  statPillTaken: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  statPillTakenText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16A34A",
    marginLeft: 6,
  },
  statPillRemaining: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  statPillRemainingNeutral: {
    backgroundColor: "#F1F5F9",
  },
  statPillRemainingAlert: {
    backgroundColor: "#FEE2E2",
  },
  statPillRemainingText: {
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },
  statPillRemainingTextNeutral: {
    color: "#64748B",
  },
  statPillRemainingTextAlert: {
    color: "#DC2626",
  },
  todayProgressCol: {
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingCircle: {
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  progressRingInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  progressPercentageText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  progressLabelText: {
    fontSize: 8.5,
    fontWeight: "600",
    color: "#0F766E",
    textAlign: "center",
    marginTop: 1,
  },

  /* 4. Next Dose Card */
  nextDoseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  nextDoseHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  nextDoseSectionTag: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeUpcoming: {
    backgroundColor: "#E0F2FE",
  },
  statusBadgePending: {
    backgroundColor: "#FEF3C7",
  },
  statusBadgeCompleted: {
    backgroundColor: "#DCFCE7",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusBadgeTextUpcoming: {
    color: "#0284C7",
  },
  statusBadgeTextPending: {
    color: "#B45309",
  },
  statusBadgeTextCompleted: {
    color: "#15803D",
  },
  nextDoseContentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nextDoseIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  nextDoseDetailsCol: {
    flex: 1,
    marginRight: 12,
  },
  nextDoseMedicineName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  nextDoseDosageText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  nextDoseTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  nextDoseTimeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D9488",
  },
  nextDoseViewButton: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "center",
  },
  nextDoseViewButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
  },
  noDoseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  noDoseDetails: {
    flex: 1,
    marginLeft: 12,
  },
  noDoseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  noDoseSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },

  /* 5. Quick Actions */
  quickActionsSection: {
    marginHorizontal: 20,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionTile: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  tileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileIconCircleAdd: {
    backgroundColor: "#E6FFFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
  },
  tileIconCircleCalendar: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  tileIconCircleMedicines: {
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
  },

  /* 6. Recent Activity */
  recentActivitySection: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D9488",
  },
  activityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  activityRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  activityIcon: {
    marginRight: 12,
  },
  activityDetailsCol: {
    flex: 1,
    marginRight: 8,
  },
  activityMedicineName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  activitySubtext: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  activityTimeText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  noActivityBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    justifyContent: "center",
    gap: 8,
  },
  noActivityText: {
    fontSize: 13,
    color: "#94A3B8",
  },
});
