/**
 * Patient Monitoring Detail Screen (Phase 9.2.7).
 * Displays read-only adherence statistics, today's medication intake counts,
 * streak metrics, and recent missed-dose alerts for a selected linked patient.
 * Strictly read-only: no mutation controls or schedule modifications.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getPatientSummary } from "../../api/caregivers";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { LoadingState } from "../../components/common/LoadingState";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { CaregiverMonitoringSummary } from "../../types";

interface PatientMonitoringDetailScreenProps {
  patientId: string;
  patientName: string;
  relationship: string;
  onBack: () => void;
  onViewAlerts: () => void;
}

export const PatientMonitoringDetailScreen: React.FC<PatientMonitoringDetailScreenProps> = ({
  patientId,
  patientName,
  relationship,
  onBack,
  onViewAlerts,
}) => {
  const [summary, setSummary] = useState<CaregiverMonitoringSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRevoked, setIsRevoked] = useState<boolean>(false);

  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      setIsRevoked(false);
      const data = await getPatientSummary(patientId);
      setSummary(data);
    } catch (err: any) {
      console.error("[PatientMonitoringDetail] Error fetching summary:", err);
      if (err?.response?.status === 403) {
        setIsRevoked(true);
        setError(
          "Access Revoked: You do not have an active caregiver relationship with this patient, or access was revoked."
        );
      } else {
        const msg =
          err?.response?.data?.detail ||
          "Unable to load patient adherence summary. Please try again.";
        setError(msg);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSummary();
  };

  const formatTimestamp = (isoString?: string): string => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return (
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }) +
        " at " +
        d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    } catch {
      return isoString;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel="Back to patients list"
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>Read-Only</Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.patientAvatar}>
            <Text style={styles.patientAvatarText}>
              {patientName ? patientName.charAt(0).toUpperCase() : "P"}
            </Text>
          </View>
          <View style={styles.patientInfo}>
            <Text style={styles.headerPatientName} numberOfLines={1}>
              {summary?.patientName || patientName}
            </Text>
            <View style={styles.relationshipRow}>
              <Text style={styles.relationshipLabel}>Relationship:</Text>
              <Text style={styles.relationshipValue}>{relationship}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
      >
        {/* Prominent Read-Only Notice */}
        <View style={styles.readOnlyNotice}>
          <Text style={styles.readOnlyNoticeIcon}>🛡️</Text>
          <Text style={styles.readOnlyNoticeText}>
            Read-Only Access: Prescription and schedule modifications are strictly
            prohibited for caregiver accounts.
          </Text>
        </View>

        {isLoading && !isRefreshing ? (
          <View style={styles.loadingContainer}>
            <LoadingState message="Evaluating patient adherence..." />
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              {isRevoked ? "Access Not Authorized" : "Error Loading Data"}
            </Text>
            <Text style={styles.errorText}>{error}</Text>
            {isRevoked ? (
              <Button
                title="Return to Dashboard"
                onPress={onBack}
                variant="primary"
                style={styles.actionBtn}
              />
            ) : (
              <Button
                title="Retry"
                onPress={fetchSummary}
                variant="outline"
                style={styles.actionBtn}
              />
            )}
          </Card>
        ) : summary ? (
          <>
            {/* Adherence Percentage Card */}
            <Card style={styles.adherenceCard}>
              <Text style={styles.cardHeaderTitle}>Adherence Overview</Text>
              <View style={styles.adherenceScoreRow}>
                <View style={styles.scoreContainer}>
                  <Text style={styles.scoreValue}>
                    {summary.adherencePercentage.toFixed(1)}%
                  </Text>
                  <Text style={styles.scoreLabel}>Adherence Rate</Text>
                </View>

                {/* Streak Indicators */}
                <View style={styles.streaksContainer}>
                  <View style={styles.streakItem}>
                    <Text style={styles.streakIcon}>🔥</Text>
                    <View>
                      <Text style={styles.streakValue}>
                        {summary.currentStreak ?? 0} {summary.currentStreak === 1 ? "day" : "days"}
                      </Text>
                      <Text style={styles.streakLabel}>Current Streak</Text>
                    </View>
                  </View>

                  <View style={styles.streakItem}>
                    <Text style={styles.streakIcon}>🏆</Text>
                    <View>
                      <Text style={styles.streakValue}>
                        {summary.longestStreak ?? 0} {summary.longestStreak === 1 ? "day" : "days"}
                      </Text>
                      <Text style={styles.streakLabel}>Longest Streak</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Card>

            {/* Today's Intake Status Grid */}
            <Card style={styles.todayCard}>
              <Text style={styles.cardHeaderTitle}>Today's Medication Intake</Text>
              <Text style={styles.cardSubTitle}>
                Real-time status for today's scheduled doses
              </Text>

              <View style={styles.metricsGrid}>
                {/* Total Scheduled */}
                <View style={[styles.metricTile, styles.scheduledTile]}>
                  <Text style={styles.metricNumber}>
                    {summary.totalScheduledToday}
                  </Text>
                  <Text style={styles.metricLabel}>Scheduled</Text>
                </View>

                {/* Taken */}
                <View style={[styles.metricTile, styles.takenTile]}>
                  <Text style={[styles.metricNumber, { color: "#166534" }]}>
                    {summary.takenToday}
                  </Text>
                  <Text style={[styles.metricLabel, { color: "#166534" }]}>
                    Taken
                  </Text>
                </View>

                {/* Skipped */}
                <View style={[styles.metricTile, styles.skippedTile]}>
                  <Text style={[styles.metricNumber, { color: "#9A3412" }]}>
                    {summary.skippedToday}
                  </Text>
                  <Text style={[styles.metricLabel, { color: "#9A3412" }]}>
                    Skipped
                  </Text>
                </View>

                {/* Missed */}
                <View style={[styles.metricTile, styles.missedTile]}>
                  <Text style={[styles.metricNumber, { color: colors.error }]}>
                    {summary.missedToday}
                  </Text>
                  <Text style={[styles.metricLabel, { color: colors.error }]}>
                    Missed
                  </Text>
                </View>
              </View>
            </Card>

            {/* Recent Caregiver Alerts for this Patient */}
            <Card style={styles.alertsCard}>
              <View style={styles.alertsCardHeader}>
                <Text style={styles.cardHeaderTitle}>Recent Alerts</Text>
                {summary.recentAlerts.length > 0 && (
                  <TouchableOpacity onPress={onViewAlerts}>
                    <Text style={styles.viewAllText}>View All →</Text>
                  </TouchableOpacity>
                )}
              </View>

              {summary.recentAlerts.length === 0 ? (
                <View style={styles.noAlertsBox}>
                  <Text style={styles.noAlertsIcon}>✅</Text>
                  <Text style={styles.noAlertsText}>
                    No missed-dose alerts recorded for this patient.
                  </Text>
                </View>
              ) : (
                <View style={styles.recentAlertsList}>
                  {summary.recentAlerts.map((alert, index) => (
                    <View key={index} style={styles.alertItem}>
                      <View style={styles.alertItemHeader}>
                        <Text style={styles.alertMedName}>
                          💊 {alert.medicineName}
                        </Text>
                        <Text style={styles.alertTime}>
                          {formatTimestamp(alert.timestamp)}
                        </Text>
                      </View>
                      <Text style={styles.alertMessage}>
                        {alert.alertMessage}
                      </Text>
                      {alert.scheduledTimes?.length > 0 && (
                        <Text style={styles.alertScheduleTimes}>
                          Scheduled: {alert.scheduledTimes.join(", ")}
                        </Text>
                      )}
                    </View>
                  ))}
                  <Button
                    title="View All Caregiver Alerts"
                    onPress={onViewAlerts}
                    variant="outline"
                    style={styles.viewAllAlertsBtn}
                  />
                </View>
              )}
            </Card>

            {/* Medical Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
              <Text style={styles.disclaimerText}>
                {summary.medical_disclaimer || config.medicalDisclaimer}
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop:
      Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + spacing.md
        : spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: borderRadius.md,
    minHeight: 40,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.surface,
  },
  headerBadge: {
    backgroundColor: colors.surface,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  headerBadgeText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  patientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  patientAvatarText: {
    ...typography.h2,
    color: colors.primary,
    fontWeight: "700",
  },
  patientInfo: {
    flex: 1,
  },
  headerPatientName: {
    ...typography.h2,
    color: colors.surface,
    fontWeight: "700",
  },
  relationshipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  relationshipLabel: {
    ...typography.caption,
    color: colors.primaryLight,
  },
  relationshipValue: {
    ...typography.caption,
    color: colors.surface,
    fontWeight: "600",
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  readOnlyNotice: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  readOnlyNoticeIcon: {
    fontSize: 16,
  },
  readOnlyNoticeText: {
    ...typography.caption,
    color: "#166534",
    fontWeight: "600",
    flex: 1,
  },
  loadingContainer: {
    paddingVertical: spacing.xxl,
  },
  errorCard: {
    padding: spacing.lg,
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderColor: colors.error,
    borderWidth: 1,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  actionBtn: {
    minWidth: 140,
  },
  adherenceCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  cardSubTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  adherenceScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  scoreContainer: {
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    minWidth: 120,
  },
  scoreValue: {
    ...typography.h1,
    color: colors.primaryDark,
    fontWeight: "800",
  },
  scoreLabel: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "600",
    marginTop: 2,
  },
  streaksContainer: {
    flex: 1,
    marginLeft: spacing.md,
    gap: spacing.sm,
  },
  streakItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.xs,
  },
  streakIcon: {
    fontSize: 20,
  },
  streakValue: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  streakLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  todayCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  metricTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  scheduledTile: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  takenTile: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  skippedTile: {
    backgroundColor: "#FFEDD5",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  missedTile: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  metricNumber: {
    ...typography.h2,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  metricLabel: {
    ...typography.caption,
    fontWeight: "600",
    marginTop: 2,
    color: colors.textSecondary,
  },
  alertsCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  alertsCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  viewAllText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  noAlertsBox: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  noAlertsIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  noAlertsText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  recentAlertsList: {
    gap: spacing.sm,
  },
  alertItem: {
    backgroundColor: "#FEF2F2",
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  alertItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  alertMedName: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  alertTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  alertMessage: {
    ...typography.body,
    fontSize: 13,
    color: colors.error,
    lineHeight: 18,
  },
  alertScheduleTimes: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  viewAllAlertsBtn: {
    marginTop: spacing.xs,
  },
  disclaimerBox: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  disclaimerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
