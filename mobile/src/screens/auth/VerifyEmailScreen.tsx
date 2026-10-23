/**
 * Verify Email Screen (Strict Reference-Match to PDF Page 4 Right Screen & State Systems)
 *
 * Implements the exact visual structure, hierarchy, typography, colors,
 * illustration, OTP boxes, buttons, resend countdown, error and success states.
 *
 * Visual States:
 * - Normal (RIGHT screen): Centered heading, "We've sent a 6-digit verification code to",
 *   dynamic user email, soft mint circular envelope illustration, six separate OTP boxes,
 *   "Enter the 6-digit code", full-width teal "Verify Email" button, "Didn't receive the code? Resend Code (00:XX)",
 *   "< Back to Sign In".
 * - Error State (Part 4): Red box borders on OTP fields, error alert "! Invalid verification code. Please try again."
 * - Success State (Part 5): Mint circular illustration with envelope & green check badge,
 *   "Email verified!", supporting message, teal "Continue to Sign In" button.
 *
 * Preserves 100% of existing OTP verification, cooldown countdown, resend logic, and navigation.
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
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resendVerificationOtp, verifyEmailOtp } from "../../api/auth";
import {
  AuthBotanicalLeaves,
  AuthBrandHeader,
  OtpCodeInput,
} from "../../components/auth";
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

  // States
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [verifiedUser, setVerifiedUser] = useState<User | undefined>(undefined);
  const [verifiedToken, setVerifiedToken] = useState<string | undefined>(undefined);
  const [cooldown, setCooldown] = useState<number>(45);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cooldown countdown timer
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

  const handleVerify = async (explicitCode?: string) => {
    const targetCode = (explicitCode || code).trim();
    if (!targetCode) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    if (targetCode.length !== 6 || !/^\d{6}$/.test(targetCode)) {
      setError("Verification code must be exactly 6 numeric digits.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await verifyEmailOtp(email, targetCode);
      setVerifiedUser(response.user);
      setVerifiedToken(response.access_token);
      setIsVerified(true);

      // Auto-continue fallback after 2.5s if user does not press "Continue to Sign In"
      setTimeout(() => {
        onVerificationSuccess(response.user, response.access_token);
      }, 2500);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join("; "));
      } else if (!err.response) {
        setError("Unable to connect to the server. Please check your internet connection.");
      } else {
        setError("Invalid verification code. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setError(null);
    setResending(true);

    try {
      await resendVerificationOtp(email);
      setCooldown(45);
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

  // Format countdown into MM:SS
  const formatCooldown = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      {/* Decorative Mint Botanical Leaves in Top-Right Background */}
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
          {isVerified ? (
            /* =======================================================
               PART 5: Success State (PDF Page 3 Reference Screen 3)
               ======================================================= */
            <View style={styles.successContainer}>
              <AuthBrandHeader
                title=""
                subtitle=""
                onBack={onNavigateToLogin}
                backAccessibilityLabel="Back to Sign In"
              />

              <View style={styles.successCardContent}>
                {/* Soft Mint Circle Envelope Illustration with Green Success Badge */}
                <View style={styles.successIconCircle}>
                  <Ionicons name="mail" size={44} color="#0D9488" />
                  <View style={styles.successCheckBadge}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                </View>

                <Text style={styles.successTitle}>Email verified!</Text>
                <Text style={styles.successSubtitle}>
                  Your email has been successfully verified. You can now sign in to MediTrack+.
                </Text>

                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={() => onVerificationSuccess(verifiedUser, verifiedToken)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Continue to Sign In"
                >
                  <Text style={styles.continueButtonText}>Continue to Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* =======================================================
               PART 3 & 4: Normal & Error Verification (PDF Page 4 Right Screen)
               ======================================================= */
            <View>
              {/* Top Navigation & Brand Header */}
              <AuthBrandHeader
                title="Verify your email"
                subtitle="We've sent a 6-digit verification code to"
                onBack={onNavigateToLogin}
                backAccessibilityLabel="Back to Sign In"
              />

              {/* Dynamic User Email (Matching Reference Center Alignment) */}
              <Text style={styles.targetEmailText}>
                {email || "your registered email"}
              </Text>

              {/* Soft Mint Circular Envelope Illustration */}
              <View style={styles.illustrationWrapper}>
                <View style={styles.envelopeCircle}>
                  <Ionicons name="mail-outline" size={40} color="#0D9488" />
                  {/* Subtle accent dot on envelope */}
                  <View style={styles.envelopeDotBadge}>
                    <View style={styles.envelopeDotInner} />
                  </View>
                </View>
                {/* Accent sparkle rays around the circle */}
                <View style={styles.sparkleRayTopRight} />
                <View style={styles.sparkleRayBottomLeft} />
              </View>

              {/* Six Separate 6-Digit OTP Boxes */}
              <OtpCodeInput
                value={code}
                onChange={(val) => {
                  setCode(val);
                  if (error) setError(null);
                }}
                hasError={Boolean(error)}
                disabled={loading}
                onComplete={(completedCode) => {
                  handleVerify(completedCode);
                }}
              />

              {/* PART 4: Verification Error Alert Banner */}
              {error ? (
                <View style={styles.errorAlert} accessibilityRole="alert">
                  <View style={styles.errorBadge}>
                    <Text style={styles.errorExclamation}>!</Text>
                  </View>
                  <Text style={styles.errorAlertText}>{error}</Text>
                </View>
              ) : null}

              {/* Verify Email Action Button */}
              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  (code.length !== 6 || loading) && styles.verifyButtonDisabled,
                ]}
                onPress={() => handleVerify()}
                disabled={code.length !== 6 || loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={loading ? "Verifying email" : "Verify Email"}
              >
                {loading ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.verifyButtonText}>Verifying...</Text>
                  </View>
                ) : (
                  <Text style={styles.verifyButtonText}>Verify Email</Text>
                )}
              </TouchableOpacity>

              {/* Resend Code Countdown (Didn't receive the code? Resend Code (00:45)) */}
              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>Didn't receive the code? </Text>
                {cooldown > 0 ? (
                  <Text style={styles.cooldownText}>
                    Resend Code ({formatCooldown(cooldown)})
                  </Text>
                ) : (
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resending}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Resend verification code"
                  >
                    <Text style={styles.resendActionText}>
                      {resending ? "Sending..." : "Resend Code"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Back to Sign In Navigation */}
              <View style={styles.backLinkRow}>
                <TouchableOpacity
                  onPress={onNavigateToLogin}
                  style={styles.backLinkTouchable}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Back to Sign In"
                >
                  <Ionicons name="chevron-back" size={16} color="#64748B" />
                  <Text style={styles.backLinkText}>Back to Sign In</Text>
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

  /* Target Email Typography */
  targetEmailText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: -16,
    marginBottom: 20,
    letterSpacing: -0.2,
  },

  /* Illustration Area */
  illustrationWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
    position: "relative",
  },
  envelopeCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  envelopeDotBadge: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
  },
  envelopeDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  sparkleRayTopRight: {
    position: "absolute",
    top: 6,
    right: "34%",
    width: 8,
    height: 3,
    backgroundColor: "#99F6E4",
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
  },
  sparkleRayBottomLeft: {
    position: "absolute",
    bottom: 8,
    left: "34%",
    width: 8,
    height: 3,
    backgroundColor: "#99F6E4",
    borderRadius: 2,
    transform: [{ rotate: "-45deg" }],
  },

  /* Error Alert Banner */
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

  /* Verify Button */
  verifyButton: {
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
  verifyButtonDisabled: {
    backgroundColor: "#99F6E4",
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
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
    color: "#0F766E",
    fontWeight: "600",
  },
  resendActionText: {
    fontSize: 14,
    color: "#0D9488",
    fontWeight: "700",
  },

  /* Back Link Row */
  backLinkRow: {
    alignItems: "center",
    marginTop: 26,
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

  /* Success View */
  successContainer: {
    flex: 1,
  },
  successCardContent: {
    alignItems: "center",
    marginTop: 30,
    paddingHorizontal: 12,
  },
  successIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    position: "relative",
  },
  successCheckBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 10,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  continueButton: {
    width: "100%",
    height: 52,
    backgroundColor: "#0D9488",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
