/**
 * Dose Action Card Component (Phase 7).
 * Provides one-tap intake recording (Take Medication, Snooze 10m, Skip with reason),
 * real-time occurrence status badges, and duplicate-tap protection.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DoseActionModal } from "./DoseActionModal";
import { recordMedicationActivity } from "../../api/activities";
import { Card } from "../common/Card";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { notificationService } from "../../services/notificationService";
import { MedicationActivity, MedicationSchedule, Medicine } from "../../types";

interface DoseActionCardProps {
  medicine: Medicine;
  schedule: MedicationSchedule;
  existingActivity?: MedicationActivity | null;
  onActivityRecorded?: (activity: MedicationActivity) => void;
  disabled?: boolean;
}

export const DoseActionCard: React.FC<DoseActionCardProps> = ({
  medicine,
  schedule,
  existingActivity,
  onActivityRecorded,
  disabled = false,
}) => {
  const [currentActivity, setCurrentActivity] = useState<MedicationActivity | null>(
    existingActivity || null
  );
  const [isTaking, setIsTaking] = useState<boolean>(false);
  const [isSnoozing, setIsSnoozing] = useState<boolean>(false);
  const [showSkipModal, setShowSkipModal] = useState<boolean>(false);
  const [isSkipping, setIsSkipping] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    if (existingActivity !== undefined) {
      setCurrentActivity(existingActivity);
    }
  }, [existingActivity]);

  const todayStr = new Date().toISOString().split("T")[0];

  const handleTake = async () => {
    if (isTaking || disabled || currentActivity?.action === "Taken") return;

    setIsTaking(true);
    setActionFeedback(null);
    try {
      const act = await recordMedicationActivity({
        medicineId: medicine.id,
        scheduleId: schedule.id,
        scheduledDate: todayStr,
        scheduledTime: schedule.time,
        action: "Taken",
      });
      setCurrentActivity(act);
      onActivityRecorded?.(act);
      setActionFeedback("Dose recorded as Taken!");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to record dose. Please try again.";
      Alert.alert("Error", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsTaking(false);
    }
  };

  const handleSnooze = async () => {
    if (isSnoozing || disabled || currentActivity?.action === "Taken") return;

    setIsSnoozing(true);
    setActionFeedback(null);
    try {
      const act = await recordMedicationActivity({
        medicineId: medicine.id,
        scheduleId: schedule.id,
        scheduledDate: todayStr,
        scheduledTime: schedule.time,
        action: "Snoozed",
      });

      // Schedule local reminder in 10 minutes
      try {
        await notificationService.scheduleSnoozeReminder(
          medicine.name,
          `${medicine.dosage} ${medicine.dosageUnit}`,
          schedule.id,
          medicine.id,
          10
        );
      } catch (notifErr) {
        console.warn("Could not schedule local snooze alert:", notifErr);
      }

      setCurrentActivity(act);
      onActivityRecorded?.(act);
      setActionFeedback("Reminder snoozed for 10 minutes.");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to snooze reminder.";
      Alert.alert("Error", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsSnoozing(false);
    }
  };

  const handleConfirmSkip = async (reason: string) => {
    setIsSkipping(true);
    setActionFeedback(null);
    try {
      const act = await recordMedicationActivity({
        medicineId: medicine.id,
        scheduleId: schedule.id,
        scheduledDate: todayStr,
        scheduledTime: schedule.time,
        action: "Skipped",
        skipReason: reason,
      });
      setCurrentActivity(act);
      onActivityRecorded?.(act);
      setShowSkipModal(false);
      setActionFeedback(`Dose skipped (${reason}).`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to record skip action.";
      Alert.alert("Error", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsSkipping(false);
    }
  };

  const isTaken = currentActivity?.action === "Taken";
  const isSkipped = currentActivity?.action === "Skipped";
  const isSnoozed = currentActivity?.action === "Snoozed";

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.timeInfo}>
          <Text style={styles.timeLabel}>⏰ {schedule.time}</Text>
          <Text style={styles.dosageLabel}>
            {medicine.dosage} {medicine.dosageUnit}
          </Text>
        </View>

        {/* Status Badge */}
        {isTaken && (
          <View style={[styles.badge, styles.takenBadge]}>
            <Text style={styles.takenBadgeText}>
              ✓ Taken {currentActivity?.wasSnoozed ? "(Snoozed)" : ""}
            </Text>
          </View>
        )}
        {isSkipped && (
          <View style={[styles.badge, styles.skippedBadge]}>
            <Text style={styles.skippedBadgeText}>✕ Skipped</Text>
          </View>
        )}
        {isSnoozed && (
          <View style={[styles.badge, styles.snoozedBadge]}>
            <Text style={styles.snoozedBadgeText}>
              ⏳ Snoozed {currentActivity?.snoozeCount ? `(${currentActivity.snoozeCount})` : ""}
            </Text>
          </View>
        )}
        {!isTaken && !isSkipped && !isSnoozed && (
          <View style={[styles.badge, styles.pendingBadge]}>
            <Text style={styles.pendingBadgeText}>Due Today</Text>
          </View>
        )}
      </View>

      {/* Action feedback message */}
      {actionFeedback ? (
        <View style={styles.feedbackBanner}>
          <Text style={styles.feedbackText}>{actionFeedback}</Text>
        </View>
      ) : null}

      {/* Skip reason display */}
      {isSkipped && currentActivity?.skipReason ? (
        <View style={styles.skipReasonBox}>
          <Text style={styles.skipReasonText}>
            Reason: {currentActivity.skipReason}
          </Text>
        </View>
      ) : null}

      {/* Action Buttons */}
      {isSkipped ? (
        <View style={styles.skippedActionsRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.takeButton,
              (isTaking || disabled) && styles.buttonDisabled,
            ]}
            onPress={handleTake}
            disabled={isTaking || disabled}
            accessibilityRole="button"
            accessibilityLabel={`Take dose anyway for ${schedule.time}`}
          >
            {isTaking ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.takeButtonText}>✓ Take Medication Anyway</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : !isTaken ? (
        <View style={styles.actionsRow}>
          {/* Take Medication Button */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.takeButton,
              (isTaking || disabled) && styles.buttonDisabled,
            ]}
            onPress={handleTake}
            disabled={isTaking || disabled}
            accessibilityRole="button"
            accessibilityLabel={`Take dose for ${schedule.time}`}
          >
            {isTaking ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.takeButtonText}>✓ Take Medication</Text>
            )}
          </TouchableOpacity>

          {/* Snooze Button */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.snoozeButton,
              (isSnoozing || disabled) && styles.buttonDisabled,
            ]}
            onPress={handleSnooze}
            disabled={isSnoozing || disabled}
            accessibilityRole="button"
            accessibilityLabel={`Snooze dose for ${schedule.time}`}
          >
            {isSnoozing ? (
              <ActivityIndicator color={colors.primaryDark} size="small" />
            ) : (
              <Text style={styles.snoozeButtonText}>⏰ Snooze (10m)</Text>
            )}
          </TouchableOpacity>

          {/* Skip Button */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.skipButton,
              disabled && styles.buttonDisabled,
            ]}
            onPress={() => setShowSkipModal(true)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Skip dose for ${schedule.time}`}
          >
            <Text style={styles.skipButtonText}>✕ Skip</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.completedBox}>
          <Text style={styles.completedText}>
            Intake logged at{" "}
            {new Date(currentActivity.actionTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      )}

      {/* Skip Reason Modal */}
      <DoseActionModal
        visible={showSkipModal}
        medicineName={medicine.name}
        dosage={`${medicine.dosage} ${medicine.dosageUnit}`}
        scheduledTime={schedule.time}
        onCancel={() => setShowSkipModal(false)}
        onConfirmSkip={handleConfirmSkip}
        isSubmitting={isSkipping}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  timeInfo: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  timeLabel: {
    ...typography.h3,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  dosageLabel: {
    ...typography.caption,
    color: colors.textSecondary,
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
  pendingBadge: {
    backgroundColor: colors.surfaceSubtle,
  },
  pendingBadgeText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: "600",
  },
  feedbackBanner: {
    backgroundColor: colors.primaryLight,
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  feedbackText: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: "600",
    textAlign: "center",
  },
  skipReasonBox: {
    backgroundColor: colors.skippedLight,
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  skipReasonText: {
    ...typography.small,
    color: colors.skipped,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  skippedActionsRow: {
    marginTop: spacing.xs,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  takeButton: {
    backgroundColor: colors.primary,
    flex: 1.3,
  },
  takeButtonText: {
    ...typography.small,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  snoozeButton: {
    backgroundColor: colors.snoozedLight,
    borderWidth: 1,
    borderColor: colors.snoozed,
    flex: 1.1,
  },
  snoozeButtonText: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: "600",
  },
  skipButton: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.error,
    flex: 0.8,
  },
  skipButtonText: {
    ...typography.small,
    color: colors.error,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completedBox: {
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  completedText: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
