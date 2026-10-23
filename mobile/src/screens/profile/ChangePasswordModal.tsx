/**
 * Change Password Sub-View Component for MediTrack+
 * Redesigned to match Page 17 of ui.pdf.
 *
 * Visual Structure:
 * 1. Screen Header: Back arrow (←), Title "Change Password",
 *    Subtitle "Update your password to keep your account secure."
 * 2. Security Information Card: Teal rounded banner with lock icon,
 *    "Choose a strong password", "Choose a strong password you don't use elsewhere."
 * 3. Current Password Field: Secure input with lock icon and eye toggle.
 * 4. New Password Field: Secure input with lock icon and eye toggle.
 *    - 4-segment horizontal strength bar indicator.
 *    - Strength rating text ("Weak", "Medium", "Strong").
 *    - Helper text: "Use at least 8 characters."
 * 5. Confirm New Password Field: Secure input with lock icon and eye toggle.
 *    - "Passwords match." green checkmark status badge when matching.
 * 6. Action Button: Full-width primary teal button "Change Password".
 *
 * Preserves 100% of underlying client validation rules (minimum 6 chars),
 * API integration (PATCH /api/v1/auth/change-password), 401 error handling,
 * loading states, and success callbacks.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InlineError, InlineSuccess } from "../../components/common";

export interface ChangePasswordModalProps {
  onBack: () => void;
  onSuccess?: () => void;
  // Optional backwards compatibility props
  visible?: boolean;
  onClose?: () => void;
}

/**
 * UI-only password strength evaluation for Page 17 visual indicator.
 * Does NOT alter client validation rules.
 */
