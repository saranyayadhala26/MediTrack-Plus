/**
 * Production-Ready Email Verification Screen with 6-Digit OTP & Cooldown
 * MediTrack+ Smart Medication Management & Adherence
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { resendVerificationOtp, verifyEmailOtp } from "../../api/auth";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { MediTrackLogo } from "../../components/common/MediTrackLogo";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { User } from "../../types";

interface VerifyEmailScreenProps {
  email: string;
  onVerificationSuccess: (user?: User, token?: string) => void;
  onNavigateToLogin: () => void;
}

export const VerifyEmailScreen: React.FC<VerifyEmailScreenProps> = ({
  email,
  onVerificationSuccess,
  onNavigateToLogin,
}) => {
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(60);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 60-second cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cooldown]);

  const handleVerify = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    if (trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      setError("Verification code must be exactly 6 numeric digits.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const response = await verifyEmailOtp(email, trimmedCode);
      setSuccessMessage(response.message || "Email verified successfully!");

      setTimeout(() => {
        onVerificationSuccess(response.user, response.access_token);
      }, 1200);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join("; "));
      } else if (!err.response) {
        setError("Unable to connect to the server. Please check your internet connection.");
      } else {
        setError("Invalid or expired verification code. Please check and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setError(null);
    setSuccessMessage(null);
    setResending(true);

    try {
      const response = await resendVerificationOtp(email);
      setSuccessMessage(response.message || "A new verification code has been dispatched.");
      setCooldown(60);
      setCode("");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Unable to resend verification code. Please try again shortly.");
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
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
            <Text style={styles.subtitle}>Email Verification</Text>
          </View>

          {/* Verification Card */}
          <Card style={styles.card}>
            <View style={styles.iconContainer}>
              <Text style={styles.emailIcon}>✉️</Text>
            </View>

            <Text style={styles.cardTitle}>Verify Your Email</Text>
            <Text style={styles.cardSubtitle}>
              We sent a 6-digit verification code to:
            </Text>
            <Text style={styles.emailHighlight}>{email}</Text>

            {/* Error Banner */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            )}

            {/* Success Banner */}
            {successMessage && (
              <View style={styles.successBox}>
                <Text style={styles.successText}>✓ {successMessage}</Text>
              </View>
            )}

            {/* 6-Digit OTP Input */}
            <Input
              label="6-Digit Verification Code"
              placeholder="e.g. 123456"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={(text) => {
                setCode(text.replace(/[^0-9]/g, ""));
                if (error) setError(null);
              }}
              style={styles.otpInput}
            />

            {/* Verify Button */}
            <Button
              title="Verify Email"
              onPress={handleVerify}
              loading={loading}
              disabled={loading || code.trim().length !== 6}
              variant="primary"
              style={styles.verifyButton}
            />

            {/* Resend Action with Active Cooldown Timer */}
            <View style={styles.resendRow}>
              <Text style={styles.resendPrompt}>Didn't receive the code? </Text>
              {cooldown > 0 ? (
                <Text style={styles.cooldownText}>Resend in {cooldown}s</Text>
              ) : (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resending}
                  accessibilityRole="button"
                  accessibilityLabel="Resend email verification code"
                >
                  <Text style={styles.resendAction}>
                    {resending ? "Sending..." : "Resend Code"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Medical / Account Notice */}
            <View style={styles.noticeContainer}>
              <Text style={styles.noticeText}>
                Verifying your email activates account security features and enables important medication alerts.
              </Text>
            </View>

            {/* Back to Login Link */}
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={onNavigateToLogin}
                accessibilityRole="button"
                accessibilityLabel="Return to sign in screen"
              >
                <Text style={styles.backToLoginText}>← Back to Sign In</Text>
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
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  brandLogo: {
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h1,
    color: colors.primaryDark,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  card: {
    padding: spacing.xl,
    backgroundColor: colors.surface,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  emailIcon: {
    fontSize: 40,
  },
  cardTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emailHighlight: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  otpInput: {
    letterSpacing: 8,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
  verifyButton: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  resendPrompt: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cooldownText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textMuted,
  },
  resendAction: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
  },
  noticeContainer: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.lg,
  },
  noticeText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  footerRow: {
    alignItems: "center",
    paddingTop: spacing.xs,
  },
  backToLoginText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: "#B91C1C",
    lineHeight: 18,
  },
  successBox: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.caption,
    color: "#15803D",
    lineHeight: 18,
  },
});
