/**
 * Change Password Modal Component (Phase 10.1).
 * Provides client-side validation, secure inputs with visibility toggles,
 * server error handling (401 incorrect current password), and success feedback.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errors, setErrors] = useState<{
    current?: string;
    new?: string;
    confirm?: string;
    general?: string;
  }>({});

  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrors({});
    setSuccessMessage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validate = (): boolean => {
    const errs: { current?: string; new?: string; confirm?: string; general?: string } = {};

    if (!currentPassword.trim()) {
      errs.current = "Current password is required.";
    }

    if (!newPassword.trim()) {
      errs.new = "New password is required.";
    } else if (newPassword.length < 6) {
      errs.new = "New password must be at least 6 characters.";
    } else if (newPassword === currentPassword) {
      errs.new = "New password cannot be the same as your current password.";
    }

    if (!confirmNewPassword.trim()) {
      errs.confirm = "Please confirm your new password.";
    } else if (confirmNewPassword !== newPassword) {
      errs.confirm = "Passwords do not match.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setErrors({});
    setSuccessMessage(null);

    if (!validate()) return;

    setIsLoading(true);
    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
        confirmNewPassword,
      });

      if (result.success) {
        setSuccessMessage("Password changed successfully!");
        setTimeout(() => {
          handleClose();
          onSuccess?.();
        }, 1200);
      } else {
        setErrors({ general: result.error || "Failed to change password." });
      }
    } catch (err: any) {
      setErrors({ general: err.message || "An unexpected error occurred." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Modal Title */}
          <Text style={styles.title}>🔒 Change Password</Text>
          <Text style={styles.subtitle}>
            Enter your current password and choose a secure new password.
          </Text>

          {/* Success Banner */}
          {successMessage && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✓ {successMessage}</Text>
            </View>
          )}

          {/* General Error Banner */}
          {errors.general && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errors.general}</Text>
            </View>
          )}

          {/* Current Password */}
          <View style={styles.inputWrapper}>
            <Input
              label="Current Password"
              placeholder="Enter current password"
              secureTextEntry={!showCurrent}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              error={errors.current}
              autoCapitalize="none"
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowCurrent(!showCurrent)}
              accessibilityLabel={showCurrent ? "Hide password" : "Show password"}
            >
              <Text style={styles.eyeText}>{showCurrent ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          {/* New Password */}
          <View style={styles.inputWrapper}>
            <Input
              label="New Password"
              placeholder="At least 6 characters"
              secureTextEntry={!showNew}
              value={newPassword}
              onChangeText={setNewPassword}
              error={errors.new}
              autoCapitalize="none"
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNew(!showNew)}
              accessibilityLabel={showNew ? "Hide password" : "Show password"}
            >
              <Text style={styles.eyeText}>{showNew ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          {/* Confirm New Password */}
          <View style={styles.inputWrapper}>
            <Input
              label="Confirm New Password"
              placeholder="Re-enter new password"
              secureTextEntry={!showConfirm}
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              error={errors.confirm}
              autoCapitalize="none"
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirm(!showConfirm)}
              accessibilityLabel={showConfirm ? "Hide password" : "Show password"}
            >
              <Text style={styles.eyeText}>{showConfirm ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Button
              title="Cancel"
              onPress={handleClose}
              variant="outline"
              disabled={isLoading}
              style={styles.cancelButton}
            />
            <Button
              title={isLoading ? "Updating..." : "Update Password"}
              onPress={handleSubmit}
              variant="primary"
              loading={isLoading}
              disabled={isLoading || !!successMessage}
              style={styles.submitButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  container: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  inputWrapper: {
    position: "relative",
  },
  eyeButton: {
    position: "absolute",
    right: spacing.md,
    top: 36,
    padding: spacing.xs,
    zIndex: 10,
  },
  eyeText: {
    fontSize: 18,
  },
  successBox: {
    backgroundColor: colors.takenLight,
    borderWidth: 1,
    borderColor: colors.taken,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.taken,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.error,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
  },
  submitButton: {
    flex: 1.5,
  },
});
