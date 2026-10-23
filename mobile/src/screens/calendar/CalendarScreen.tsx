/**
 * Medication Calendar Screen for MediTrack+
 * Redesigned to match the finalized MediTrack+ UI design reference (page 28 of ui.pdf).
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
import {
  getAdherenceStreaks,
  getLocalTodayString,
  getMedicationCalendar,
} from "../../api/calendar";
import { colors, spacing } from "../../constants/theme";
import {
  CalendarResponse,
  DayAggregateStatus,
  DaySummary,
  StreakData,
} from "../../types";
import { EmptyState } from "../../components/common";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

const PILL_COLORS = [
  { bg: "#DCFCE7", color: "#16A34A" }, // Green
  { bg: "#FEF3C7", color: "#D97706" }, // Amber
  { bg: "#E0F2FE", color: "#0284C7" }, // Blue
  { bg: "#FEE2E2", color: "#DC2626" }, // Red
  { bg: "#F3E8FF", color: "#9333EA" }, // Purple
];

function formatTime(time24?: string): string {
  if (!time24) return "";
  const [hoursStr, minsStr] = time24.split(":");
  const hours = parseInt(hoursStr, 10);
  if (isNaN(hours)) return time24;
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayHoursStr = String(displayHours).padStart(2, "0");
  return `${displayHoursStr}:${minsStr || "00"} ${ampm}`;
}

function formatSelectedDateFull(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map((v) => parseInt(v, 10));
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayName = weekdays[d.getDay()];
  const monthName = MONTH_NAMES[month - 1];
  return `${dayName}, ${day} ${monthName} ${year}`;
}

export const CalendarScreen: React.FC = () => {
  const localToday = useMemo(() => getLocalTodayString(), []);
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => localToday);

  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [, setStreakData] = useState<StreakData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  // Compute month range for API
  const startDateStr = useMemo(() => {
    const m = String(currentMonth + 1).padStart(2, "0");
    return `${currentYear}-${m}-01`;
  }, [currentYear, currentMonth]);

  const endDateStr = useMemo(() => {
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const m = String(currentMonth + 1).padStart(2, "0");
    const d = String(lastDay).padStart(2, "0");
    return `${currentYear}-${m}-${d}`;
  }, [currentYear, currentMonth]);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [calRes, strkRes] = await Promise.all([
        getMedicationCalendar({
          startDate: startDateStr,
          endDate: endDateStr,
          clientDate: localToday,
        }),
        getAdherenceStreaks({
          clientDate: localToday,
        }),
      ]);
      setCalendarData(calRes);
      setStreakData(strkRes);
    } catch {
      setError("Failed to load medication calendar. Pull to retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [startDateStr, endDateStr, localToday]);

  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Map of date string -> DaySummary
  const daySummaryMap = useMemo(() => {
    const map = new Map<string, DaySummary>();
    const list = calendarData?.daysSummary || calendarData?.days || [];
    list.forEach((ds) => {
      map.set(ds.date, ds);
    });
    return map;
  }, [calendarData]);

  // Occurrences for currently selected date
  const selectedOccurrences = useMemo(() => {
    if (!calendarData?.occurrences) return [];
    return calendarData.occurrences.filter((occ) => occ.date === selectedDate);
  }, [calendarData, selectedDate]);

  // Selected date summary
  const selectedDaySummary = useMemo(() => {
    return daySummaryMap.get(selectedDate);
  }, [daySummaryMap, selectedDate]);

  // Daily Adherence metrics
  const totalDoses =
    selectedDaySummary?.totalDoses ?? selectedOccurrences.length;
  const takenCount =
    selectedDaySummary?.takenCount ??
    selectedOccurrences.filter((o) => o.status === "Taken").length;
  const adherencePercent =
    totalDoses > 0 ? Math.round((takenCount / totalDoses) * 100) : 100;

  // Generate 7-column calendar grid (Monday to Sunday)
  const calendarCells = useMemo(() => {
    const firstDayDate = new Date(currentYear, currentMonth, 1);
    // Monday as first day: 0=Mon, 1=Tue, ..., 6=Sun
    const firstDayOfWeek = (firstDayDate.getDay() + 6) % 7;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const cells: Array<{
      key: string;
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      status: DayAggregateStatus;
    }> = [];

    // Leading days from previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
      const dayNum = daysInPrevMonth - firstDayOfWeek + 1 + i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      const mStr = String(prevDate.getMonth() + 1).padStart(2, "0");
      const dStr = String(dayNum).padStart(2, "0");
      const dateStr = `${prevDate.getFullYear()}-${mStr}-${dStr}`;
      const summary = daySummaryMap.get(dateStr);

      cells.push({
        key: `prev-${dateStr}`,
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === localToday,
        isSelected: dateStr === selectedDate,
        status: summary?.status || "None",
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(currentMonth + 1).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      const dateStr = `${currentYear}-${mStr}-${dStr}`;
      const summary = daySummaryMap.get(dateStr);

      cells.push({
        key: `curr-${dateStr}`,
        dayNumber: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === localToday,
        isSelected: dateStr === selectedDate,
        status: summary?.status || "None",
      });
    }

    // Trailing days from next month to complete the row
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nextDate = new Date(currentYear, currentMonth + 1, day);
      const mStr = String(nextDate.getMonth() + 1).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      const dateStr = `${nextDate.getFullYear()}-${mStr}-${dStr}`;
      const summary = daySummaryMap.get(dateStr);

      cells.push({
        key: `next-${dateStr}`,
        dayNumber: day,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === localToday,
        isSelected: dateStr === selectedDate,
        status: summary?.status || "None",
      });
    }

    return cells;
  }, [currentYear, currentMonth, daySummaryMap, localToday, selectedDate]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <Text style={styles.headerSubtitle}>Track your medication activity.</Text>
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
          <View style={styles.errorBanner}>
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={colors.danger}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* 2 & 3. Monthly Calendar Card */}
        <View style={styles.calendarCard}>
          {/* Month Navigation Row */}
          <View style={styles.monthNavRow}>
            <TouchableOpacity
              onPress={handlePrevMonth}
              style={styles.navChevronBtn}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            <Text style={styles.monthTitleText}>
              {MONTH_NAMES[currentMonth]} {currentYear}
            </Text>

            <TouchableOpacity
              onPress={handleNextMonth}
              style={styles.navChevronBtn}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Weekday Columns Row */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>

          {/* Calendar Grid */}
          {isLoading && !isRefreshing ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.calendarGrid}>
              {calendarCells.map((cell) => {
                const isTaken = cell.status === "Adherent";
                const isSkipped = cell.status === "Skipped";
                const isPending = cell.status === "Pending" || cell.status === "Snoozed";

                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={styles.dayCell}
                    onPress={() => {
                      setSelectedDate(cell.dateStr);
                      if (!cell.isCurrentMonth) {
                        setViewDate(new Date(cell.dateStr));
                      }
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${cell.dayNumber}, ${cell.status}`}
                  >
                    <View
                      style={[
                        styles.dayNumberWrapper,
                        cell.isSelected ? styles.dayNumberSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !cell.isCurrentMonth ? styles.dayTextOverflow : null,
                          cell.isSelected ? styles.dayTextSelected : null,
                        ]}
                      >
                        {cell.dayNumber}
                      </Text>
                      <View
                        style={[
                          styles.activityDot,
                          cell.isSelected
                            ? styles.dotSelected
                            : isTaken
                            ? styles.dotTaken
                            : isPending
                            ? styles.dotPending
                            : isSkipped
                            ? styles.dotSkipped
                            : styles.dotEmpty,
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* 4. Daily Adherence Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeaderRow}>
            <Text style={styles.summaryDateTitle}>
              {formatSelectedDateFull(selectedDate)}
            </Text>
            {selectedDate === localToday ? (
              <View style={styles.todayChip}>
                <Text style={styles.todayChipText}>Today</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.summaryMetricsRow}>
            {/* Left metric: Daily adherence */}
            <View style={styles.metricLeftCol}>
              <Text style={styles.metricLabel}>Daily adherence</Text>
              <Text style={styles.metricPercentText}>{adherencePercent}%</Text>
            </View>

            {/* Vertical divider */}
            <View style={styles.metricDivider} />

            {/* Right metric: Progress bar */}
            <View style={styles.metricRightCol}>
              <Text style={styles.metricDosesText}>
                {totalDoses > 0
                  ? `${takenCount} of ${totalDoses} doses completed`
                  : "No doses scheduled"}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${adherencePercent}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* 5. Medication Schedule Section */}
        <View style={styles.scheduleSection}>
          <View style={styles.scheduleHeaderRow}>
            <Text style={styles.scheduleSectionTitle}>Medication schedule</Text>
            <Text style={styles.scheduleCountText}>
              {totalDoses} {totalDoses === 1 ? "dose" : "doses"}
            </Text>
          </View>

          {selectedOccurrences.length === 0 ? (
            /* 6. Empty Selected Day */
            <EmptyState variant="calendar" />
          ) : (
            selectedOccurrences.map((occ, idx) => {
              const pillTheme = PILL_COLORS[idx % PILL_COLORS.length];
              const isTaken = occ.status === "Taken";
              const isSkipped = occ.status === "Skipped";
              const isSnoozed = occ.status === "Snoozed";

              return (
                <View
                  key={`${occ.scheduleId}-${occ.scheduledTime}-${idx}`}
                  style={styles.occCard}
                >
                  {/* Scheduled Time */}
                  <Text style={styles.occTimeText}>
                    {formatTime(occ.scheduledTime)}
                  </Text>

                  {/* Colored Pill Icon Circle */}
                  <View
                    style={[
                      styles.occPillCircle,
                      { backgroundColor: pillTheme.bg },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="pill"
                      size={18}
                      color={pillTheme.color}
                    />
                  </View>

                  {/* Medicine Name and Dosage */}
                  <View style={styles.occInfoCol}>
                    <Text style={styles.occMedName} numberOfLines={1}>
                      {occ.medicineName}
                    </Text>
                    <Text style={styles.occDosageText} numberOfLines={1}>
                      {occ.dosage} {occ.dosageUnit}  •  1 {occ.dosageUnit || "tablet"}
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
                          ? "alarm-outline"
                          : "time-outline"
                      }
                      size={14}
                      color={
                        isTaken
                          ? "#16A34A"
                          : isSkipped
                          ? "#DC2626"
                          : isSnoozed
                          ? "#D97706"
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
                      {occ.status}
                    </Text>
                  </View>

                  {/* Navigation indicator */}
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
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  /* 1. Top Header */
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 12,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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

  /* 2 & 3. Month Calendar Card */
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  monthNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  navChevronBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitleText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  weekdayText: {
    width: "14.285%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  loaderBox: {
    paddingVertical: 40,
    alignItems: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumberWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumberSelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  dayTextOverflow: {
    color: "#CBD5E1",
  },
  dayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  activityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  dotSelected: {
    backgroundColor: "#FFFFFF",
  },
  dotTaken: {
    backgroundColor: "#16A34A",
  },
  dotPending: {
    backgroundColor: "#D97706",
  },
  dotSkipped: {
    backgroundColor: "#DC2626",
  },
  dotEmpty: {
    backgroundColor: "#E2E8F0",
  },

  /* 4. Daily Adherence Summary Card */
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryDateTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  todayChip: {
    backgroundColor: "#CCFBF1",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  todayChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  summaryMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricLeftCol: {
    width: 100,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  metricPercentText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 16,
  },
  metricRightCol: {
    flex: 1,
  },
  metricDosesText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },

  /* 5. Medication Schedule Section */
  scheduleSection: {
    marginTop: 6,
  },
  scheduleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  scheduleSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  scheduleCountText: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  /* Medication Occurrence Card */
  occCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
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
  occTimeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 70,
  },
  occPillCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  occInfoCol: {
    flex: 1,
  },
  occMedName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  occDosageText: {
    fontSize: 12,
    color: colors.textSecondary,
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
    backgroundColor: "#FEF3C7",
  },
  statusPillPending: {
    backgroundColor: "#FEF3C7",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusPillTextTaken: {
    color: "#16A34A",
  },
  statusPillTextSkipped: {
    color: "#DC2626",
  },
  statusPillTextSnoozed: {
    color: "#D97706",
  },
  statusPillTextPending: {
    color: "#D97706",
  },

  /* 6. Empty Card */
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
});
