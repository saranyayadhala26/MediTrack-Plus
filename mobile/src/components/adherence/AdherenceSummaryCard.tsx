/**
 * Patient adherence summary for dashboard (today's schedule vs recorded activities).
 * Loads real data from GET /medication-activities/summary.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getAdherenceSummary } from "../../api/activities";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { AdherenceSummary } from "../../types";
import { Button } from "../common/Button";
import { Card } from "../common/Card";

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function formatPeriodLabel(summary: AdherenceSummary): string {
  const start = summary.startDate;
  const end = summary.endDate;
  if (start && end && start === end) {
    return `Today · ${start}`;
  }
  if (start && end) {
    return `${start} – ${end}`;
  }
  return "Today";
}

export const AdherenceSummaryCard: React.FC = () => {
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setError(null);
    const todayStr = getTodayDateString();
    try {
      const data = await getAdherenceSummary({ startDate: todayStr, endDate: todayStr });
      setSummary(data);
    } catch {
      setSummary(null);
      setError("Unable to load today's adherence summary.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleRetry = () => {
    setIsLoading(true);
    loadSummary();
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Today's Adherence Summary</Text>
      <Text style={styles.periodHint}>
        Based on scheduled doses for the selected period
      </Text>

      {isLoading ? (
        <ActivityIndicator
          style={styles.loader}
          size="small"
          color={colors.primary}
          accessibilityLabel="Loading adherence summary"
        />
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Try Again" onPress={handleRetry} variant="outline" style={styles.retryButton} />
        </View>
      ) : summary ? (
        <>
          <Text style={styles.periodLabel}>{formatPeriodLabel(summary)}</Text>

          <View style={styles.heroRow}>
            <Text style={styles.heroValue}>{summary.adherencePercentage}%</Text>
            <Text style={styles.heroLabel}>Adherence</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.taken }]}>{summary.takenCount}</Text>
              <Text style={styles.statLabel}>Taken</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.skipped }]}>{summary.skippedCount}</Text>
              <Text style={styles.statLabel}>Skipped</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.textSecondary }]}>
                {summary.pendingCount}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>

          <View style={styles.statsGridSecondary}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.snoozed }]}>
                {summary.snoozedCount}
              </Text>
              <Text style={styles.statLabel}>Snoozed</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.primaryDark }]}>
                {summary.totalScheduled}
              </Text>
              <Text style={styles.statLabel}>Scheduled</Text>
            </View>
          </View>

          {summary.formula ? (
            <Text style={styles.formulaNote}>{summary.formula}</Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  periodHint: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  periodLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  errorBlock: {
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    fontWeight: "600",
  },
  retryButton: {
    alignSelf: "stretch",
  },
  heroRow: {
    alignItems: "center",
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
  },
  heroValue: {
    ...typography.h1,
    color: colors.primaryDark,
    fontWeight: "800",
  },
  heroLabel: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "700",
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  statsGridSecondary: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.sm,
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
  formulaNote: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