const getPasswordStrength = (
  pwd: string
): { score: number; label: string; color: string } => {
  if (!pwd) return { score: 0, label: "", color: "#E2E8F0" };
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 8) score++;
  if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && pwd.length >= 8) score++;

  if (score <= 1) return { score: 1, label: "Weak", color: "#DC2626" };
  if (score === 2) return { score: 2, label: "Medium", color: "#D97706" };
  if (score === 3) return { score: 3, label: "Medium", color: "#0D9488" };
  return { score: 4, label: "Strong", color: "#16A34A" };
};

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  onBack,
  onSuccess,
  onClose,
}) => {
  const { changePassword } = useAuth();

  // Safe area insets handling (guarantees header begins below system status bar)
  let insetsTop = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
  } catch {
    insetsTop = 0;
  }
  const statusBarHeight = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

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

  const handleBack = () => {
    resetForm();
    if (onBack) {
      onBack();
    } else if (onClose) {
      onClose();
    }
  };

  const validate = (): boolean => {
    const errs: {
      current?: string;
      new?: string;
      confirm?: string;
      general?: string;
    } = {};

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
          resetForm();
          onSuccess?.();
          if (onBack) onBack();
          else if (onClose) onClose();
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

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch =
    confirmNewPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmNewPassword === newPassword;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header Bar (Page 17) */}
      <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.screenTitle}>Change Password</Text>
          <Text style={styles.screenSubtitle}>
            Update your password to keep your account secure.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Feedback Banners */}
          {successMessage ? (
            <InlineSuccess
              variant="custom"
              title={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}

          {errors.general ? (
            <InlineError
              title={errors.general}
              onDismiss={() => setErrors((prev) => ({ ...prev, general: "" }))}
            />
          ) : null}

          {/* Security Information Card (Page 17) */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="lock-closed" size={20} color="#0D9488" />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoCardTitle}>Choose a strong password</Text>
              <Text style={styles.infoCardSubtitle}>
                Choose a strong password you don't use elsewhere.
              </Text>
            </View>
          </View>

          {/* 1. Current Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Current Password</Text>
            <View
              style={[
                styles.inputContainer,
                errors.current ? styles.inputContainerError : null,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="#94A3B8"
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={styles.textInput}
                secureTextEntry={!showCurrent}
                value={currentPassword}
                onChangeText={(val) => {
                  setCurrentPassword(val);
                  if (errors.current)
                    setErrors((prev) => ({ ...prev, current: undefined }));
                }}
                placeholder="••••••••••••"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowCurrent(!showCurrent)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={
                  showCurrent ? "Hide current password" : "Show current password"
                }
              >
                <Ionicons
                  name={showCurrent ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>
            {errors.current ? (
              <Text style={styles.fieldErrorText}>{errors.current}</Text>
            ) : null}
          </View>

          {/* 2. New Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>New Password</Text>
            <View
              style={[
                styles.inputContainer,
                errors.new ? styles.inputContainerError : null,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="#94A3B8"
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={styles.textInput}
                secureTextEntry={!showNew}
                value={newPassword}
                onChangeText={(val) => {
                  setNewPassword(val);
                  if (errors.new)
                    setErrors((prev) => ({ ...prev, new: undefined }));
                }}
                placeholder="••••••••••••"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNew(!showNew)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={
                  showNew ? "Hide new password" : "Show new password"
                }
              >
                <Ionicons
                  name={showNew ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            {/* 4-segment visual strength indicator (Page 17) */}
            <View style={styles.strengthRow}>
              <View style={styles.strengthBarsRow}>
                <View
                  style={[
                    styles.strengthBarSegment,
                    strength.score >= 1
                      ? { backgroundColor: strength.color }
                      : styles.strengthBarEmpty,
                  ]}
                />
                <View
                  style={[
                    styles.strengthBarSegment,
                    strength.score >= 2
                      ? { backgroundColor: strength.color }
                      : styles.strengthBarEmpty,
                  ]}
                />
                <View
                  style={[
                    styles.strengthBarSegment,
                    strength.score >= 3
                      ? { backgroundColor: strength.color }
                      : styles.strengthBarEmpty,
                  ]}
                />
                <View
                  style={[
                    styles.strengthBarSegment,
                    strength.score >= 4
                      ? { backgroundColor: strength.color }
                      : styles.strengthBarEmpty,
                  ]}
                />
              </View>
              {newPassword.length > 0 ? (
                <Text
                  style={[styles.strengthLabel, { color: strength.color }]}
                >
                  {strength.label}
                </Text>
              ) : null}
            </View>

            {/* Helper text matching reference visual */}
            <Text style={styles.helperText}>Use at least 8 characters.</Text>

            {errors.new ? (
              <Text style={styles.fieldErrorText}>{errors.new}</Text>
            ) : null}
          </View>

          {/* 3. Confirm New Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Confirm New Password</Text>
            <View
              style={[
                styles.inputContainer,
                errors.confirm ? styles.inputContainerError : null,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="#94A3B8"
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={styles.textInput}
                secureTextEntry={!showConfirm}
                value={confirmNewPassword}
                onChangeText={(val) => {
                  setConfirmNewPassword(val);
                  if (errors.confirm)
                    setErrors((prev) => ({ ...prev, confirm: undefined }));
                }}
                placeholder="••••••••••••"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirm(!showConfirm)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={
                  showConfirm
                    ? "Hide confirm password"
                    : "Show confirm password"
                }
              >
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            {/* Passwords Match Success Indicator (Page 17) */}
            {passwordsMatch && (
              <View style={styles.matchIndicator}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color="#16A34A"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.matchText}>Passwords match.</Text>
              </View>
            )}

            {errors.confirm ? (
              <Text style={styles.fieldErrorText}>{errors.confirm}</Text>
            ) : null}
          </View>

          {/* Action Button: Change Password */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (isLoading || !!successMessage) && styles.btnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isLoading || !!successMessage}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Change Password"
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const ChangePasswordView = ChangePasswordModal;
export default ChangePasswordModal;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  keyboardContainer: {
    flex: 1,
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 10 : 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  screenSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  /* Feedback Banners */
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#15803D",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
    flex: 1,
  },
  /* Security Information Card */
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  infoIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  infoTextCol: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  infoCardSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  /* Form Field Groups */
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputContainerError: {
    borderColor: "#DC2626",
  },
  inputLeftIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    height: "100%",
  },
  eyeButton: {
    padding: 4,
  },
  fieldErrorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
    fontWeight: "500",
  },
  /* Strength Indicator */
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 4,
  },
  strengthBarsRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
    gap: 4,
  },
  strengthBarSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthBarEmpty: {
    backgroundColor: "#E2E8F0",
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 12,
    color: "#64748B",
  },
  /* Match Indicator */
  matchIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  matchText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16A34A",
  },
  /* Submit Button */
  submitButton: {
    backgroundColor: "#0D9488",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 32,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
