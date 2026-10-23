/**
 * Medication Activity & Dose History Screen for MediTrack+
 * Redesigned to match the finalized MediTrack+ UI design reference (page 27 of ui.pdf).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { getAdherenceSummary, getMedicationActivities } from "../../api/activities";
import { colors, spacing } from "../../constants/theme";
import { AdherenceSummary, MedicationActivity } from "../../types";
import { EmptyState, InlineError, LoadingState } from "../../components/common";

interface ActivityHistoryScreenProps {
  onBack?: () => void;
}

type PeriodFilter = "All" | "Today" | "Yesterday" | "This week" | "This month";

const FILTER_OPTIONS: PeriodFilter[] = [
  "All",
  "Today",
  "Yesterday",
  "This week",
  "This month",
];

const PILL_COLORS = [
  { bg: "#DCFCE7", color: "#16A34A" }, // Green
  { bg: "#E0F2FE", color: "#0284C7" }, // Blue
  { bg: "#FEF3C7", color: "#D97706" }, // Amber
  { bg: "#FEE2E2", color: "#DC2626" }, // Red
  { bg: "#F3E8FF", color: "#9333EA" }, // Purple
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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

function formatTime(time24?: string): string {
  if (!time24) return "";
  const parts = time24.split(":");
  if (parts.length < 2) return time24;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  const displayM = String(m).padStart(2, "0");
  return `${displayH}:${displayM} ${ampm}`;
}

function formatTimeFromIso(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    const displayM = String(m).padStart(2, "0");
    return `${displayH}:${displayM} ${ampm}`;
  } catch {
    return isoString;
  }
}

function formatSummaryDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map((v) => parseInt(v, 10));
  if (parts.length !== 3) return dateStr;
  const [, month, day] = parts;
  const year = parts[0];
  return `${day} ${SHORT_MONTHS[month - 1]} ${year}`;
}

function formatDateSectionTitle(
  dateStr: string,
  todayStr: string,
  yesterdayStr: string
): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map((v) => parseInt(v, 10));
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const formattedDate = `${day} ${MONTH_NAMES[month - 1]} ${year}`;

  if (dateStr === todayStr) {
    return `Today, ${formattedDate}`;
  }
  if (dateStr === yesterdayStr) {
    return `Yesterday, ${formattedDate}`;
  }
  return formattedDate;
}

export const ActivityHistoryScreen: React.FC<ActivityHistoryScreenProps> = ({
  onBack,
}) => {
  const [activities, setActivities] = useState<MedicationActivity[]>([]);
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<PeriodFilter>("All");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Compute reference dates
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterdayStr = yDate.toISOString().split("T")[0];

  // Monday of this week
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek);
  const startOfWeekStr = startOfWeek.toISOString().split("T")[0];

  // 1st of this month
  const startOfMonthStr = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}-01`;

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [acts, sum] = await Promise.all([
        getMedicationActivities(),
        getAdherenceSummary({ startDate: todayStr, endDate: todayStr }),
      ]);
      setActivities(acts || []);
      setSummary(sum || null);
    } catch {
      setError("Failed to load activity logs. Pull to retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  // Filter activities by selected period
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const actDate = act.scheduledDate || act.actionTime.split("T")[0];
      switch (selectedFilter) {
        case "Today":
          return actDate === todayStr;
        case "Yesterday":
          return actDate === yesterdayStr;
        case "This week":
          return actDate >= startOfWeekStr && actDate <= todayStr;
        case "This month":
          return actDate >= startOfMonthStr && actDate <= todayStr;
        case "All":
        default:
          return true;
      }
    });
  }, [
    activities,
    selectedFilter,
    todayStr,
    yesterdayStr,
    startOfWeekStr,
    startOfMonthStr,
  ]);

  // Group filtered activities chronologically by date
  const groupedActivities = useMemo(() => {
    // Sort activities by date descending, then time descending
    const sorted = [...filteredActivities].sort((a, b) => {
      const dateA = a.scheduledDate || a.actionTime.split("T")[0];
      const dateB = b.scheduledDate || b.actionTime.split("T")[0];
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (b.scheduledTime || "").localeCompare(a.scheduledTime || "");
    });

    const groups: Array<{
      dateStr: string;
      title: string;
      items: MedicationActivity[];
    }> = [];

    sorted.forEach((act) => {
      const dateStr = act.scheduledDate || act.actionTime.split("T")[0];
      let group = groups.find((g) => g.dateStr === dateStr);
      if (!group) {
        group = {
          dateStr,
          title: formatDateSectionTitle(dateStr, todayStr, yesterdayStr),
          items: [],
        };
        groups.push(group);
      }
      group.items.push(act);
    });

    return groups;
  }, [filteredActivities, todayStr, yesterdayStr]);

  // Summary counts for the selected period
  const takenCount = useMemo(() => {
    if (selectedFilter === "Today" && summary?.takenCount !== undefined) {
      return summary.takenCount;
    }
    return filteredActivities.filter((a) => a.action === "Taken").length;
  }, [filteredActivities, selectedFilter, summary]);

  const skippedCount = useMemo(() => {
    if (selectedFilter === "Today" && summary?.skippedCount !== undefined) {
      return summary.skippedCount;
    }
    return filteredActivities.filter((a) => a.action === "Skipped").length;
  }, [filteredActivities, selectedFilter, summary]);

  const snoozedCount = useMemo(() => {
    if (selectedFilter === "Today" && summary?.snoozedCount !== undefined) {
      return summary.snoozedCount;
    }
    return filteredActivities.filter((a) => a.action === "Snoozed").length;
  }, [filteredActivities, selectedFilter, summary]);

  const pendingCount = useMemo(() => {
    if (selectedFilter === "Today" && summary?.pendingCount !== undefined) {
      return summary.pendingCount;
    }
    const scheduled = summary?.totalScheduled ?? 0;
    const handled = takenCount + skippedCount + snoozedCount;
    return Math.max(0, scheduled - handled);
  }, [selectedFilter, summary, takenCount, skippedCount, snoozedCount]);

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
          <Text style={styles.headerTitle}>Activity</Text>
          <Text style={styles.headerSubtitle}>Your medication history.</Text>
        </View>
      </View>

      {/* 2. Filter Controls Row */}
      <View style={styles.filterBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTER_OPTIONS.map((f) => {
            const isSelected = selectedFilter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterPill,
                  isSelected ? styles.filterPillSelected : styles.filterPillUnselected,
                ]}
                onPress={() => setSelectedFilter(f)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${f} filter`}
              >
                {f === "This month" ? (
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={isSelected ? "#FFFFFF" : colors.textSecondary}
                    style={{ marginRight: 5 }}
                  />
                ) : null}
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected
                      ? styles.filterPillTextSelected
                      : styles.filterPillTextUnselected,
                  ]}
                >
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
        {/* Error message */}
        {error ? (
          <InlineError
            title="Failed to load activity logs"
            subtitle="Pull down to retry."
          />
        ) : null}

        {/* 3. Daily / Period Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryLeftCol}>
            <Text style={styles.summaryPeriodTitle}>{selectedFilter}</Text>
            <Text style={styles.summaryDateText}>{formatSummaryDate(todayStr)}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryTilesRow}>
            {/* Taken */}
            <View style={[styles.summaryTile, styles.tileTaken]}>
              <View style={styles.tileCountRow}>
                <Ionicons
                  name="checkmark"
                  size={13}
                  color="#16A34A"
                  style={{ marginRight: 2 }}
                />
                <Text style={[styles.tileCountText, { color: "#16A34A" }]}>
                  {takenCount}
                </Text>
              </View>
              <Text style={[styles.tileLabelText, { color: "#16A34A" }]}>Taken</Text>
            </View>

            {/* Pending */}
            <View style={[styles.summaryTile, styles.tilePending]}>
              <View style={styles.tileCountRow}>
                <Ionicons
                  name="time-outline"
                  size={13}
                  color="#D97706"
                  style={{ marginRight: 2 }}
                />
                <Text style={[styles.tileCountText, { color: "#D97706" }]}>
                  {pendingCount}
                </Text>
              </View>
              <Text style={[styles.tileLabelText, { color: "#D97706" }]}>Pending</Text>
            </View>

            {/* Skipped */}
            <View style={[styles.summaryTile, styles.tileSkipped]}>
              <View style={styles.tileCountRow}>
                <Ionicons
                  name="close"
                  size={13}
                  color="#DC2626"
                  style={{ marginRight: 2 }}
                />
                <Text style={[styles.tileCountText, { color: "#DC2626" }]}>
                  {skippedCount}
                </Text>
              </View>
              <Text style={[styles.tileLabelText, { color: "#DC2626" }]}>Skipped</Text>
            </View>

            {/* Snoozed */}
            <View style={[styles.summaryTile, styles.tileSnoozed]}>
              <View style={styles.tileCountRow}>
                <Ionicons
                  name="reload-outline"
                  size={13}
                  color="#0284C7"
                  style={{ marginRight: 2 }}
                />
                <Text style={[styles.tileCountText, { color: "#0284C7" }]}>
                  {snoozedCount}
                </Text>
              </View>
              <Text style={[styles.tileLabelText, { color: "#0284C7" }]}>Snoozed</Text>
            </View>
          </View>
        </View>

        {/* 4 & 5. Activity History Grouped by Date */}
        {isLoading && !isRefreshing ? (
          <LoadingState skeleton={true} skeletonVariant="rows" skeletonCount={5} />
        ) : groupedActivities.length === 0 ? (
          /* 6. Empty State */
          <EmptyState
            variant="activity"
            description={
              selectedFilter === "All"
                ? "Your medication actions will appear here after taking, skipping, or snoozing doses."
                : `No medication activity recorded for ${selectedFilter.toLowerCase()}.`
            }
          />
        ) : (
          groupedActivities.map((group) => (
            <View key={group.dateStr} style={styles.dateGroupContainer}>
              {/* Date Section Header */}
              <View style={styles.dateSectionHeaderRow}>
                <Text style={styles.dateSectionTitle}>{group.title}</Text>
                <View style={styles.activitiesBadge}>
                  <Text style={styles.activitiesBadgeText}>
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "activity" : "activities"}
                  </Text>
                </View>
              </View>

              {/* Activity Cards */}
              {group.items.map((act, idx) => {
                const pillTheme = PILL_COLORS[idx % PILL_COLORS.length];
                const isTaken = act.action === "Taken";
                const isSkipped = act.action === "Skipped";
                const isSnoozed = act.action === "Snoozed";

                return (
                  <View
                    key={`${act.id || act.scheduleId}-${idx}`}
                    style={styles.activityCard}
                  >
                    {/* Time */}
                    <Text style={styles.activityTimeText}>
                      {formatTime(act.scheduledTime)}
                    </Text>

                    {/* Pill Circle */}
                    <View
                      style={[
                        styles.activityPillCircle,
                        { backgroundColor: pillTheme.bg },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="pill"
                        size={18}
                        color={pillTheme.color}
                      />
                    </View>

                    {/* Info */}
                    <View style={styles.activityInfoCol}>
                      <Text style={styles.activityMedName} numberOfLines={1}>
                        {act.medicineName || "Prescribed Medicine"}
                      </Text>
                      <Text style={styles.activityDosageText} numberOfLines={1}>
                        {act.dosage} {act.dosageUnit}{" "}
                        {act.dosageUnit ? `• 1 ${act.dosageUnit}` : ""}
                      </Text>

                      {/* Detail subline */}
                      <Text style={styles.activitySubDetailText} numberOfLines={1}>
                        {isTaken ? (
                          `Scheduled ${formatTime(act.scheduledTime)} | Taken at ${formatTimeFromIso(act.actionTime)}`
                        ) : isSnoozed ? (
                          `Scheduled ${formatTime(act.scheduledTime)} | Snoozed to ${formatTimeFromIso(act.actionTime)}`
                        ) : isSkipped ? (
                          `Scheduled ${formatTime(act.scheduledTime)}${act.skipReason ? ` | Reason: ${act.skipReason}` : ""}`
                        ) : (
                          `Scheduled ${formatTime(act.scheduledTime)}`
                        )}
                      </Text>
                    </View>

                    {/* Status Pill */}
                    <View
                      style={[
                        styles.statusPill,
                        isTaken
                          ? styles.statusPillTaken
                          : isSkipped
                          ? styles.statusPillSkipped
                          : isSnoozed
                          ? styles.statusPillSnoozed
                          : styles.statusPillPending,
                      ]}
                    >
                      <Ionicons
                        name={
                          isTaken
                            ? "checkmark-circle"
                            : isSkipped
                            ? "close-circle"
                            : isSnoozed
                            ? "reload-outline"
                            : "time-outline"
                        }
                        size={13}
                        color={
                          isTaken
                            ? "#16A34A"
                            : isSkipped
                            ? "#DC2626"
                            : isSnoozed
                            ? "#0284C7"
                            : "#D97706"
                        }
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.statusPillText,
                          isTaken
                            ? styles.statusPillTextTaken
                            : isSkipped
                            ? styles.statusPillTextSkipped
                            : isSnoozed
                            ? styles.statusPillTextSnoozed
                            : styles.statusPillTextPending,
                        ]}
                      >
                        {act.action}
                      </Text>
                    </View>

                    {/* Navigation chevron */}
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#94A3B8"
                      style={{ marginLeft: 6 }}
                    />
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

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
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* 2. Filter Bar */
  filterBarContainer: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  filterScrollContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    minHeight: 34,
  },
  filterPillSelected: {
    backgroundColor: colors.primary,
  },
  filterPillUnselected: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterPillTextSelected: {
    color: "#FFFFFF",
  },
  filterPillTextUnselected: {
    color: colors.textSecondary,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  /* Error Banner */
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    fontWeight: "500",
  },

  /* 3. Summary Card */
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryLeftCol: {
    minWidth: 80,
  },
  summaryPeriodTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  summaryDateText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 38,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 10,
  },
  summaryTilesRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  summaryTile: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTaken: {
    backgroundColor: "#DCFCE7",
  },
  tilePending: {
    backgroundColor: "#FEF3C7",
  },
  tileSkipped: {
    backgroundColor: "#FEE2E2",
  },
  tileSnoozed: {
    backgroundColor: "#E0F2FE",
  },
  tileCountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tileCountText: {
    fontSize: 14,
    fontWeight: "800",
  },
  tileLabelText: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },

  /* 4. Activity Groups */
  dateGroupContainer: {
    marginBottom: 16,
  },
  dateSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  dateSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  activitiesBadge: {
    backgroundColor: "#CCFBF1",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  activitiesBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primaryDark,
  },

  /* Activity Card */
  activityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  activityTimeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 70,
  },
  activityPillCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  activityInfoCol: {
    flex: 1,
  },
  activityMedName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  activityDosageText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activitySubDetailText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },

  /* Status Pills */
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillTaken: {
    backgroundColor: "#DCFCE7",
  },
  statusPillSkipped: {
    backgroundColor: "#FEE2E2",
  },
  statusPillSnoozed: {
    backgroundColor: "#E0F2FE",
  },
  statusPillPending: {
    backgroundColor: "#FEF3C7",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusPillTextTaken: {
    color: "#16A34A",
  },
  statusPillTextSkipped: {
    color: "#DC2626",
  },
  statusPillTextSnoozed: {
    color: "#0284C7",
  },
  statusPillTextPending: {
    color: "#D97706",
  },

  /* Loader & Empty */
  loaderBox: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
});
