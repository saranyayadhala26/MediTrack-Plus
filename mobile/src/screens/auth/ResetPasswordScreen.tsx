/**
 * Reset Password & Recovery OTP Screens (PDF Page 1 & Page 2 Redesign)
 *
 * Handles the two-stage password recovery workflow:
 * - Stage 1 (PDF Page 2): Recovery OTP Verification ("Verify your code", masked email,
 *   6 OTP boxes, resend countdown, "Use a different email", security card)
 * - Stage 2 (PDF Page 1): Create New Password ("Create New Password", password inputs,
 *   eye controls, password rules card, "Reset Password" button, "Back to Verification")
 *
 * Features:
 * - Exact visual hierarchy of PDF Page 1 & Page 2 references
 * - MediTrack+ branding & botanical leaves decoration
 * - Preserves existing verifyResetOtp, resend, and resetPassword API contracts
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { verifyResetOtp } from "../../api/auth";
import apiClient from "../../api/client";
import { ENDPOINTS } from "../../api/endpoints";
import {
  AuthBotanicalLeaves,
  AuthBrandHeader,
  OtpCodeInput,
  PasswordRequirementsCard,
} from "../../components/auth";
import { SuccessState } from "../../components/common";
import { config } from "../../constants/config";

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
  // Safe area insets
  let insetsTop = 0;
  let insetsBottom = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
    insetsBottom = insets?.bottom || 0;
  } catch {
    insetsTop = 0;
    insetsBottom = 0;
  }
  const statusBarHeight =
    Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

  // Recovery & Form states
  const [email, setEmail] = useState<string>(initialEmail);
  const [code, setCode] = useState<string>("");
  const [isCodeVerified, setIsCodeVerified] = useState<boolean>(false);
  const [verifyingCode, setVerifyingCode] = useState<boolean>(false);

  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(45);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync email if initialEmail updates from navigation
  useEffect(() => {
    if (initialEmail && initialEmail !== email) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

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

  // Mask email helper e.g. "saranya@gmail.com" -> "sa****@gmail.com"
  const maskEmail = (rawEmail: string): string => {
    if (!rawEmail || !rawEmail.includes("@")) return rawEmail || "your email";
    const [local, domain] = rawEmail.split("@");
    if (local.length <= 2) {
      return `${local}***@${domain}`;
    }
    const visible = local.slice(0, 2);
    const asterisks = "*".repeat(Math.max(2, Math.min(4, local.length - 2)));
    return `${visible}${asterisks}@${domain}`;
  };

  const formatCooldown = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Step 1: Verify OTP Code
  const handleVerifyCode = async (explicitCode?: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = (explicitCode || code).trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!trimmedCode || trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      setError("Please enter the 6-digit numeric verification code.");
      return;
    }

    setError(null);
    setVerifyingCode(true);

    try {
      const res = await verifyResetOtp(trimmedEmail, trimmedCode);
      if (res.valid) {
        setIsCodeVerified(true);
        setError(null);
      } else {
        setError("Invalid or expired reset code. Please check and try again.");
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

  // Resend OTP Code
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
      setCooldown(45);
      setCode("");
      setIsCodeVerified(false);
    } catch (err: any) {
      setError("Failed to resend reset code. Please try again shortly.");
    } finally {
      setResending(false);
    }
  };

  // Step 2: Set New Password
  const handleResetPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!trimmedCode || trimmedCode.length !== 6) {
      setError("Please enter the 6-digit numeric verification code.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Re-validate OTP if needed
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
    <View style={styles.container}>
      {/* Decorative Mint Botanical Leaves */}
      <AuthBotanicalLeaves />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: topInset + 12,
              paddingBottom: insetsBottom + 32,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {success ? (
            <SuccessState
              variant="password_changed"
              actionTitle="Continue to Sign In"
              onActionPress={onNavigateToLogin}
            />
          ) : isCodeVerified ? (
            /* =======================================================
               Stage 2: Reset Password (PDF Page 1 Reference)
               ======================================================= */
            <View>
              {/* Header Branding with Back to Verification Arrow */}
              <AuthBrandHeader
                title="Create New Password"
                subtitle="Create a new password for your MediTrack+ account."
                onBack={() => {
                  setError(null);
                  setIsCodeVerified(false);
                }}
                backAccessibilityLabel="Back to Code Verification"
              />

              {/* Success Banner */}
              {success ? (
                <View style={styles.successBanner} accessibilityRole="alert">
                  <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                  <Text style={styles.successBannerText}>
                    Password reset successfully! Returning to login...
                  </Text>
                </View>
              ) : null}

              {/* New Password Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>New Password</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "newPassword" && styles.inputWrapperFocused,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={focusedField === "newPassword" ? "#0D9488" : "#64748B"}
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter new password"
                    placeholderTextColor="#94A3B8"
                    value={newPassword}
                    onChangeText={(text) => {
                      setNewPassword(text);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("newPassword")}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading && !success}
                    accessibilityLabel="New password input"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    disabled={loading || success}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm New Password Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Confirm New Password</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "confirmNewPassword" && styles.inputWrapperFocused,
                    Boolean(error && error.includes("match")) && styles.inputWrapperError,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={
                      focusedField === "confirmNewPassword"
                        ? "#0D9488"
                        : error && error.includes("match")
                        ? "#DC2626"
                        : "#64748B"
                    }
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#94A3B8"
                    value={confirmNewPassword}
                    onChangeText={(text) => {
                      setConfirmNewPassword(text);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocusedField("confirmNewPassword")}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    editable={!loading && !success}
                    accessibilityLabel="Confirm new password input"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    disabled={loading || success}
                  >
                    <Ionicons
                      name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Password Requirements Card */}
              <PasswordRequirementsCard
                password={newPassword}
                showErrors={Boolean(error)}
              />

              {/* Reset Password Action Button */}
              <TouchableOpacity
                style={[styles.primaryActionBtn, loading && styles.primaryActionBtnLoading]}
                onPress={handleResetPassword}
                disabled={loading || success}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={loading ? "Resetting password" : "Reset Password"}
              >
                {loading ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.primaryActionBtnText}>Resetting...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryActionBtnText}>Reset Password</Text>
                )}
              </TouchableOpacity>

              {/* OR Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Error Banner */}
              {error ? (
                <View style={styles.errorBanner} accessibilityRole="alert">
                  <View style={styles.errorIconBadge}>
                    <Text style={styles.errorExclamationText}>!</Text>
                  </View>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              ) : null}

              {/* Back to Verification Link */}
              <View style={styles.backLinkRow}>
                <TouchableOpacity
                  onPress={() => {
                    setError(null);
                    setIsCodeVerified(false);
                  }}
                  style={styles.backLinkTouchable}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Back to Verification"
                >
                  <Ionicons name="chevron-back" size={16} color="#64748B" />
                  <Text style={styles.backLinkText}>Back to Verification</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* =======================================================
               Stage 1: Verify Code / Recovery OTP (PDF Page 2 Reference)
               ======================================================= */
            <View>
              {/* Header Branding */}
              <AuthBrandHeader
                title="Verify your code"
                subtitle="Enter the verification code we sent to your email to continue resetting your password."
                onBack={
                  onNavigateToForgotPassword
                    ? onNavigateToForgotPassword
                    : onNavigateToLogin
                }
                backAccessibilityLabel="Back to Forgot Password"
              />

              {/* Masked Email Info Card */}
              <View style={styles.emailCard}>
                <View style={styles.emailIconWrapper}>
                  <Ionicons name="mail-outline" size={20} color="#0D9488" />
                </View>
                <View>
                  <Text style={styles.emailCardLabel}>We sent a 6-digit code to</Text>
                  <Text style={styles.maskedEmailText}>{maskEmail(email)}</Text>
                </View>
              </View>

              {/* 6-Digit OTP Boxes */}
              <OtpCodeInput
                value={code}
                onChange={(val) => {
                  setCode(val);
                  if (error) setError(null);
                }}
                hasError={Boolean(error)}
                disabled={verifyingCode}
                onComplete={(completedCode) => {
                  handleVerifyCode(completedCode);
                }}
              />

              {/* Error Alert */}
              {error ? (
                <View style={styles.errorAlert} accessibilityRole="alert">
                  <View style={styles.errorBadge}>
                    <Text style={styles.errorExclamation}>!</Text>
                  </View>
                  <Text style={styles.errorAlertText}>{error}</Text>
                </View>
              ) : null}

              {/* Verify Code Action Button */}
              <TouchableOpacity
                style={[
                  styles.primaryActionBtn,
                  (code.length !== 6 || verifyingCode) &&
                    styles.primaryActionBtnDisabled,
                ]}
                onPress={() => handleVerifyCode()}
                disabled={code.length !== 6 || verifyingCode}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  verifyingCode ? "Verifying code" : "Verify Code"
                }
              >
                {verifyingCode ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.primaryActionBtnText}>Verifying...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryActionBtnText}>Verify Code</Text>
                )}
              </TouchableOpacity>

              {/* Resend Code Countdown */}
              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>Didn't receive the code? </Text>
                {cooldown > 0 ? (
                  <Text style={styles.cooldownText}>
                    Resend code in {formatCooldown(cooldown)}
                  </Text>
                ) : (
                  <TouchableOpacity
                    onPress={handleResendCode}
                    disabled={resending}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Resend code"
                  >
                    <Text style={styles.resendActionText}>
                      {resending ? "Sending..." : "Resend code"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* OR Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Use a Different Email Link */}
              {onNavigateToForgotPassword ? (
                <View style={styles.centerLinkRow}>
                  <TouchableOpacity
                    onPress={onNavigateToForgotPassword}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Use a different email"
                  >
                    <Text style={styles.differentEmailText}>
                      Use a different email
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Security Information Card */}
              <View style={styles.securityCard}>
                <View style={styles.securityIconWrapper}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={22}
                    color="#0D9488"
                  />
                </View>
                <View style={styles.securityTextCol}>
                  <Text style={styles.securityTitle}>For your security</Text>
                  <Text style={styles.securitySubtitle}>
                    Never share your verification code with anyone.
                  </Text>
                </View>
              </View>

              {/* Back to Forgot Password Link */}
              <View style={styles.backLinkRow}>
                <TouchableOpacity
                  onPress={
                    onNavigateToForgotPassword
                      ? onNavigateToForgotPassword
                      : onNavigateToLogin
                  }
                  style={styles.backLinkTouchable}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Back to Forgot Password"
                >
                  <Ionicons name="chevron-back" size={16} color="#64748B" />
                  <Text style={styles.backLinkText}>Back to Forgot Password</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },

  /* Field Groups */
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputWrapperFocused: {
    borderColor: "#0D9488",
    backgroundColor: "#FFFFFF",
  },
  inputWrapperError: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  inputLeftIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 0,
  },
  eyeButton: {
    padding: 6,
    marginLeft: 6,
  },

  /* Masked Email Info Card */
  emailCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 12,
  },
  emailIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  emailCardLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 2,
  },
  maskedEmailText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },

  /* Error Alert */
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 10,
    gap: 8,
  },
  errorBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  errorExclamation: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 14,
  },
  errorAlertText: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "500",
  },

  /* Primary Action Button */
  primaryActionBtn: {
    height: 52,
    backgroundColor: "#0D9488",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryActionBtnDisabled: {
    backgroundColor: "#99F6E4",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryActionBtnLoading: {
    opacity: 0.8,
  },
  primaryActionBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  /* Resend Container */
  resendContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  resendText: {
    fontSize: 14,
    color: "#64748B",
  },
  cooldownText: {
    fontSize: 14,
    color: "#64748B",
  },
  resendActionText: {
    fontSize: 14,
    color: "#0D9488",
    fontWeight: "700",
  },

  /* OR Divider */
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  dividerText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
    paddingHorizontal: 12,
  },

  /* Center Link */
  centerLinkRow: {
    alignItems: "center",
    marginBottom: 16,
  },
  differentEmailText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Security Info Card */
  securityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    gap: 12,
  },
  securityIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  securityTextCol: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  securitySubtitle: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },

  /* Back Link Row */
  backLinkRow: {
    alignItems: "center",
    marginTop: 22,
    marginBottom: 10,
  },
  backLinkTouchable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backLinkText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },

  /* Error Banner */
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  errorIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  errorExclamationText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 14,
    lineHeight: 16,
  },
  errorBannerText: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "500",
    flex: 1,
  },

  /* Success Banner */
  successBanner: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  successBannerText: {
    fontSize: 13,
    color: "#16A34A",
    fontWeight: "600",
    flex: 1,
  },
});
