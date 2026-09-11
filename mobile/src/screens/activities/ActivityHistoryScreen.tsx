/**
 * Activity History & Dose Tracking Screen (Phase 7).
 * Displays full clinical intake audit logs, action badges, skip reasons,
 * snooze occurrences, and patient adherence summary computed against real schedules.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getAdherenceSummary, getMedicationActivities } from "../../api/activities";
import { Card } from "../../components/common/Card";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { AdherenceSummary, MedicationActionType, MedicationActivity } from "../../types";

type ActionFilter = "ALL" | MedicationActionType;

export const ActivityHistoryScreen: React.FC = () => {
  const { user } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  const [activities, setActivities] = useState<MedicationActivity[]>([]);
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [filter, setFilter] = useState<ActionFilter>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    const todayStr = new Date().toISOString().split("T")[0];
    try {
      const [acts, sum] = await Promise.all([
        getMedicationActivities(),
        getAdherenceSummary({ startDate: todayStr, endDate: todayStr }),
      ]);
      setActivities(acts || []);
      setSummary(sum || null);
    } catch (err: any) {
      setError("Failed to load activity logs. Pull to retry.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const filteredActivities = activities.filter((act) => {
    if (filter === "ALL") return true;
    return act.action === filter;
  });

  const renderItem = ({ item }: { item: MedicationActivity }) => {
    const isTaken = item.action === "Taken";
    const isSkipped = item.action === "Skipped";
    const isSnoozed = item.action === "Snoozed";

    return (
      <Card style={styles.activityCard}>
        <View style={styles.cardHeader}>
          <View style={styles.medInfo}>
            <Text style={styles.medicineName}>
              {item.medicineName || "Prescribed Medicine"}
            </Text>
            {item.dosage ? (
              <Text style={styles.dosageText}>
                {item.dosage} {item.dosageUnit}
              </Text>
            ) : null}
          </View>

          {/* Action Badge */}
          <View
            style={[
              styles.badge,
              isTaken && styles.takenBadge,
              isSkipped && styles.skippedBadge,
              isSnoozed && styles.snoozedBadge,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isTaken && styles.takenBadgeText,
                isSkipped && styles.skippedBadgeText,
                isSnoozed && styles.snoozedBadgeText,
              ]}
            >
              {isTaken && "✓ Taken"}
              {isSkipped && "✕ Skipped"}
              {isSnoozed && "⏰ Snoozed"}
            </Text>
          </View>
        </View>

        {/* Schedule vs Action Timing */}
        <View style={styles.timingRow}>
          <Text style={styles.scheduledTiming}>
            📅 Scheduled: {item.scheduledDate} at {item.scheduledTime}
          </Text>
          <Text style={styles.actionTiming}>
            Logged:{" "}
            {new Date(item.actionTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {/* Previous Snooze Context */}
        {item.wasSnoozed && (
          <View style={styles.snoozeContextBanner}>
            <Text style={styles.snoozeContextText}>
              ⏳ Previously snoozed {item.snoozeCount ? `${item.snoozeCount} time(s)` : ""} before intake
            </Text>
          </View>
        )}

        {/* Skip Reason */}
        {isSkipped && item.skipReason ? (
          <View style={styles.skipReasonBox}>
            <Text style={styles.skipReasonLabel}>Skip Reason:</Text>
            <Text style={styles.skipReasonValue}>{item.skipReason}</Text>
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dose Activity & History</Text>
        <Text style={styles.headerSubtitle}>
          {isCaregiver ? "Caregiver Patient Activity Log" : "Personal Medication Adherence Records"}
        </Text>
      </View>

      <FlatList
        data={filteredActivities}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <>
            {/* Medical Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                ⚠️ {config.medicalDisclaimer}
              </Text>
            </View>

            {/* Adherence Summary Card */}
            {summary && (
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Today's Adherence Summary</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{summary.adherencePercentage}%</Text>
                    <Text style={styles.statLabel}>Adherence</Text>
                  </View>

                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: colors.taken }]}>{summary.takenCount}</Text>
                    <Text style={styles.statLabel}>Taken</Text>
                  </View>

                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: colors.skipped }]}>{summary.skippedCount}</Text>
                    <Text style={styles.statLabel}>Skipped</Text>
                  </View>

                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: colors.primaryDark }]}>{summary.totalScheduled}</Text>
                    <Text style={styles.statLabel}>Scheduled</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Filter Tabs */}
            <View style={styles.filterBar}>
              {(["ALL", "Taken", "Skipped", "Snoozed"] as ActionFilter[]).map((f) => {
                const isSelected = filter === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterTab, isSelected && styles.filterTabSelected]}
                    onPress={() => setFilter(f)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.filterTabText, isSelected && styles.filterTabTextSelected]}>
                      {f}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No Activity Recorded</Text>
              <Text style={styles.emptyText}>
                {filter === "ALL"
                  ? "As medication doses are taken, snoozed, or skipped, logs will appear here."
                  : `No activities found with status "${filter}".`}
              </Text>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: spacing.xl }} size="large" color={colors.primary} />
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: (StatusBar.currentHeight || 24) + spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h2,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: 2,
  },
  listContent: {
    padding: spacing.md,
  },
  disclaimerBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  summaryCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
    fontWeight: "800",
  },
  statLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  filterBar: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: "center",
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  filterTabText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  filterTabTextSelected: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  errorBanner: {
    backgroundColor: colors.skippedLight,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...typography.small,
    color: colors.error,
    fontWeight: "600",
  },
  activityCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  medInfo: {
    flex: 1,
  },
  medicineName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  dosageText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  takenBadge: {
    backgroundColor: colors.takenLight,
  },
  takenBadgeText: {
    ...typography.small,
    color: colors.taken,
    fontWeight: "700",
  },
  skippedBadge: {
    backgroundColor: colors.skippedLight,
  },
  skippedBadgeText: {
    ...typography.small,
    color: colors.skipped,
    fontWeight: "700",
  },
  snoozedBadge: {
    backgroundColor: colors.snoozedLight,
  },
  snoozedBadgeText: {
    ...typography.small,
    color: colors.snoozed,
    fontWeight: "700",
  },
  badgeText: {
    ...typography.small,
    fontWeight: "600",
  },
  timingRow: {
    marginTop: spacing.xs,
  },
  scheduledTiming: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionTiming: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  snoozeContextBanner: {
    backgroundColor: colors.snoozedLight,
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  snoozeContextText: {
    ...typography.small,
    color: "#92400E",
    fontWeight: "600",
  },
  skipReasonBox: {
    backgroundColor: colors.skippedLight,
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  skipReasonLabel: {
    ...typography.small,
    color: colors.skipped,
    fontWeight: "700",
  },
  skipReasonValue: {
    ...typography.small,
    color: colors.skipped,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
