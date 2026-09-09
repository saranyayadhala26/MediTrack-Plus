/**
 * Accessible Registration Screen with Role Selection and Password Verification
 */

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { config } from "../../constants/config";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>MediTrack+</Text>
            <Text style={styles.subtitle}>Create your account</Text>
          </View>

          {/* Form Card */}
          <Card style={styles.card}>
            <Text style={styles.formTitle}>Get Started</Text>
            <Text style={styles.formSubtitle}>
              Register to organize and adhere to your prescribed routine
            </Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {/* Role Selection */}
            <Text style={styles.roleLabel}>Select Your Role:</Text>
            <View style={styles.roleSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === "patient" && styles.roleOptionSelected,
                ]}
                onPress={() => setRole("patient")}
                accessibilityRole="button"
                accessibilityLabel="Patient Role"
              >
                <Text
                  style={[
                    styles.roleOptionText,
                    role === "patient" && styles.roleOptionTextSelected,
                  ]}
                >
                  Primary Patient
                </Text>
                <Text style={styles.roleDesc}>Manage medication & tracking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === "caregiver" && styles.roleOptionSelected,
                ]}
                onPress={() => setRole("caregiver")}
                accessibilityRole="button"
                accessibilityLabel="Caregiver Role"
              >
                <Text
                  style={[
                    styles.roleOptionText,
                    role === "caregiver" && styles.roleOptionTextSelected,
                  ]}
                >
                  Caregiver
                </Text>
                <Text style={styles.roleDesc}>Monitor adherence (read-only)</Text>
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
              autoCapitalize="words"
            />

            <Input
              label="Email Address"
              placeholder="e.g. eleanor@example.com"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="Emergency Contact (Optional)"
              placeholder="e.g. +1-555-0199 (Family or Doctor)"
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              keyboardType="phone-pad"
            />

            <Input
              label="Password (min 6 characters)"
              placeholder="Create a strong password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (error) setError(null);
              }}
              secureTextEntry
            />

            <Input
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (error) setError(null);
              }}
              secureTextEntry
            />

            {/* Medical disclaimer note */}
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
              style={styles.registerButton}
            />

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={onNavigateToLogin} accessibilityRole="button">
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
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    alignItems: "center",
    marginVertical: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    fontWeight: "800",
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  card: {
    padding: spacing.xl,
  },
  formTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  formSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  errorBanner: {
    backgroundColor: colors.skippedLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorBannerText: {
    ...typography.body,
    color: colors.error,
    fontWeight: "600",
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
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
  },
  roleOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
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
    textAlign: "center",
    marginTop: 2,
  },
  disclaimerNote: {
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.lg,
  },
  disclaimerNoteText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  registerButton: {
    marginTop: spacing.sm,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
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
    color: colors.primary,
  },
});
