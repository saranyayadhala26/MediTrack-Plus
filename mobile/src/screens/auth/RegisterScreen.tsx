/**
 * Accessible Registration Screen with Role Selection and Password Verification
 * MediTrack+ Smart Medication Management & Adherence
 */

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { MediTrackLogo } from "../../components/common/MediTrackLogo";
import { config } from "../../constants/config";
import { accessibility, borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { UserRole } from "../../types";

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
  const { register } = useAuth();
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<UserRole>("patient");
  const [emergencyContact, setEmergencyContact] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }

    setError(null);
    setLoading(true);

    const result = await register(
      fullName,
      email,
      password,
      confirmPassword,
      role,
      emergencyContact
    );
    setLoading(false);

    if (result.success) {
      onNavigateToLogin();
    } else if (result.error) {
      setError(result.error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand Header */}
          <View style={styles.header}>
            <MediTrackLogo size={56} style={styles.brandLogo} />
            <Text style={styles.title}>MediTrack+</Text>
            <Text style={styles.subtitle}>Smart Medication Management & Adherence</Text>
          </View>

          {/* Form Card */}
          <Card style={styles.card}>
            <Text style={styles.formTitle}>Create Account</Text>
            <Text style={styles.formSubtitle}>
              Register to organize and adhere to your prescribed routine
            </Text>

            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {/* Role Selection */}
            <Text style={styles.roleLabel}>Account Role</Text>
            <View style={styles.roleSelectorRow} accessibilityRole="radiogroup">
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === "patient" && styles.roleOptionSelected,
                ]}
                onPress={() => setRole("patient")}
                accessibilityRole="radio"
                accessibilityState={{ selected: role === "patient" }}
                accessibilityLabel="Primary Patient Role: Manage medication and tracking"
                disabled={loading}
              >
                <View style={styles.roleHeaderRow}>
                  <Text style={styles.roleIndicator}>{role === "patient" ? "●" : "○"}</Text>
                  <Text
                    style={[
                      styles.roleOptionText,
                      role === "patient" && styles.roleOptionTextSelected,
                    ]}
                  >
                    Primary Patient
                  </Text>
                </View>
                <Text style={styles.roleDesc}>Manage medication & tracking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === "caregiver" && styles.roleOptionSelected,
                ]}
                onPress={() => setRole("caregiver")}
                accessibilityRole="radio"
                accessibilityState={{ selected: role === "caregiver" }}
                accessibilityLabel="Caregiver Role: Monitor medication adherence"
                disabled={loading}
              >
                <View style={styles.roleHeaderRow}>
                  <Text style={styles.roleIndicator}>{role === "caregiver" ? "●" : "○"}</Text>
                  <Text
                    style={[
                      styles.roleOptionText,
                      role === "caregiver" && styles.roleOptionTextSelected,
                    ]}
                  >
                    Caregiver
                  </Text>
                </View>
                <Text style={styles.roleDesc}>Monitor medication adherence</Text>
              </TouchableOpacity>
            </View>

            <Input
              label="Full Name"
              placeholder="e.g. Eleanor Vance"
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                if (error) setError(null);
              }}
              onFocus={() => setFocusedField("fullName")}
              onBlur={() => setFocusedField(null)}
              style={[
                styles.inputField,
                focusedField === "fullName" && styles.inputFocused,
              ]}
              autoCapitalize="words"
              editable={!loading}
            />

            <Input
              label="Email Address"
              placeholder="e.g. eleanor@example.com"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError(null);
              }}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              style={[
                styles.inputField,
                focusedField === "email" && styles.inputFocused,
              ]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Input
              label="Emergency Contact (Optional)"
              placeholder="e.g. +1-555-0199 (Family or Doctor)"
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              onFocus={() => setFocusedField("emergencyContact")}
              onBlur={() => setFocusedField(null)}
              style={[
                styles.inputField,
                focusedField === "emergencyContact" && styles.inputFocused,
              ]}
              keyboardType="phone-pad"
              editable={!loading}
            />

            <View style={styles.passwordWrapper}>
              <Input
                label="Password (min 6 characters)"
                placeholder="Create a strong password"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError(null);
                }}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword}
                style={[
                  styles.inputField,
                  styles.passwordInput,
                  focusedField === "password" && styles.inputFocused,
                ]}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loading}
              >
                <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.passwordWrapper}>
              <Input
                label="Confirm Password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  if (error) setError(null);
                }}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showConfirmPassword}
                style={[
                  styles.inputField,
                  styles.passwordInput,
                  focusedField === "confirmPassword" && styles.inputFocused,
                ]}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loading}
              >
                <Text style={styles.eyeIcon}>{showConfirmPassword ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>

            {/* Medical safety notice note */}
            <View style={styles.disclaimerNote}>
              <Text style={styles.disclaimerNoteText}>
                ⚠️ {config.medicalDisclaimer}
              </Text>
            </View>

            <Button
              title="Create Account"
              onPress={handleRegister}
              variant="primary"
              loading={loading}
              disabled={loading}
              style={styles.registerButton}
            />

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity
                onPress={onNavigateToLogin}
                accessibilityRole="button"
                accessibilityLabel="Navigate to login"
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                disabled={loading}
              >
                <Text style={styles.linkText}>Log in</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) + 8 : 8,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  brandLogo: {
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.primaryDark,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  card: {
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  formTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  formSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.error,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorIcon: {
    fontSize: 18,
  },
  errorBannerText: {
    ...typography.body,
    color: colors.error,
    fontWeight: "600",
    flex: 1,
  },
  roleLabel: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  roleSelectorRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  roleOption: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    minHeight: 64,
    justifyContent: "center",
  },
  roleOptionSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryLight,
  },
  roleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 2,
  },
  roleIndicator: {
    fontSize: 14,
    color: colors.primaryDark,
    fontWeight: "700",
  },
  roleOptionText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  roleOptionTextSelected: {
    color: colors.primaryDark,
  },
  roleDesc: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 14,
  },
  inputField: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    minHeight: accessibility.minTouchTarget,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: "#F0FDFA",
  },
  passwordWrapper: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: "absolute",
    right: 4,
    top: 32,
    width: accessibility.minTouchTarget,
    height: accessibility.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 10,
  },
  eyeIcon: {
    fontSize: 20,
  },
  disclaimerNote: {
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.lg,
  },
  disclaimerNoteText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  registerButton: {
    marginTop: spacing.sm,
    minHeight: accessibility.minTouchTarget,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
  },
  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  linkText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primaryDark,
  },
});
