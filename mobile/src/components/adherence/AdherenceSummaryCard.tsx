/**
 * Medication Adherence Summary Screen for MediTrack+
 * Redesigned to match the finalized MediTrack+ UI design reference (page 26 of ui.pdf).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import { getAdherenceSummary } from "../../api/activities";
import { getLocalTodayString, getMedicationCalendar } from "../../api/calendar";
import { colors, spacing } from "../../constants/theme";
import { AdherenceSummary, CalendarResponse } from "../../types";

export interface AdherenceSummaryScreenProps {
  onBack?: () => void;
  onNavigateToHistory?: () => void;
  onNavigateToReports?: () => void;
  onNavigateToHome?: () => void;
  onNavigateToMedicines?: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToProfile?: () => void;
  hideBottomNav?: boolean;
}

export type PeriodFilter = "Today" | "This Week" | "This Month";

interface DayTrendPoint {
  dayName: string;
  dateStr: string;
  percentage: number;
  hasData: boolean;
}

const PERIOD_OPTIONS: PeriodFilter[] = ["Today", "This Week", "This Month"];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Circular progress ring for adherence percentage.
 * Matching the exact visual style from Page 26 of ui.pdf.
 */
const AdherenceProgressRing: React.FC<{ percentage: number; size?: number }> = ({
  percentage,
  size = 114,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

  // Quadrant coloring logic
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

export const AdherenceSummaryScreen: React.FC<AdherenceSummaryScreenProps> = ({
  onBack,
  onNavigateToHistory,
  onNavigateToReports,
  onNavigateToHome,
  onNavigateToMedicines,
  onNavigateToCalendar,
  onNavigateToProfile,
  hideBottomNav = false,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("This Week");
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [trendDays, setTrendDays] = useState<DayTrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Compute reference dates
  const todayStr = useMemo(() => getLocalTodayString(), []);

  // Compute date range based on selected period
  const dateRange = useMemo(() => {
    const now = new Date();
    if (selectedPeriod === "Today") {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (selectedPeriod === "This Week") {
      const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - dayOfWeek);
      const startOfWeekStr = startOfWeek.toISOString().split("T")[0];
      return { startDate: startOfWeekStr, endDate: todayStr };
    }
    // "This Month"
    const startOfMonthStr = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-01`;
    return { startDate: startOfMonthStr, endDate: todayStr };
  }, [selectedPeriod, todayStr]);

  // Load summary and trend data
  const loadData = useCallback(async () => {
    setError(null);
    try {
      // 1. Fetch Adherence Summary for selected period
      const sumPromise = getAdherenceSummary({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });

      // 2. Fetch 7-day trend data (last 7 days ending today)
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 6);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

      const calPromise = getMedicationCalendar({
        startDate: sevenDaysAgoStr,
        endDate: todayStr,
      });

      const [sumRes, calRes] = await Promise.all([sumPromise, calPromise]);
      setSummary(sumRes || null);

      // Process 7-day trend points
      const points: DayTrendPoint[] = [];
      const daysMap = new Map<string, { total: number; taken: number }>();

      const daysList = calRes.daysSummary || calRes.days || [];
      daysList.forEach((d) => {
        daysMap.set(d.date, {
          total: d.totalDoses,
          taken: d.takenCount,
        });
      });

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dStr = d.toISOString().split("T")[0];
        const dayName = DAY_NAMES[d.getDay()];

        const rec = daysMap.get(dStr);
        if (rec && rec.total > 0) {
          const pct = Math.round((rec.taken / rec.total) * 100);
          points.push({
            dayName,
            dateStr: dStr,
            percentage: pct,
            hasData: true,
          });
        } else if (rec) {
          // Scheduled = 0
          points.push({
            dayName,
            dateStr: dStr,
            percentage: 100,
            hasData: false,
          });
        } else {
          // Default baseline
          points.push({
            dayName,
            dateStr: dStr,
            percentage: 100,
            hasData: false,
          });
        }
      }

      setTrendDays(points);
    } catch {
      setError("Unable to load adherence summary. Pull down to retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dateRange, todayStr]);

  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [loadData]);

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

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  // Metric counts derived safely from real data
  const totalScheduled = summary?.totalScheduled ?? 0;
  const takenCount = summary?.takenCount ?? 0;
  const skippedCount = summary?.skippedCount ?? 0;
  const pendingCount = summary?.pendingCount ?? 0;
  const adherencePercentage = summary?.adherencePercentage ?? (totalScheduled > 0 ? Math.round((takenCount / totalScheduled) * 100) : 100);

  // Dynamic supportive insight text
  const periodLabel = selectedPeriod === "Today" ? "today" : selectedPeriod === "This Week" ? "this week" : "this month";
  const progressBadge = useMemo(() => {
    if (adherencePercentage >= 80) {
      return {
        title: "Good progress!",
        message: `You've taken most of your scheduled doses ${periodLabel}.`,
      };
    }
    if (adherencePercentage >= 50) {
      return {
        title: "Steady progress",
        message: `Keep taking your medicines on time to stay consistent ${periodLabel}.`,
      };
    }
    return {
      title: "Needs attention",
      message: `Try setting reminders to stay on track with your doses ${periodLabel}.`,
    };
  }, [adherencePercentage, periodLabel]);

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
          <Text style={styles.headerTitle}>Adherence Summary</Text>
          <Text style={styles.headerSubtitle}>Track how consistently you take your medicines.</Text>
        </View>
      </View>

      {/* 2. Period Selector Tabs */}
      <View style={styles.periodSelectorWrapper}>
        <View style={styles.periodSelectorContainer} accessibilityRole="tablist">
          {PERIOD_OPTIONS.map((period) => {
            const isSelected = selectedPeriod === period;
            return (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodTab,
                  isSelected ? styles.periodTabSelected : styles.periodTabUnselected,
                ]}
                onPress={() => setSelectedPeriod(period)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${period} adherence period`}
              >
                <Text
                  style={[
                    styles.periodTabText,
                    isSelected ? styles.periodTabTextSelected : styles.periodTabTextUnselected,
                  ]}
                >
                  {period}
                </Text>
              </TouchableOpacity>
            );
          })}
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

        {isLoading && !isRefreshing ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading adherence summary...</Text>
          </View>
        ) : (
          <>
            {/* 3. Main Adherence Summary Card */}
            <View style={styles.mainSummaryCard}>
              {/* Left Column: Progress Ring */}
              <View style={styles.ringColumn}>
                <AdherenceProgressRing percentage={adherencePercentage} />
              </View>

              {/* Right Column: Information & Supportive Insight */}
              <View style={styles.infoColumn}>
                <Text style={styles.cardHeaderTitle}>Medication Adherence</Text>
                <Text style={styles.cardHeaderSubtitle}>
                  {takenCount} of {totalScheduled} scheduled doses completed
                </Text>

                {/* Progress / Insight Message Badge */}
                <View style={styles.progressInsightBadge}>
                  <View style={styles.insightIconCircle}>
                    <Ionicons name="trending-up" size={14} color="#16A34A" />
                  </View>
                  <View style={styles.insightTextCol}>
                    <Text style={styles.insightBadgeTitle}>{progressBadge.title}</Text>
                    <Text style={styles.insightBadgeMessage}>
                      {progressBadge.message}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 4. Summary Breakdown (4 Metric Tiles) */}
            <View style={styles.breakdownRow}>
              {/* Taken */}
              <View style={[styles.breakdownTile, styles.tileTaken]}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#16A34A" }]}>
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                </View>
                <Text style={[styles.tileCountText, { color: "#16A34A" }]}>{takenCount}</Text>
                <Text style={[styles.tileLabelText, { color: "#16A34A" }]}>Taken</Text>
                <Text style={styles.tileSublabelText}>Completed doses</Text>
              </View>

              {/* Skipped */}
              <View style={[styles.breakdownTile, styles.tileSkipped]}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#DC2626" }]}>
                  <Ionicons name="close" size={13} color="#FFFFFF" />
                </View>
                <Text style={[styles.tileCountText, { color: "#DC2626" }]}>{skippedCount}</Text>
                <Text style={[styles.tileLabelText, { color: "#DC2626" }]}>Skipped</Text>
                <Text style={styles.tileSublabelText}>Missed doses</Text>
              </View>

              {/* Pending */}
              <View style={[styles.breakdownTile, styles.tilePending]}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#D97706" }]}>
                  <Ionicons name="time-outline" size={13} color="#FFFFFF" />
                </View>
                <Text style={[styles.tileCountText, { color: "#D97706" }]}>{pendingCount}</Text>
                <Text style={[styles.tileLabelText, { color: "#D97706" }]}>Pending</Text>
                <Text style={styles.tileSublabelText}>Upcoming doses</Text>
              </View>

              {/* Scheduled */}
              <View style={[styles.breakdownTile, styles.tileScheduled]}>
                <View style={[styles.tileIconCircle, { backgroundColor: "#475569" }]}>
                  <Ionicons name="calendar-outline" size={12} color="#FFFFFF" />
                </View>
                <Text style={[styles.tileCountText, { color: "#1E293B" }]}>{totalScheduled}</Text>
                <Text style={[styles.tileLabelText, { color: "#1E293B" }]}>Scheduled</Text>
                <Text style={styles.tileSublabelText}>Total doses</Text>
              </View>
            </View>

            {/* 5. Adherence Trend Section */}
            <View style={styles.trendSectionCard}>
              <View style={styles.trendHeaderRow}>
                <Text style={styles.trendSectionTitle}>Adherence Trend</Text>
                <View style={styles.trendRangeSelector}>
                  <Text style={styles.trendRangeText}>Last 7 days</Text>
                  <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
                </View>
              </View>

              {/* 7-Day Bar Chart */}
              <View style={styles.chartContainer}>
                {/* Y-axis guidelines & labels */}
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

                  {/* 7 Vertical Bars */}
                  <View style={styles.barsRow}>
                    {trendDays.map((td, idx) => {
                      const barFillHeight = Math.max(8, Math.min(100, td.percentage));
                      return (
                        <View key={`${td.dateStr}-${idx}`} style={styles.barCol}>
                          {/* Top percentage label */}
                          <Text style={styles.barTopLabel}>{td.percentage}%</Text>

                          {/* Bar track and fill */}
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  height: `${barFillHeight}%`,
                                },
                              ]}
                            />
                          </View>

                          {/* Day label */}
                          <Text style={styles.barDayLabel}>{td.dayName}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>

            {/* 6. Insight Card */}
            <TouchableOpacity
              style={styles.insightCard}
              onPress={onNavigateToReports}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="View detailed adherence reports"
            >
              <View style={styles.insightBulbCircle}>
                <Ionicons name="bulb-outline" size={20} color="#0D9488" />
              </View>
              <View style={styles.insightCardContentCol}>
                <Text style={styles.insightCardTitle}>
                  Your adherence is {adherencePercentage}% {periodLabel}.
                </Text>
                <Text style={styles.insightCardSubtitle}>
                  Keep it up! Staying consistent helps you get the best results from your treatment.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* 7. View Activity History Button */}
            <TouchableOpacity
              style={styles.activityHistoryButton}
              onPress={onNavigateToHistory}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="View Activity History"
            >
              <Ionicons name="time-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.activityHistoryButtonText}>View Activity History</Text>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* 8. Bottom Navigation Bar */}
      {!hideBottomNav && (
        <View style={styles.bottomTabBar}>
          {/* Home Tab (Selected / Active) */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => onNavigateToHome?.() || onBack?.()}
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            accessibilityLabel="Home tab"
          >
            <Ionicons name="home" size={22} color={colors.primary} />
            <Text style={[styles.tabItemLabel, styles.tabItemLabelActive]}>Home</Text>
            <View style={styles.activeTabIndicator} />
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
            <View style={styles.inactiveTabIndicator} />
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
            <View style={styles.inactiveTabIndicator} />
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
            <View style={styles.inactiveTabIndicator} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

// Also export as AdherenceSummaryCard for backwards-compatibility
export const AdherenceSummaryCard = AdherenceSummaryScreen;
export default AdherenceSummaryScreen;

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

  /* 2. Period Selector */
  periodSelectorWrapper: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  periodSelectorContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 24,
    padding: 3,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  periodTabSelected: {
    backgroundColor: colors.primary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodTabUnselected: {
    backgroundColor: "transparent",
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  periodTabTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  periodTabTextUnselected: {
    color: colors.textSecondary,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },

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

  /* 3. Main Adherence Summary Card */
  mainSummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  ringColumn: {
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
  infoColumn: {
    flex: 1,
    marginLeft: 16,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  cardHeaderSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  progressInsightBadge: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  insightIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
    marginTop: 1,
  },
  insightTextCol: {
    flex: 1,
  },
  insightBadgeTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803D",
  },
  insightBadgeMessage: {
    fontSize: 11,
    color: "#166534",
    marginTop: 2,
    lineHeight: 14,
  },

  /* 4. Summary Breakdown */
  breakdownRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  breakdownTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
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
  tileScheduled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  tileIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tileCountText: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 6,
  },
  tileLabelText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  tileSublabelText: {
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },

  /* 5. Adherence Trend */
  trendSectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  trendHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  trendSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  trendRangeSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  trendRangeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
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

  /* 6. Insight Card */
  insightCard: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  insightBulbCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  insightCardContentCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  insightCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  insightCardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 15,
  },

  /* 7. View Activity History Button */
  activityHistoryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 10,
  },
  activityHistoryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
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
  tabItemLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  activeTabIndicator: {
    width: 16,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
    marginTop: 3,
  },
  inactiveTabIndicator: {
    width: 16,
    height: 2,
    backgroundColor: "transparent",
    marginTop: 3,
  },
});
