/**
 * Medication Calendar & Adherence Streaks Screen (Phase 8).
 * Visualizes scheduled medication occurrences, daily adherence states,
 * and clinically rigorous streak tracking for patient engagement.
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
import {
  getAdherenceStreaks,
  getLocalTodayString,
  getMedicationCalendar,
} from "../../api/calendar";
import { Card } from "../../components/common/Card";
import { config } from "../../constants/config";
import {
  accessibility,
  borderRadius,
  colors,
  spacing,
  typography,
} from "../../constants/theme";
import {
  CalendarOccurrence,
  CalendarResponse,
  DayAggregateStatus,
  DaySummary,
  StreakData,
} from "../../types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function formatTime(time24: string): string {
  if (!time24) return "";
  const [hoursStr, minsStr] = time24.split(":");
  const hours = parseInt(hoursStr, 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minsStr || "00"} ${ampm}`;
}

function formatDateLong(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const CalendarScreen: React.FC = () => {
  const localToday = useMemo(() => getLocalTodayString(), []);
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => localToday);

  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
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
    } catch (err: any) {
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

  const handleJumpToToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(localToday);
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

  // Selected date's aggregate summary
  const selectedDaySummary = useMemo(() => {
    return daySummaryMap.get(selectedDate);
  }, [daySummaryMap, selectedDate]);

  // Generate grid cells for the current month view
  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const cells: Array<{
      key: string;
      dayNumber: number | null;
      dateStr: string | null;
      isToday: boolean;
      isSelected: boolean;
      status: DayAggregateStatus;
      totalDoses: number;
      takenCount: number;
    }> = [];

    // Leading blanks
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({
        key: `pad-start-${i}`,
        dayNumber: null,
        dateStr: null,
        isToday: false,
        isSelected: false,
        status: "None",
        totalDoses: 0,
        takenCount: 0,
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(currentMonth + 1).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      const dateStr = `${currentYear}-${mStr}-${dStr}`;
      const summary = daySummaryMap.get(dateStr);

      cells.push({
        key: dateStr,
        dayNumber: day,
        dateStr,
        isToday: dateStr === localToday,
        isSelected: dateStr === selectedDate,
        status: summary?.status || "None",
        totalDoses: summary?.totalDoses || 0,
        takenCount: summary?.takenCount || 0,
      });
    }

    return cells;
  }, [currentYear, currentMonth, daySummaryMap, localToday, selectedDate]);

  const renderStatusDot = (status: DayAggregateStatus) => {
    switch (status) {
      case "Adherent":
        return <View style={[styles.statusDot, styles.dotAdherent]} />;
      case "Skipped":
        return <View style={[styles.statusDot, styles.dotSkipped]} />;
      case "Snoozed":
        return <View style={[styles.statusDot, styles.dotSnoozed]} />;
      case "Pending":
        return <View style={[styles.statusDot, styles.dotPending]} />;
      default:
        return <View style={styles.statusDotEmpty} />;
    }
  };

  const getDayStatusBadge = (status?: DayAggregateStatus) => {
    switch (status) {
      case "Adherent":
        return { label: "All Doses Taken", bg: colors.takenLight, color: colors.taken };
      case "Skipped":
        return { label: "Dose Skipped", bg: colors.skippedLight, color: colors.skipped };
      case "Snoozed":
        return { label: "Dose Snoozed", bg: colors.snoozedLight, color: colors.snoozed };
      case "Pending":
        return { label: "Doses Scheduled", bg: colors.dueLight, color: colors.due };
      default:
        return { label: "No Doses Scheduled", bg: colors.surfaceSubtle, color: colors.textMuted };
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Medication Calendar</Text>
          <Text style={styles.headerSubtitle}>
            Adherence streaks & scheduled occurrences
          </Text>
        </View>

        {/* Adherence Streak Summary Card */}
        <Card style={styles.streakCard}>
          <View style={styles.streakHeader}>
            <Text style={styles.streakTitle}>Adherence Streaks</Text>
            <Text style={styles.streakSubtitle}>
              Consecutive days with all prescribed doses taken
            </Text>
          </View>

          <View style={styles.streakStatsRow}>
            {/* Current Streak */}
            <View style={styles.streakStatItem}>
              <Text style={styles.streakStatEmoji}>🔥</Text>
              <Text style={styles.streakStatValue}>
                {streakData?.currentStreak ?? 0}
              </Text>
              <Text style={styles.streakStatLabel}>Current Streak</Text>
            </View>

            {/* Divider */}
            <View style={styles.statDivider} />

            {/* Longest Streak */}
            <View style={styles.streakStatItem}>
              <Text style={styles.streakStatEmoji}>🏆</Text>
              <Text style={styles.streakStatValue}>
                {streakData?.longestStreak ?? 0}
              </Text>
              <Text style={styles.streakStatLabel}>Longest Streak</Text>
            </View>

            {/* Divider */}
            <View style={styles.statDivider} />

            {/* Total Adherent Days */}
            <View style={styles.streakStatItem}>
              <Text style={styles.streakStatEmoji}>✅</Text>
              <Text style={styles.streakStatValue}>
                {streakData?.totalAdherentDays ?? 0}
              </Text>
              <Text style={styles.streakStatLabel}>Adherent Days</Text>
            </View>
          </View>

          <Text style={styles.streakRuleNote}>
            • Days without scheduled doses are neutral and do not break streaks.
          </Text>
        </Card>

        {/* Month Navigation Card */}
        <Card style={styles.calendarCard}>
          <View style={styles.monthNavRow}>
            <TouchableOpacity
              onPress={handlePrevMonth}
              style={styles.navButton}
              accessibilityLabel="Previous month"
              accessibilityRole="button"
            >
              <Text style={styles.navButtonText}>‹</Text>
            </TouchableOpacity>

            <View style={styles.monthYearContainer}>
              <Text style={styles.monthYearText}>
                {MONTH_NAMES[currentMonth]} {currentYear}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleNextMonth}
              style={styles.navButton}
              accessibilityLabel="Next month"
              accessibilityRole="button"
            >
              <Text style={styles.navButtonText}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleJumpToToday}
              style={styles.todayButton}
              accessibilityLabel="Jump to today"
              accessibilityRole="button"
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday Row */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>

          {/* Calendar Grid */}
          {isLoading && !isRefreshing ? (
            <View style={styles.gridLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Loading calendar...</Text>
            </View>
          ) : (
            <View style={styles.calendarGrid}>
              {calendarCells.map((cell) => {
                if (cell.dayNumber === null) {
                  return <View key={cell.key} style={styles.dayCellEmpty} />;
                }

                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[
                      styles.dayCell,
                      cell.isToday && styles.dayCellToday,
                      cell.isSelected && styles.dayCellSelected,
                    ]}
                    onPress={() => {
                      if (cell.dateStr) {
                        setSelectedDate(cell.dateStr);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${MONTH_NAMES[currentMonth]} ${cell.dayNumber}, Status: ${cell.status}`}
                    accessibilityState={{ selected: cell.isSelected }}
                  >
                    <Text
                      style={[
                        styles.dayNumberText,
                        cell.isToday && styles.dayNumberToday,
                        cell.isSelected && styles.dayNumberSelected,
                      ]}
                    >
                      {cell.dayNumber}
                    </Text>
                    {renderStatusDot(cell.status)}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Calendar Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotAdherent]} />
              <Text style={styles.legendLabel}>Adherent</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotSkipped]} />
              <Text style={styles.legendLabel}>Skipped</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotSnoozed]} />
              <Text style={styles.legendLabel}>Snoozed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotPending]} />
              <Text style={styles.legendLabel}>Scheduled</Text>
            </View>
          </View>
        </Card>

        {/* Selected Date Occurrences Section */}
        <View style={styles.occurrencesSection}>
          <View style={styles.selectedDateHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedDateTitle}>
                {formatDateLong(selectedDate)}
              </Text>
              <Text style={styles.selectedDateSubtitle}>
                {selectedOccurrences.length}{" "}
                {selectedOccurrences.length === 1 ? "dose" : "doses"} scheduled
              </Text>
            </View>

            {/* Day Aggregate Badge */}
            {(() => {
              const badge = getDayStatusBadge(selectedDaySummary?.status);
              return (
                <View style={[styles.dayStatusBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.dayStatusBadgeText, { color: badge.color }]}>
                    {badge.label}
                  </Text>
                </View>
              );
            })()}
          </View>

          {/* Occurrences List */}
          {selectedOccurrences.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyTitle}>No Doses Scheduled</Text>
              <Text style={styles.emptySubtitle}>
                No prescribed medicines have an active intake schedule on this date.
              </Text>
            </Card>
          ) : (
            selectedOccurrences.map((occ, idx) => {
              const isTaken = occ.status === "Taken";
              const isSkipped = occ.status === "Skipped";
              const isSnoozed = occ.status === "Snoozed";
              const isPending = occ.status === "Pending";

              return (
                <Card key={`${occ.scheduleId}-${occ.scheduledTime}-${idx}`} style={styles.occCard}>
                  <View style={styles.occHeader}>
                    <View style={styles.occTimeCol}>
                      <Text style={styles.occTimeText}>
                        {formatTime(occ.scheduledTime)}
                      </Text>
                      <Text style={styles.occFreqText}>
                        {occ.frequencyType.toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.occMedCol}>
                      <Text style={styles.occMedName}>{occ.medicineName}</Text>
                      <Text style={styles.occDosage}>
                        {occ.dosage} {occ.dosageUnit}
                      </Text>
                    </View>

                    {/* Occurrence Status Badge */}
                    <View
                      style={[
                        styles.occBadge,
                        isTaken && styles.occBadgeTaken,
                        isSkipped && styles.occBadgeSkipped,
                        isSnoozed && styles.occBadgeSnoozed,
                        isPending && styles.occBadgePending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.occBadgeText,
                          isTaken && styles.occBadgeTextTaken,
                          isSkipped && styles.occBadgeTextSkipped,
                          isSnoozed && styles.occBadgeTextSnoozed,
                          isPending && styles.occBadgeTextPending,
                        ]}
                      >
                        {isTaken && "✓ Taken"}
                        {isSkipped && "✕ Skipped"}
                        {isSnoozed && `⏰ Snoozed${occ.snoozeCount > 1 ? ` (${occ.snoozeCount}x)` : ""}`}
                        {isPending && "⏳ Pending"}
                      </Text>
                    </View>
                  </View>

                  {/* Context Info (Action Time / Skip Reason / Snooze history) */}
                  {isTaken && occ.actionTime && (
                    <View style={styles.occFooter}>
                      <Text style={styles.occFooterText}>
                        Taken at {new Date(occ.actionTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {occ.wasSnoozed ? " (previously snoozed)" : ""}
                      </Text>
                    </View>
                  )}

                  {isSkipped && occ.skipReason && (
                    <View style={[styles.occFooter, styles.occFooterSkipped]}>
                      <Text style={styles.occFooterSkippedText}>
                        Reason: {occ.skipReason}
                      </Text>
                    </View>
                  )}

                  {isSnoozed && (
                    <View style={[styles.occFooter, styles.occFooterSnoozed]}>
                      <Text style={styles.occFooterSnoozedText}>
                        Snoozed reminder will trigger again in 10 minutes.
                      </Text>
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </View>

        {/* Medical Disclaimer Card */}
        <Card style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>Clinical Disclaimer</Text>
          <Text style={styles.disclaimerText}>
            {config.medicalDisclaimer}
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop:
      Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + spacing.md
        : spacing.lg,
    paddingBottom: spacing.huge * 2,
  },
  header: {
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  streakCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  streakHeader: {
    marginBottom: spacing.md,
  },
  streakTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  streakSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  streakStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  streakStatItem: {
    alignItems: "center",
    flex: 1,
  },
  streakStatEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  streakStatValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  streakStatLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.borderLight,
  },
  streakRuleNote: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.md,
    fontStyle: "italic",
  },
  calendarCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  monthNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonText: {
    fontSize: 26,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 28,
  },
  monthYearContainer: {
    flex: 1,
    alignItems: "center",
  },
  monthYearText: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  todayButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  todayButtonText: {
    ...typography.small,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    ...typography.small,
    fontWeight: "600",
    color: colors.textMuted,
  },
  gridLoader: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCellEmpty: {
    width: "14.285%",
    aspectRatio: 1,
  },
  dayCell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md,
    padding: 2,
    minHeight: 40,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dayCellSelected: {
    backgroundColor: colors.primaryDark,
  },
  dayNumberText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  dayNumberToday: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  dayNumberSelected: {
    color: colors.textInverse,
    fontWeight: "700",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
  },
  statusDotEmpty: {
    width: 6,
    height: 6,
    marginTop: 3,
  },
  dotAdherent: {
    backgroundColor: colors.taken,
  },
  dotSkipped: {
    backgroundColor: colors.skipped,
  },
  dotSnoozed: {
    backgroundColor: colors.snoozed,
  },
  dotPending: {
    backgroundColor: colors.due,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  occurrencesSection: {
    marginBottom: spacing.lg,
  },
  selectedDateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  selectedDateTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  selectedDateSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  dayStatusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  dayStatusBadgeText: {
    ...typography.small,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  occCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.borderLight,
  },
  occHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  occTimeCol: {
    width: 84,
  },
  occTimeText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  occFreqText: {
    ...typography.small,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  occMedCol: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  occMedName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  occDosage: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  occBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  occBadgeTaken: {
    backgroundColor: colors.takenLight,
  },
  occBadgeSkipped: {
    backgroundColor: colors.skippedLight,
  },
  occBadgeSnoozed: {
    backgroundColor: colors.snoozedLight,
  },
  occBadgePending: {
    backgroundColor: colors.dueLight,
  },
  occBadgeText: {
    ...typography.small,
    fontWeight: "700",
  },
  occBadgeTextTaken: {
    color: colors.taken,
  },
  occBadgeTextSkipped: {
    color: colors.skipped,
  },
  occBadgeTextSnoozed: {
    color: colors.snoozed,
  },
  occBadgeTextPending: {
    color: colors.due,
  },
  occFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  occFooterText: {
    ...typography.small,
    color: colors.textMuted,
  },
  occFooterSkipped: {
    borderTopColor: colors.skippedLight,
  },
  occFooterSkippedText: {
    ...typography.small,
    color: colors.skipped,
    fontWeight: "500",
  },
  occFooterSnoozed: {
    borderTopColor: colors.snoozedLight,
  },
  occFooterSnoozedText: {
    ...typography.small,
    color: colors.snoozed,
    fontWeight: "500",
  },
  disclaimerCard: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  disclaimerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
