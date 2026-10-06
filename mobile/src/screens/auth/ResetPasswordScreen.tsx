/**
 * Accessible Password Reset Screen with 6-Digit Verification Code
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
import apiClient from "../../api/client";
import { verifyResetOtp } from "../../api/auth";
import { ENDPOINTS } from "../../api/endpoints";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { MediTrackLogo } from "../../components/common/MediTrackLogo";
import { config } from "../../constants/config";
import { accessibility, borderRadius, colors, spacing, typography } from "../../constants/theme";

interface ResetPasswordScreenProps {
  initialEmail?: string;
  onNavigateToLogin: () => void;
  onNavigateToForgotPassword?: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({
  initialEmail = "",
  onNavigateToLogin,
  onNavigateToForgotPassword,
}) => {
  const [email, setEmail] = useState<string>(initialEmail);
  const [code, setCode] = useState<string>("");
  const [isCodeVerified, setIsCodeVerified] = useState<boolean>(false);
  const [verifyingCode, setVerifyingCode] = useState<boolean>(false);
  const [codeSuccessMsg, setCodeSuccessMsg] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(60);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Resend cooldown timer
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

  const handleVerifyCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!trimmedCode || trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      setError("Please enter the 6-digit numeric verification code.");
      return;
    }

    setError(null);
    setCodeSuccessMsg(null);
    setVerifyingCode(true);

    try {
      const res = await verifyResetOtp(trimmedEmail, trimmedCode);
      if (res.valid) {
        setIsCodeVerified(true);
        setCodeSuccessMsg("✓ Verification code verified. You can now set your new password.");
      }
    } catch (err: any) {
      setIsCodeVerified(false);
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (!err.response) {
        setError("Unable to connect to server. Please check your internet connection.");
      } else {
        setError("Invalid or expired reset code. Please check and try again.");
      }
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address to resend code.");
      return;
    }
    if (cooldown > 0 || resending) return;

    setError(null);
    setResending(true);

    try {
      await apiClient.post(ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        email: trimmedEmail,
      });
      setCodeSuccessMsg("A new verification code has been dispatched to your email.");
      setCooldown(60);
      setCode("");
      setIsCodeVerified(false);
    } catch (err: any) {
      setError("Failed to resend reset code. Please try again shortly.");
    } finally {
      setResending(false);
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!trimmedCode || trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      setError("Please enter the 6-digit numeric verification code.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match. Please verify.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Validate OTP first if not already validated
      if (!isCodeVerified) {
        await verifyResetOtp(trimmedEmail, trimmedCode);
        setIsCodeVerified(true);
      }

      await apiClient.post(ENDPOINTS.AUTH.RESET_PASSWORD, {
        email: trimmedEmail,
        code: trimmedCode,
        newPassword,
        confirmNewPassword,
      });

      setSuccess(true);
      setTimeout(() => {
        onNavigateToLogin();
      }, 1500);
    } catch (err: any) {
      if (!err.response) {
        setError(`Unable to connect to server at ${config.apiBaseUrl}. Please ensure backend is running.`);
      } else {
        const detail = err.response?.data?.detail;
        if (typeof detail === "string") {
          setError(detail);
        } else if (Array.isArray(detail)) {
          setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join("; "));
        } else {
          setError("Password reset failed. Please verify your code and try again.");
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

          {/* Form Card */}
          <Card style={styles.card}>
            <Text style={styles.formTitle}>Set New Password</Text>
            <Text style={styles.formSubtitle}>
              Enter the 6-digit code sent to your email and choose a new password (min. 8 characters).
            </Text>

            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {success ? (
              <View style={styles.successBanner} accessibilityRole="alert">
                <Text style={styles.successIcon}>✅</Text>
                <Text style={styles.successBannerText}>
                  Password reset successfully! Returning to login...
                </Text>
              </View>
            ) : null}

            {/* Email Field */}
            <Input
              label="Account Email"
              placeholder="e.g. yourname@example.com"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (error) setError(null);
              }}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              style={[styles.inputField, focusedField === "email" && styles.inputFocused]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading && !success}
            />

            {/* 6-Digit Code Field */}
            <Input
              label="6-Digit Verification Code"
              placeholder="123456"
              value={code}
              onChangeText={(text) => {
                const numericOnly = text.replace(/[^0-9]/g, "").slice(0, 6);
                setCode(numericOnly);
                if (error) setError(null);
              }}
              onFocus={() => setFocusedField("code")}
              onBlur={() => setFocusedField(null)}
              style={[
                styles.inputField,
                styles.codeInput,
                focusedField === "code" && styles.inputFocused,
              ]}
              keyboardType="number-pad"
              maxLength={6}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading && !success}
            />

            {/* Code Verification Feedback */}
            {codeSuccessMsg ? (
              <View style={styles.codeSuccessBox}>
                <Text style={styles.codeSuccessText}>{codeSuccessMsg}</Text>
              </View>
            ) : null}

            {/* Code Actions: Verify and Resend Cooldown */}
            <View style={styles.codeActionRow}>
              <TouchableOpacity
                onPress={handleVerifyCode}
                disabled={code.length !== 6 || verifyingCode || loading || isCodeVerified}
                style={[
                  styles.verifyCodeBtn,
                  (code.length !== 6 || isCodeVerified) && styles.verifyCodeBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Verify 6-digit code"
              >
                {verifyingCode ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.verifyCodeBtnText}>
                    {isCodeVerified ? "✓ Code Verified" : "Verify Code"}
                  </Text>
                )}
              </TouchableOpacity>

              {cooldown > 0 ? (
                <Text style={styles.cooldownText}>Resend in {cooldown}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResendCode} disabled={resending}>
                  <Text style={styles.resendCodeLink}>
                    {resending ? "Sending..." : "Resend Code"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* New Password Field */}
            <View style={styles.passwordWrapper}>
              <Input
                label="New Password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
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
                editable={!loading && !success}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loading || success}
              >
                <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>

            {/* Confirm New Password Field */}
            <View style={styles.passwordWrapper}>
              <Input
                label="Confirm New Password"
                placeholder="Re-enter your new password"
                value={confirmNewPassword}
                onChangeText={(text) => {
                  setConfirmNewPassword(text);
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
                editable={!loading && !success}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loading || success}
              >
                <Text style={styles.eyeIcon}>{showConfirmPassword ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>

            <Button
              title="Reset Password"
              onPress={handleResetPassword}
              variant="primary"
              loading={loading}
              disabled={loading || success}
              style={styles.actionButton}
            />

            <View style={styles.secondaryActions}>
              {onNavigateToForgotPassword ? (
                <TouchableOpacity
                  onPress={onNavigateToForgotPassword}
                  accessibilityRole="button"
                  accessibilityLabel="Request a new reset code"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={loading || success}
                >
                  <Text style={styles.resendText}>Didn't receive a code? Request new code</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={onNavigateToLogin}
                accessibilityRole="button"
                accessibilityLabel="Return to login screen"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loading}
                style={styles.loginLinkTouchable}
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
  successBanner: {
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
  successIcon: {
    fontSize: 18,
  },
  successBannerText: {
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
  codeInput: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 6,
    fontSize: 18,
    fontWeight: "700",
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
  actionButton: {
    marginTop: spacing.md,
    minHeight: accessibility.minTouchTarget,
  },
  secondaryActions: {
    alignItems: "center",
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  resendText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "600",
  },
  loginLinkTouchable: {
    paddingVertical: spacing.xs,
  },
  linkText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  codeSuccessBox: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  codeSuccessText: {
    ...typography.caption,
    color: "#15803D",
    lineHeight: 18,
  },
  codeActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  verifyCodeBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  verifyCodeBtnDisabled: {
    backgroundColor: colors.borderLight,
  },
  verifyCodeBtnText: {
    ...typography.caption,
    fontWeight: "700",
    color: "#fff",
  },
  cooldownText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  resendCodeLink: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
});
