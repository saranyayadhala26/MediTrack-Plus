/**
 * Notification Status & Settings Card (Phase 6).
 * Provides visibility into Android notification channel, system permissions,
 * active local reminders count, immediate test alerts, and schedule reconciliation.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getSchedules } from "../../api/schedules";
import { Button } from "../common/Button";
import { Card } from "../common/Card";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import {
  NotificationPermissionState,
  ReconciliationResult,
  notificationService,
} from "../../services/notificationService";

export const NotificationStatusCard: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);

  const refreshStatus = async () => {
    try {
      const perm = await notificationService.checkPermissions();
      setPermission(perm);
      const count = await notificationService.getScheduledRemindersCount();
      setScheduledCount(count);
    } catch (err) {
      console.warn("Error refreshing notification status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleRequestPermission = async () => {
    setIsLoading(true);
    try {
      const res = await notificationService.requestPermissions();
      setPermission(res);
      if (res.granted) {
        Alert.alert("Permission Granted", "Medication reminder alerts are now active.");
      } else {
        Alert.alert(
          "Permission Required",
          "Without notification permission, your device cannot sound alarms for prescribed medication intake times. Please enable notifications in device settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => notificationService.openSystemSettings() },
          ]
        );
      }
    } catch {
      Alert.alert("Error", "Could not request notification permissions.");
    } finally {
      setIsLoading(false);
      refreshStatus();
    }
  };

  const handleSendTestReminder = async () => {
    setIsSendingTest(true);
    try {
      await notificationService.sendTestReminder();
      Alert.alert(
        "Test Scheduled",
        "A test notification will trigger in 3 seconds. Lock your phone or leave the screen on to verify the sound and alert.",
        [{ text: "OK" }]
      );
      // Wait 4 seconds and refresh count
      setTimeout(() => {
        refreshStatus();
      }, 4000);
    } catch {
      Alert.alert("Error", "Failed to schedule test reminder.");
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      const schedulesRes = await getSchedules();
      const result: ReconciliationResult = await notificationService.reconcileAllSchedules(
        schedulesRes.items || []
      );
      Alert.alert(
        "Reminders Synchronized",
        `Sync complete:\n• Active Reminders: ${result.activeCount}\n• Newly Scheduled: ${result.scheduledCount}\n• Orphaned Cancelled: ${result.cancelledCount}`,
        [{ text: "OK" }]
      );
      setScheduledCount(result.activeCount);
    } catch {
      Alert.alert("Sync Error", "Failed to synchronize schedules with device notifications.");
    } finally {
      setIsReconciling(false);
      refreshStatus();
    }
  };

  const isGranted = permission?.granted;
  const statusLabel = isGranted
    ? "Enabled / Active"
    : permission?.status === "denied"
    ? "Permission Denied"
    : "Undetermined / Off";

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.cardTitle}>🔔 Medication Reminders & Alerts</Text>
          <Text style={styles.cardSubtitle}>
            Local device alarms via Android High-Importance channel
          </Text>
        </View>
        <TouchableOpacity
          onPress={refreshStatus}
          style={styles.refreshBadge}
          accessibilityLabel="Refresh reminder status"
        >
          <Text style={styles.refreshBadgeText}>↻</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Checking notification engine...</Text>
        </View>
      ) : (
        <>
          {/* Permission Status Indicator */}
          <View style={styles.statusRow}>
            <Text style={styles.label}>Permission Status:</Text>
            <View
              style={[
                styles.badge,
                isGranted ? styles.badgeSuccess : styles.badgeWarning,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  isGranted ? styles.badgeTextSuccess : styles.badgeTextWarning,
                ]}
              >
                ● {statusLabel}
              </Text>
            </View>
          </View>

          {/* Active Local Reminders Count */}
          <View style={styles.statusRow}>
            <Text style={styles.label}>Active Device Reminders:</Text>
            <Text style={styles.countValue}>{scheduledCount} scheduled</Text>
          </View>

          {/* Android Channel Info */}
          <View style={styles.statusRow}>
            <Text style={styles.label}>Android Channel:</Text>
            <Text style={styles.channelValue}>medication-reminders (High)</Text>
          </View>

          {/* In-app warning if permission is missing */}
          {!isGranted && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>⚠️ Action Needed for Alarms</Text>
              <Text style={styles.warningText}>
                Android requires notification permissions to sound intake alarms when the app is closed.
              </Text>
              <View style={styles.warningActionRow}>
                <Button
                  title="Enable Notifications"
                  onPress={handleRequestPermission}
                  variant="primary"
                  style={styles.warningButton}
                />
                <Button
                  title="Open Settings"
                  onPress={() => notificationService.openSystemSettings()}
                  variant="outline"
                  style={styles.warningButton}
                />
              </View>
            </View>
          )}

          {/* Action Buttons: Test Reminder & Sync */}
          <View style={styles.actionButtonRow}>
            <Button
              title={isSendingTest ? "Scheduling..." : "Test Alert (3s)"}
              onPress={handleSendTestReminder}
              variant="outline"
              loading={isSendingTest}
              style={styles.actionButton}
            />
            <Button
              title={isReconciling ? "Syncing..." : "Sync Reminders"}
              onPress={handleReconcile}
              variant="secondary"
              loading={isReconciling}
              style={styles.actionButton}
            />
          </View>

          {/* Medical Safety Disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerText}>
              <Text style={styles.disclaimerBold}>Medical Disclaimer: </Text>
              MediTrack+ reminders are designed to assist adherence but should not be solely
              relied upon for critical medical timing or emergency treatments.
            </Text>
          </View>
        </>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  refreshBadge: {
    backgroundColor: colors.surfaceSubtle,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  refreshBadgeText: {
    fontSize: 18,
    color: colors.primaryDark,
    fontWeight: "bold",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  countValue: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  channelValue: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textMuted,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeSuccess: {
    backgroundColor: colors.takenLight,
  },
  badgeWarning: {
    backgroundColor: colors.snoozedLight,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: "700",
  },
  badgeTextSuccess: {
    color: colors.taken,
  },
  badgeTextWarning: {
    color: colors.warning,
  },
  warningBox: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  warningTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: "#B45309",
    marginBottom: 4,
  },
  warningText: {
    ...typography.small,
    color: "#78350F",
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  warningActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  warningButton: {
    flex: 1,
    minHeight: 38,
  },
  actionButtonRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  disclaimerContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 16,
    fontStyle: "italic",
  },
  disclaimerBold: {
    fontWeight: "700",
    fontStyle: "normal",
  },
});
