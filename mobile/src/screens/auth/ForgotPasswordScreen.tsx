/**
 * Accessible Forgot Password Screen
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
import apiClient from "../../api/client";
import { ENDPOINTS } from "../../api/endpoints";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { MediTrackLogo } from "../../components/common/MediTrackLogo";
import { config } from "../../constants/config";
import { accessibility, borderRadius, colors, spacing, typography } from "../../constants/theme";

interface ForgotPasswordScreenProps {
  onNavigateToLogin: () => void;
  onCodeSent: (email: string) => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  onNavigateToLogin,
  onCodeSent,
}) => {
  const [email, setEmail] = useState<string>("");
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await apiClient.post(ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        email: trimmedEmail,
      });

      const msg =
        response.data?.message ||
        "If an account is associated with this email, you will receive password reset instructions shortly.";
      setInfoMessage(msg);

      // Brief pause so user sees confirmation, then navigate to Reset Password screen carrying the email
      setTimeout(() => {
        onCodeSent(trimmedEmail);
      }, 1000);
    } catch (err: any) {
      // In accordance with security enumeration prevention, show generic guidance or network error
      if (!err.response) {
        setError(`Unable to connect to server at ${config.apiBaseUrl}. Please ensure backend is running.`);
      } else {
        const detail = err.response?.data?.detail;
        if (typeof detail === "string") {
          setError(detail);
        } else {
          setError("Unable to process password reset request. Please check your connection and try again.");
        }
      }
    } finally {
      setLoading(false);
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

          {/* Medical Safety Notice */}
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerTitle}>⚠️ Medical Safety Notice</Text>
            <Text style={styles.disclaimerText}>{config.medicalDisclaimer}</Text>
          </View>

          {/* Form Card */}
          <Card style={styles.card}>
            <Text style={styles.formTitle}>Forgot Password</Text>
            <Text style={styles.formSubtitle}>
              Enter your registered account email to receive a 6-digit recovery code.
            </Text>

            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {infoMessage ? (
              <View style={styles.infoBanner} accessibilityRole="alert">
                <Text style={styles.infoIcon}>📬</Text>
                <Text style={styles.infoBannerText}>{infoMessage}</Text>
              </View>
            ) : null}

            <Input
              label="Account Email"
              placeholder="e.g. yourname@example.com"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (error) setError(null);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={[styles.inputField, isFocused && styles.inputFocused]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Button
              title="Send Reset Code"
              onPress={handleSubmit}
              variant="primary"
              loading={loading}
              disabled={loading}
              style={styles.actionButton}
            />

            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={onNavigateToLogin}
                accessibilityRole="button"
                accessibilityLabel="Return to login screen"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loading}
              >
                <Text style={styles.linkText}>← Back to Login</Text>
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
    letterSpacing: 0.5,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  disclaimerBox: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  disclaimerTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.error,
    marginBottom: 2,
  },
  disclaimerText: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
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
    lineHeight: 20,
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
  infoBanner: {
    backgroundColor: "#F0FDF4",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoIcon: {
    fontSize: 18,
  },
  infoBannerText: {
    ...typography.body,
    color: "#065F46",
    fontWeight: "600",
    flex: 1,
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
  actionButton: {
    marginTop: spacing.md,
    minHeight: accessibility.minTouchTarget,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
  },
  linkText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primaryDark,
  },
});
