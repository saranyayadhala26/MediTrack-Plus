/**
 * Modal dialog for selecting or entering a mandatory skip reason when skipping a medication dose.
 */

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "../common/Button";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";

const PREDEFINED_REASONS = [
  "Forgot",
  "Feeling unwell",
  "Medicine unavailable",
  "Away from home",
  "Not required today",
  "Other",
];

interface DoseActionModalProps {
  visible: boolean;
  medicineName: string;
  dosage: string;
  scheduledTime: string;
  onCancel: () => void;
  onConfirmSkip: (reason: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const DoseActionModal: React.FC<DoseActionModalProps> = ({
  visible,
  medicineName,
  dosage,
  scheduledTime,
  onCancel,
  onConfirmSkip,
  isSubmitting = false,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [customReason, setCustomReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (reason: string) => {
    setSelectedReason(reason);
    if (error) setError(null);
  };

  const handleSubmit = async () => {
    let finalReason = selectedReason;
    if (selectedReason === "Other") {
      finalReason = customReason.trim();
    }

    if (!finalReason.trim()) {
      setError("Please select or enter a reason for skipping this dose.");
      return;
    }

    setError(null);
    await onConfirmSkip(finalReason);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.modalContent}>
          {/* Header */}
          <Text style={styles.title}>Skip Medication Dose</Text>
          <Text style={styles.subtitle}>
            {medicineName} ({dosage}) • Scheduled: {scheduledTime}
          </Text>

          <Text style={styles.instruction}>
            Medical records require a valid reason for skipping prescribed intake:
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Predefined Reasons */}
          <View style={styles.reasonsList}>
            {PREDEFINED_REASONS.map((r) => {
              const isSelected = selectedReason === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonOption, isSelected && styles.reasonOptionSelected]}
                  onPress={() => handleSelect(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reason: ${r}`}
                >
                  <Text
                    style={[
                      styles.reasonOptionText,
                      isSelected && styles.reasonOptionTextSelected,
                    ]}
                  >
                    {isSelected ? "● " : "○ "}
                    {r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom Reason Input if 'Other' is chosen */}
          {selectedReason === "Other" && (
            <TextInput
              style={styles.input}
              placeholder="Specify the reason..."
              placeholderTextColor={colors.textMuted}
              value={customReason}
              onChangeText={(text) => {
                setCustomReason(text);
                if (error) setError(null);
              }}
              multiline
              numberOfLines={2}
            />
          )}

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={onCancel}
              disabled={isSubmitting}
              style={styles.button}
            />
            <Button
              title="Confirm Skip"
              variant="danger"
              onPress={handleSubmit}
              loading={isSubmitting}
              style={styles.button}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  instruction: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  errorBox: {
    backgroundColor: colors.skippedLight,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorText: {
    ...typography.small,
    color: colors.error,
    fontWeight: "600",
  },
  reasonsList: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  reasonOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  reasonOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  reasonOptionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  reasonOptionTextSelected: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.md,
    minHeight: 56,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  button: {
    flex: 1,
  },
});
