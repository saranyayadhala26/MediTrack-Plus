/**
 * DoseAlarmModal Component (Phase 10.2).
 * Provides a prominent, alarm-style modal for scheduled medication reminders.
 * Supports Take Now, Snooze 10m, and Skip Dose with reason selection.
 * Reuses existing backend activity APIs and local snooze scheduling.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { recordMedicationActivity } from "../../api/activities";
import { notificationService } from "../../services/notificationService";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";

const PREDEFINED_SKIP_REASONS = [
  "Forgot",
  "Feeling unwell",
  "Medicine unavailable",
  "Away from home",
  "Not required today",
  "Other",
];

export interface DoseAlarmData {
  scheduleId: string;
  medicineId: string;
  medicineName: string;
  dosage: string;
  dosageUnit?: string;
  scheduledTime: string;
  scheduledDate?: string;
  isSnooze?: boolean;
}

export interface DoseAlarmModalProps {
  visible: boolean;
  data: DoseAlarmData | null;
  onDismiss: () => void;
  onActivityRecorded?: (action: "Taken" | "Snoozed" | "Skipped") => void;
}

export const DoseAlarmModal: React.FC<DoseAlarmModalProps> = ({
  visible,
  data,
  onDismiss,
  onActivityRecorded,
}) => {
  const [isTaking, setIsTaking] = useState(false);
  const [isSnoozing, setIsSnoozing] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  // Skip reason state
  const [showSkipStep, setShowSkipStep] = useState(false);
  const [selectedSkipReason, setSelectedSkipReason] = useState<string>("");
  const [customSkipReason, setCustomSkipReason] = useState<string>("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!data) return null;

  const todayStr = data.scheduledDate || new Date().toISOString().split("T")[0];
  const dosageDisplay = `${data.dosage} ${data.dosageUnit || ""}`.trim();

  const resetState = () => {
    setIsTaking(false);
    setIsSnoozing(false);
    setIsSkipping(false);
    setShowSkipStep(false);
    setSelectedSkipReason("");
    setCustomSkipReason("");
    setFeedback(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetState();
    onDismiss();
  };

  const getValidScheduledTime = (): string => {
    if (data.scheduledTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.scheduledTime)) {
      return data.scheduledTime;
    }
    if (data.scheduledTime) {
      const parsed = new Date(data.scheduledTime);
      if (!isNaN(parsed.getTime())) {
        const hh = String(parsed.getHours()).padStart(2, "0");
        const mm = String(parsed.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }
    }
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const isTestAlert =
    data.medicineId === "test-med-001" || data.scheduleId === "test-sched-001";

  // 1. Take Now Action
  const handleTake = async () => {
    if (isTaking || isSnoozing || isSkipping) return;
    setIsTaking(true);
    setErrorMessage(null);

    if (isTestAlert) {
      setFeedback("Test alert: Take Now verified successfully!");
      setTimeout(() => {
        onActivityRecorded?.("Taken");
        handleClose();
      }, 700);
      return;
    }

    try {
      await recordMedicationActivity({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledDate: todayStr,
        scheduledTime: getValidScheduledTime(),
        action: "Taken",
      });
      setFeedback("Dose recorded as Taken!");
      setTimeout(() => {
        onActivityRecorded?.("Taken");
        handleClose();
      }, 700);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to record dose intake. Please try again.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
      setIsTaking(false);
    }
  };

  // 2. Snooze 10m Action
  const handleSnooze = async () => {
    if (isTaking || isSnoozing || isSkipping) return;
    setIsSnoozing(true);
    setErrorMessage(null);

    if (isTestAlert) {
      try {
        await notificationService.scheduleSnoozeReminder(
          data.medicineName,
          dosageDisplay,
          data.scheduleId,
          data.medicineId,
          10
        );
      } catch (notifErr) {
        console.warn("DoseAlarmModal: Could not schedule local snooze alert:", notifErr);
      }
      setFeedback("Test alert: Snoozed for 10 minutes!");
      setTimeout(() => {
        onActivityRecorded?.("Snoozed");
        handleClose();
      }, 700);
      return;
    }

    try {
      await recordMedicationActivity({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledDate: todayStr,
        scheduledTime: getValidScheduledTime(),
        action: "Snoozed",
      });

      // Schedule local hardware snooze alert in 10 minutes
      try {
        await notificationService.scheduleSnoozeReminder(
          data.medicineName,
          dosageDisplay,
          data.scheduleId,
          data.medicineId,
          10
        );
      } catch (notifErr) {
        console.warn("DoseAlarmModal: Could not schedule local snooze alert:", notifErr);
      }

      setFeedback("Reminder snoozed for 10 minutes.");
      setTimeout(() => {
        onActivityRecorded?.("Snoozed");
        handleClose();
      }, 700);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to snooze reminder.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
      setIsSnoozing(false);
    }
  };

  // 3. Skip Dose Action (Confirm)
  const handleConfirmSkip = async () => {
    let reason = selectedSkipReason;
    if (selectedSkipReason === "Other") {
      reason = customSkipReason.trim();
    }

    if (!reason.trim()) {
      setErrorMessage("Please select or specify a reason for skipping this dose.");
      return;
    }

    setIsSkipping(true);
    setErrorMessage(null);

    if (isTestAlert) {
      setFeedback(`Test alert: Skipped (${reason})!`);
      setTimeout(() => {
        onActivityRecorded?.("Skipped");
        handleClose();
      }, 700);
      return;
    }

    try {
      await recordMedicationActivity({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledDate: todayStr,
        scheduledTime: getValidScheduledTime(),
        action: "Skipped",
        skipReason: reason,
      });

      setFeedback(`Dose skipped (${reason}).`);
      setTimeout(() => {
        onActivityRecorded?.("Skipped");
        handleClose();
      }, 700);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to record skipped dose.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
      setIsSkipping(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {/* Header Banner */}
          <View
            style={[
              styles.headerBanner,
              data.isSnooze ? styles.snoozeBanner : styles.alarmBanner,
            ]}
          >
            <Text style={styles.headerIcon}>{data.isSnooze ? "⏰" : "💊"}</Text>
            <Text style={styles.headerTitle}>
              {data.isSnooze ? "SNOOZED MEDICATION ALARM" : "MEDICATION ALARM"}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
          >
            {/* Feedback Message */}
            {feedback ? (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackText}>✓ {feedback}</Text>
              </View>
            ) : null}

            {/* Error Message */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠ {errorMessage}</Text>
              </View>
            ) : null}

            {!showSkipStep ? (
              // Main Alarm View
              <View style={styles.mainView}>
                <Text style={styles.medicineName}>{data.medicineName}</Text>
                {dosageDisplay ? (
                  <View style={styles.dosageBadge}>
                    <Text style={styles.dosageText}>{dosageDisplay}</Text>
                  </View>
                ) : null}

                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Scheduled Time:</Text>
                  <Text style={styles.timeValue}>{getValidScheduledTime()}</Text>
                </View>

                <Text style={styles.promptText}>
                  It is time to take your prescribed dose. Please confirm your action below:
                </Text>

                {/* Primary Action: TAKE NOW */}
                <TouchableOpacity
                  style={[styles.actionButton, styles.takeButton]}
                  onPress={handleTake}
                  disabled={isTaking || isSnoozing || isSkipping || !!feedback}
                  accessibilityRole="button"
                  accessibilityLabel="Take Medication Now"
                >
                  {isTaking ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.takeButtonIcon}>✓</Text>
                      <Text style={styles.takeButtonText}>TAKE NOW</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Secondary Action: SNOOZE 10M */}
                <TouchableOpacity
                  style={[styles.actionButton, styles.snoozeButton]}
                  onPress={handleSnooze}
                  disabled={isTaking || isSnoozing || isSkipping || !!feedback}
                  accessibilityRole="button"
                  accessibilityLabel="Snooze reminder for 10 minutes"
                >
                  {isSnoozing ? (
                    <ActivityIndicator color="#92400E" />
                  ) : (
                    <>
                      <Text style={styles.snoozeButtonIcon}>⏰</Text>
                      <Text style={styles.snoozeButtonText}>SNOOZE 10 MIN</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Tertiary Action: SKIP DOSE */}
                <TouchableOpacity
                  style={[styles.actionButton, styles.skipButton]}
                  onPress={() => {
                    setErrorMessage(null);
                    setShowSkipStep(true);
                  }}
                  disabled={isTaking || isSnoozing || isSkipping || !!feedback}
                  accessibilityRole="button"
                  accessibilityLabel="Skip Dose"
                >
                  <Text style={styles.skipButtonIcon}>✕</Text>
                  <Text style={styles.skipButtonText}>SKIP DOSE</Text>
                </TouchableOpacity>

                {/* Dismiss Link */}
                <TouchableOpacity
                  style={styles.dismissLink}
                  onPress={handleClose}
                  disabled={isTaking || isSnoozing || isSkipping}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss Alarm"
                >
                  <Text style={styles.dismissLinkText}>Dismiss for now</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Skip Reason Selection View
              <View style={styles.skipStepView}>
                <Text style={styles.skipStepTitle}>Select Reason for Skipping</Text>
                <Text style={styles.skipStepSubtitle}>
                  Medical tracking requires a valid reason when skipping a scheduled dose:
                </Text>

                <View style={styles.reasonsList}>
                  {PREDEFINED_SKIP_REASONS.map((reason) => {
                    const isSelected = selectedSkipReason === reason;
                    return (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.reasonOption,
                          isSelected && styles.reasonOptionSelected,
                        ]}
                        onPress={() => {
                          setSelectedSkipReason(reason);
                          setErrorMessage(null);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <View style={styles.radioOuter}>
                          {isSelected ? <View style={styles.radioInner} /> : null}
                        </View>
                        <Text
                          style={[
                            styles.reasonText,
                            isSelected && styles.reasonTextSelected,
                          ]}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedSkipReason === "Other" ? (
                  <TextInput
                    style={styles.customInput}
                    placeholder="Enter specific reason..."
                    placeholderTextColor={colors.textMuted}
                    value={customSkipReason}
                    onChangeText={(txt) => {
                      setCustomSkipReason(txt);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    maxLength={150}
                  />
                ) : null}

                <View style={styles.skipActionsRow}>
                  <TouchableOpacity
                    style={styles.skipBackBtn}
                    onPress={() => {
                      setShowSkipStep(false);
                      setErrorMessage(null);
                    }}
                    disabled={isSkipping}
                  >
                    <Text style={styles.skipBackBtnText}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.skipConfirmBtn, isSkipping && styles.btnDisabled]}
                    onPress={handleConfirmSkip}
                    disabled={isSkipping}
                  >
                    {isSkipping ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.skipConfirmBtnText}>Confirm Skip</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  headerBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  alarmBanner: {
    backgroundColor: colors.primary,
  },
  snoozeBanner: {
    backgroundColor: colors.snoozed,
  },
  headerIcon: {
    fontSize: 22,
  },
  headerTitle: {
    ...typography.h3,
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  mainView: {
    alignItems: "center",
  },
  medicineName: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: "center",
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  dosageBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  dosageText: {
    ...typography.body,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timeLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  timeValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  promptText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  actionButton: {
    width: "100%",
    height: 54,
    borderRadius: borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    elevation: 2,
  },
  takeButton: {
    backgroundColor: colors.primary,
  },
  takeButtonIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  takeButtonText: {
    ...typography.h3,
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  snoozeButton: {
    backgroundColor: colors.snoozedLight,
    borderWidth: 1.5,
    borderColor: colors.snoozed,
  },
  snoozeButtonIcon: {
    fontSize: 18,
  },
  snoozeButtonText: {
    ...typography.body,
    color: colors.snoozed,
    fontWeight: "700",
  },
  skipButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  skipButtonIcon: {
    color: colors.error,
    fontSize: 16,
    fontWeight: "700",
  },
  skipButtonText: {
    ...typography.body,
    color: colors.error,
    fontWeight: "700",
  },
  dismissLink: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  dismissLinkText: {
    ...typography.small,
    color: colors.textMuted,
    textDecorationLine: "underline",
  },
  skipStepView: {
    width: "100%",
  },
  skipStepTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  skipStepSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  reasonsList: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  reasonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  reasonTextSelected: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  customInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  skipActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  skipBackBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  skipBackBtnText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  skipConfirmBtn: {
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  skipConfirmBtnText: {
    ...typography.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  feedbackBox: {
    backgroundColor: colors.takenLight,
    borderColor: colors.taken,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    width: "100%",
    alignItems: "center",
  },
  feedbackText: {
    ...typography.body,
    color: colors.taken,
    fontWeight: "700",
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    width: "100%",
  },
  errorText: {
    ...typography.small,
    color: colors.error,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
