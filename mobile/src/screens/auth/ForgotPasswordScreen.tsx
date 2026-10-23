/**
 * Forgot Password Screen (PDF Page 3 Redesign)
 *
 * Password recovery initiation screen for MediTrack+.
 * Features:
 * - Exact visual hierarchy of PDF Page 3 reference (all states: default, focused, invalid, sending, success)
 * - MediTrack+ branding & botanical leaves decoration
 * - Email input with mail icon, focused teal border, and inline error feedback
 * - Full-width teal "Send Verification Code" button with "Sending..." loading state
 * - Celebratory "Verification code sent" state with email card and "Go to Verify Code" CTA
 * - "Remember your password? Back to Sign In" footer navigation
 * - Preserves existing API endpoint, rate limiting, and onCodeSent navigation
 */

import React, { useState } from "react";
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
import apiClient from "../../api/client";
import { ENDPOINTS } from "../../api/endpoints";
import {
  AuthBotanicalLeaves,
  AuthBrandHeader,
} from "../../components/auth";

interface ForgotPasswordScreenProps {
  onNavigateToLogin: () => void;
  onCodeSent: (email: string) => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  onNavigateToLogin,
  onCodeSent,
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
  const [email, setEmail] = useState<string>("");
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [codeSentSuccess, setCodeSentSuccess] = useState<boolean>(false);

  const validateEmailFormat = (val: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(val.trim());
  };

  const handleSubmit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!validateEmailFormat(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await apiClient.post(ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        email: cleanEmail,
      });

      // Show success screen matching PDF Page 3 top-right mockup
      setCodeSentSuccess(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (!err.response) {
        setError("Unable to connect to server. Please check your internet connection.");
      } else {
        setError("Couldn't send the verification code. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToVerify = () => {
    onCodeSent(email.trim().toLowerCase());
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
          {codeSentSuccess ? (
            /* =======================================================
               Success State (PDF Page 3 Reference Screen 4)
               ======================================================= */
            <View style={styles.successContainer}>
              <AuthBrandHeader
                title=""
                subtitle=""
                onBack={onNavigateToLogin}
                backAccessibilityLabel="Back to Sign In"
              />

              <View style={styles.successContent}>
                {/* Mint Green Circle Envelope Illustration */}
                <View style={styles.successIconCircle}>
                  <Ionicons name="mail" size={44} color="#0D9488" />
                  <View style={styles.successCheckBadge}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                </View>

                <Text style={styles.successTitle}>Verification code sent</Text>
                <Text style={styles.successSubtitle}>
                  We sent a password reset code to your email address.
                </Text>

                {/* Email Address Confirmation Card */}
                <View style={styles.emailCard}>
                  <Ionicons name="mail-outline" size={18} color="#0D9488" />
                  <Text style={styles.confirmedEmailText}>
                    {email.trim().toLowerCase()}
                  </Text>
                </View>

                {/* Go to Verify Code CTA */}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleProceedToVerify}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Verify Code"
                >
                  <Text style={styles.actionBtnText}>Go to Verify Code</Text>
                </TouchableOpacity>

                {/* Back to Sign In Link */}
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
            </View>
          ) : (
            /* =======================================================
               Form View (PDF Page 3 Reference Screens 1, 2, 3)
               ======================================================= */
            <View>
              {/* Header Branding */}
              <AuthBrandHeader
                title="Forgot password?"
                subtitle="Enter your registered email address and we'll send you a verification code to reset your password."
                onBack={onNavigateToLogin}
                backAccessibilityLabel="Back to Sign In"
              />

              {/* Email Field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    isFocused && styles.inputWrapperFocused,
                    Boolean(error) && styles.inputWrapperError,
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color={
                      isFocused
                        ? "#0D9488"
                        : error
                        ? "#DC2626"
                        : "#64748B"
                    }
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter your email"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (error) setError(null);
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    accessibilityLabel="Email input"
                  />
                </View>

                {/* Inline Error Feedback */}
                {error ? (
                  <View style={styles.fieldErrorRow}>
                    <Ionicons name="alert-circle" size={14} color="#DC2626" />
                    <Text style={styles.fieldErrorText}>{error}</Text>
                  </View>
                ) : null}
              </View>

              {/* Send Verification Code Action Button */}
              <TouchableOpacity
                style={[styles.actionBtn, loading && styles.actionBtnLoading]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  loading ? "Sending verification code" : "Send Verification Code"
                }
              >
                {loading ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.actionBtnText}>Sending...</Text>
                  </View>
                ) : (
                  <Text style={styles.actionBtnText}>
                    Send Verification Code
                  </Text>
                )}
              </TouchableOpacity>

              {/* Remember Password / Back to Sign In Link */}
              <View style={styles.footerRow}>
                <Text style={styles.footerPromptText}>
                  Remember your password?{" "}
                </Text>
                <TouchableOpacity
                  onPress={onNavigateToLogin}
                  accessibilityRole="button"
                  accessibilityLabel="Back to Sign In"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={loading}
                >
                  <Text style={styles.footerLinkText}>Back to Sign In</Text>
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
    marginBottom: 20,
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

  /* Inline Field Error */
  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  fieldErrorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "500",
  },

  /* Action Button */
  actionBtn: {
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
  actionBtnLoading: {
    opacity: 0.8,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  /* Footer Row */
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  footerPromptText: {
    fontSize: 14,
    color: "#64748B",
  },
  footerLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
  },

  /* Success View */
  successContainer: {
    flex: 1,
    width: "100%",
  },
  successContent: {
    alignItems: "center",
    marginTop: 20,
    width: "100%",
  },
  successIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
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
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  emailCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    width: "100%",
    justifyContent: "center",
    gap: 8,
  },
  confirmedEmailText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  backLinkRow: {
    alignItems: "center",
    marginTop: 24,
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
});
