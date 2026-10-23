/**
 * Login Screen (PDF Page 5 / 33 Redesign).
 *
 * Primary authentication gateway for MediTrack+.
 * Features:
 * - Exact visual hierarchy of PDF Page 5 reference
 * - MediTrack+ branding & Welcome back heading with subtle botanical accent
 * - Clean white "Sign in" card with Email, Password, show/hide eye toggle
 * - Right-aligned "Forgot password?" link navigating to recovery flow
 * - Medical teal "Sign In" button with active "Signing in..." loading state
 * - "OR" horizontal divider and "Don't have an account? Create Account" link
 * - Dedicated error state banners matching reference:
 *     1. Incorrect email or password (red banner with !)
 *     2. Unverified email banner (amber banner with "Verify Email" action)
 * - Safe area handling protecting against Android status bar & notch overlap
 * - Mobile keyboard avoiding UX & touch targets >= 44px
 * - Preserves existing AuthContext session management & SecureStore integration
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
import { config } from "../../constants/config";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";

interface LoginScreenProps {
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword?: () => void;
  onNavigateToVerifyEmail?: (email: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onNavigateToVerifyEmail,
}) => {
  const { login } = useAuth();

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

  // Form state
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isEmailFocused, setIsEmailFocused] = useState<boolean>(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Email format validation helper
  const isValidEmailFormat = (val: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(val.trim());
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!isValidEmailFormat(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await login(cleanEmail, password);
      if (!result.success && result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      console.error("[LoginScreen] Login error:", err);
      setError(
        err?.response?.data?.detail ||
          "Unable to connect to MediTrack+ services. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Determine error category for conditional banner rendering
  const isUnverifiedError =
    Boolean(error) &&
    (error!.toLowerCase().includes("verify") ||
      error!.toLowerCase().includes("verification") ||
      error!.toLowerCase().includes("verified"));

  const isCredentialError =
    Boolean(error) &&
    !isUnverifiedError &&
    (error!.toLowerCase().includes("invalid") ||
      error!.toLowerCase().includes("incorrect") ||
      error!.toLowerCase().includes("credentials") ||
      error!.toLowerCase().includes("password"));

  return (
    <View style={styles.container}>
      {/* Decorative Mint Botanical Leaves in Top-Right Background */}
      <View style={styles.topRightBotanical} pointerEvents="none">
        <View style={styles.leafStem} />
        <View style={[styles.leafShape, styles.leaf1]} />
        <View style={[styles.leafShape, styles.leaf2]} />
        <View style={[styles.leafShape, styles.leaf3]} />
        <View style={[styles.leafShape, styles.leaf4]} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: topInset + 12,
              paddingBottom: insetsBottom + spacing.xxl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Header Branding Area */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandIconWrapper}>
                <View style={styles.capsulePill}>
                  <View style={styles.capsuleLeft} />
                  <View style={styles.capsuleRight} />
                </View>
                <View style={styles.capsulePlusBadge}>
                  <Text style={styles.capsulePlusText}>+</Text>
                </View>
              </View>
              <Text style={styles.brandName}>
                MediTrack<Text style={styles.brandPlus}>+</Text>
              </Text>
            </View>

            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Sign in to manage your medications and stay on track.
            </Text>
          </View>

          {/* 2. White "Sign in" Card Container */}
          <View style={styles.cardContainer}>
            <Text style={styles.cardTitle}>Sign in</Text>

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View
                style={[
                  styles.inputWrapper,
                  isEmailFocused && styles.inputWrapperFocused,
                  error && isCredentialError && styles.inputWrapperError,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={isEmailFocused ? "#0D9488" : "#64748B"}
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
                  onFocus={() => setIsEmailFocused(true)}
                  onBlur={() => setIsEmailFocused(false)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  accessibilityLabel="Email input"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  isPasswordFocused && styles.inputWrapperFocused,
                  error && isCredentialError && styles.inputWrapperError,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={isPasswordFocused ? "#0D9488" : "#64748B"}
                  style={styles.inputLeftIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) setError(null);
                  }}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                  accessibilityLabel="Password input"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  disabled={loading}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password Link */}
            <View style={styles.forgotPasswordRow}>
              <TouchableOpacity
                onPress={onNavigateToForgotPassword}
                accessibilityRole="button"
                accessibilityLabel="Forgot password link"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={loading}
              >
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.signInButton, loading && styles.signInButtonLoading]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={loading ? "Signing in" : "Sign In"}
            >
              {loading ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.signInButtonText}>Signing in...</Text>
                </View>
              ) : (
                <Text style={styles.signInButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* OR Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Register / Create Account Link */}
            <View style={styles.registerRow}>
              <Text style={styles.registerPromptText}>
                Don't have an account?{" "}
              </Text>
              <TouchableOpacity
                onPress={onNavigateToRegister}
                accessibilityRole="button"
                accessibilityLabel="Create Account"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={loading}
              >
                <Text style={styles.createAccountText}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Error State Banners (Matching Page 5 Reference) */}
          {error && isUnverifiedError && (
            <View style={styles.unverifiedBanner} accessibilityRole="alert">
              <View style={styles.unverifiedIconBadge}>
                <Ionicons name="mail-outline" size={20} color="#D97706" />
              </View>
              <View style={styles.bannerTextCol}>
                <Text style={styles.unverifiedTitle}>
                  Please verify your email to continue.
                </Text>
                <Text style={styles.unverifiedSubtitle}>
                  We've sent a verification link to your email.
                </Text>
              </View>
              {onNavigateToVerifyEmail && (
                <TouchableOpacity
                  style={styles.verifyEmailButton}
                  onPress={() => onNavigateToVerifyEmail(email.trim().toLowerCase())}
                  accessibilityRole="button"
                  accessibilityLabel="Verify Email"
                >
                  <Text style={styles.verifyEmailButtonText}>Verify Email</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {error && !isUnverifiedError && (
            <View style={styles.credentialErrorBanner} accessibilityRole="alert">
              <View style={styles.errorIconBadge}>
                <Text style={styles.errorExclamationText}>!</Text>
              </View>
              <View style={styles.bannerTextCol}>
                <Text style={styles.errorTitle}>
                  {isCredentialError
                    ? "Incorrect email or password."
                    : "Unable to sign in"}
                </Text>
                <Text style={styles.errorSubtitle}>
                  {isCredentialError ? "Please try again." : error}
                </Text>
              </View>
            </View>
          )}

          {/* 4. Medical Safety Notice */}
          <View style={styles.disclaimerRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color="#0D9488"
              style={{ marginTop: 1 }}
            />
            <Text style={styles.disclaimerText}>
              {config.medicalDisclaimer}
            </Text>
          </View>
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

  /* Botanical Mint Leaves Decoration */
  topRightBotanical: {
    position: "absolute",
    top: 0,
    right: -10,
    width: 140,
    height: 140,
    zIndex: 0,
    opacity: 0.5,
  },
  leafStem: {
    position: "absolute",
    top: 20,
    right: 55,
    width: 2,
    height: 85,
    backgroundColor: "#A7F3D0",
    transform: [{ rotate: "32deg" }],
  },
  leafShape: {
    position: "absolute",
    backgroundColor: "#99F6E4",
    borderTopLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  leaf1: {
    top: 14,
    right: 18,
    width: 36,
    height: 22,
    transform: [{ rotate: "-25deg" }],
  },
  leaf2: {
    top: 38,
    right: 34,
    width: 42,
    height: 24,
    transform: [{ rotate: "-40deg" }],
  },
  leaf3: {
    top: 64,
    right: 18,
    width: 40,
    height: 22,
    transform: [{ rotate: "-15deg" }],
  },
  leaf4: {
    top: 88,
    right: 42,
    width: 34,
    height: 20,
    transform: [{ rotate: "-48deg" }],
  },

  /* Header Branding Area */
  header: {
    marginBottom: 24,
    zIndex: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  brandIconWrapper: {
    position: "relative",
    marginRight: 10,
    width: 32,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  capsulePill: {
    width: 26,
    height: 14,
    borderRadius: 7,
    flexDirection: "row",
    borderWidth: 2,
    borderColor: "#0D9488",
    overflow: "hidden",
    transform: [{ rotate: "-35deg" }],
  },
  capsuleLeft: {
    flex: 1,
    backgroundColor: "#0D9488",
  },
  capsuleRight: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  capsulePlusBadge: {
    position: "absolute",
    right: -4,
    bottom: -2,
    backgroundColor: "#0D9488",
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  capsulePlusText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
  brandName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  brandPlus: {
    color: "#0D9488",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
  },

  /* Card Container */
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 18,
  },
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
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  inputWrapperFocused: {
    borderColor: "#0D9488",
    borderWidth: 1.5,
    backgroundColor: "#F0FDFA",
  },
  inputWrapperError: {
    borderColor: "#DC2626",
    backgroundColor: "#FFF5F5",
  },
  inputLeftIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 8,
  },
  eyeButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotPasswordRow: {
    alignItems: "flex-end",
    marginTop: -4,
    marginBottom: 18,
    minHeight: 36,
    justifyContent: "center",
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D9488",
  },
  signInButton: {
    height: 48,
    backgroundColor: "#0D9488",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  signInButtonLoading: {
    opacity: 0.9,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  buttonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
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
    fontWeight: "600",
    color: "#94A3B8",
    paddingHorizontal: 12,
  },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
  },
  registerPromptText: {
    fontSize: 14,
    color: "#64748B",
  },
  createAccountText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
  },

  /* Error State Banners */
  credentialErrorBanner: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
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
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 16,
  },
  bannerTextCol: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
  },
  errorSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  /* Unverified Email Banner */
  unverifiedBanner: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  unverifiedIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  unverifiedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  unverifiedSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  verifyEmailButton: {
    borderWidth: 1,
    borderColor: "#0D9488",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
    marginLeft: 8,
  },
  verifyEmailButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D9488",
  },

  /* Disclaimer */
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  disclaimerText: {
    fontSize: 11,
    color: "#94A3B8",
    lineHeight: 15,
    flex: 1,
  },
});
