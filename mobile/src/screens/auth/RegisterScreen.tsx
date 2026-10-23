/**
 * Register Screen (Strict Reference-Match to PDF Page 4 / 33)
 *
 * Implements the exact visual structure, hierarchy, typography, colors,
 * icons, cards, buttons, and validation states of the reference image.
 *
 * Visual States:
 * - Normal (LEFT screen): Clean empty form, no premature errors, primary teal button
 * - Validation/Error (MIDDLE screen): Red borders, error rows with solid red circle !,
 *   real-time password checklist with green checks/red crosses, red cross for password mismatch,
 *   disabled lighter teal button
 *
 * Preserves 100% of existing registration logic, auth context, and role handling.
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
import {
  AuthBotanicalLeaves,
  AuthBrandHeader,
} from "../../components/auth";
import { useAuth } from "../../context/AuthContext";
import { UserRole } from "../../types";

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
  onNavigateToVerifyEmail?: (email: string) => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onNavigateToLogin,
  onNavigateToVerifyEmail,
}) => {
  const { register } = useAuth();

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

  // Form states
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<UserRole>("patient");
  const [emergencyContact, setEmergencyContact] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // Focus & Validation states
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Email format validation helper
  const validateEmailFormat = (val: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(val.trim());
  };

  // Real-time password requirement checklist flags
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isPasswordValid =
    hasMinLength && hasUppercase && hasNumber && hasSpecial;

  // Evaluate form validity
  const isFormInvalid =
    Boolean(fieldErrors.fullName) ||
    Boolean(fieldErrors.email) ||
    Boolean(fieldErrors.password) ||
    Boolean(fieldErrors.confirmPassword);

  const validateAllFields = (): boolean => {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const errors: typeof fieldErrors = {};

    if (!cleanName || cleanName.length < 2) {
      errors.fullName = "Please enter your full name.";
    }

    if (!cleanEmail) {
      errors.email = "Please enter your email address.";
    } else if (!validateEmailFormat(cleanEmail)) {
      errors.email = "Please enter a valid email address.";
    }

    if (password.length < 6) {
      errors.password = "Password must be at least 6 characters long.";
    } else if (!isPasswordValid) {
      errors.password = "Password does not meet the required rules.";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    setHasAttemptedSubmit(true);
    const isValid = validateAllFields();
    if (!isValid) {
      return;
    }

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    setServerError(null);
    setLoading(true);

    try {
      const result = await register(
        cleanName,
        cleanEmail,
        password,
        confirmPassword,
        role,
        emergencyContact.trim()
      );

      if (result.success) {
        if (onNavigateToVerifyEmail) {
          onNavigateToVerifyEmail(cleanEmail);
        } else {
          onNavigateToLogin();
        }
      } else if (result.error) {
        setServerError(result.error);
      }
    } catch (err: any) {
      setServerError(
        err?.response?.data?.detail ||
          "Registration failed. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Show password requirements checklist when user has started typing or after attempt
  const showPasswordChecklist =
    password.length > 0 || hasAttemptedSubmit || Boolean(fieldErrors.password);

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
          {/* Header Branding (Back arrow, MediTrack+ Logo, Title & Subtitle) */}
          <AuthBrandHeader
            title="Create your account"
            subtitle="Set up your MediTrack+ account to manage your medications and reminders."
            onBack={onNavigateToLogin}
            backAccessibilityLabel="Back to Sign In"
          />

          {/* Server Error Alert Banner */}
          {serverError ? (
            <View style={styles.serverErrorBanner} accessibilityRole="alert">
              <View style={styles.errorIconBadge}>
                <Text style={styles.errorExclamationText}>!</Text>
              </View>
              <View style={styles.errorTextCol}>
                <Text style={styles.errorTitle}>Registration Error</Text>
                <Text style={styles.errorSubtitle}>{serverError}</Text>
              </View>
            </View>
          ) : null}

          {/* Role Selection Selector (Preserving Patient/Caregiver logic) */}
          <View style={styles.roleContainer}>
            <View style={styles.roleSegment}>
              <TouchableOpacity
                style={[
                  styles.roleSegmentBtn,
                  role === "patient" && styles.roleSegmentBtnActive,
                ]}
                onPress={() => setRole("patient")}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Select Patient role"
              >
                <Ionicons
                  name="person"
                  size={14}
                  color={role === "patient" ? "#FFFFFF" : "#64748B"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.roleSegmentText,
                    role === "patient" && styles.roleSegmentTextActive,
                  ]}
                >
                  Patient
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleSegmentBtn,
                  role === "caregiver" && styles.roleSegmentBtnActive,
                ]}
                onPress={() => setRole("caregiver")}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Select Caregiver role"
              >
                <Ionicons
                  name="shield-checkmark"
                  size={14}
                  color={role === "caregiver" ? "#FFFFFF" : "#64748B"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.roleSegmentText,
                    role === "caregiver" && styles.roleSegmentTextActive,
                  ]}
                >
                  Caregiver
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Field 1: Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <View
              style={[
                styles.inputWrapper,
                focusedField === "fullName" && styles.inputWrapperFocused,
                Boolean(fieldErrors.fullName) && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={
                  focusedField === "fullName"
                    ? "#0D9488"
                    : fieldErrors.fullName
                    ? "#DC2626"
                    : "#64748B"
                }
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="Enter your full name"
                placeholderTextColor="#94A3B8"
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (fieldErrors.fullName) {
                    setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                  }
                  if (serverError) setServerError(null);
                }}
                onFocus={() => setFocusedField("fullName")}
                onBlur={() => {
                  setFocusedField(null);
                  if (hasAttemptedSubmit) validateAllFields();
                }}
                autoCapitalize="words"
                editable={!loading}
                accessibilityLabel="Full name input"
              />
            </View>
            {fieldErrors.fullName ? (
              <View style={styles.fieldErrorRow}>
                <View style={styles.errorIconCircle}>
                  <Text style={styles.errorExclamation}>!</Text>
                </View>
                <Text style={styles.fieldErrorText}>{fieldErrors.fullName}</Text>
              </View>
            ) : null}
          </View>

          {/* Field 2: Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View
              style={[
                styles.inputWrapper,
                focusedField === "email" && styles.inputWrapperFocused,
                Boolean(fieldErrors.email) && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={
                  focusedField === "email"
                    ? "#0D9488"
                    : fieldErrors.email
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
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }
                  if (serverError) setServerError(null);
                }}
                onFocus={() => setFocusedField("email")}
                onBlur={() => {
                  setFocusedField(null);
                  if (hasAttemptedSubmit) validateAllFields();
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                accessibilityLabel="Email input"
              />
            </View>
            {fieldErrors.email ? (
              <View style={styles.fieldErrorRow}>
                <View style={styles.errorIconCircle}>
                  <Text style={styles.errorExclamation}>!</Text>
                </View>
                <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text>
              </View>
            ) : null}
          </View>

          {/* Optional Emergency Contact (Patient only) */}
          {role === "patient" ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Emergency Contact (Optional)</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === "emergencyContact" && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={focusedField === "emergencyContact" ? "#0D9488" : "#64748B"}
                  style={styles.inputLeftIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. +1-555-0199 (Family or Doctor)"
                  placeholderTextColor="#94A3B8"
                  value={emergencyContact}
                  onChangeText={setEmergencyContact}
                  onFocus={() => setFocusedField("emergencyContact")}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="phone-pad"
                  editable={!loading}
                  accessibilityLabel="Emergency contact input"
                />
              </View>
            </View>
          ) : null}

          {/* Field 3: Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View
              style={[
                styles.inputWrapper,
                focusedField === "password" && styles.inputWrapperFocused,
                Boolean(fieldErrors.password) && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={
                  focusedField === "password"
                    ? "#0D9488"
                    : fieldErrors.password
                    ? "#DC2626"
                    : "#64748B"
                }
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="Create a password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                  if (serverError) setServerError(null);
                }}
                onFocus={() => setFocusedField("password")}
                onBlur={() => {
                  setFocusedField(null);
                  if (hasAttemptedSubmit) validateAllFields();
                }}
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

            {/* Real-Time Password Requirement Checklist (Reference Middle Screen) */}
            {showPasswordChecklist ? (
              <View style={styles.passwordChecklist}>
                <View style={styles.checkItemRow}>
                  <Ionicons
                    name={hasMinLength ? "checkmark-circle" : "close-circle"}
                    size={15}
                    color={hasMinLength ? "#16A34A" : "#DC2626"}
                    style={styles.checkIcon}
                  />
                  <Text
                    style={[
                      styles.checkItemText,
                      hasMinLength && styles.checkItemTextValid,
                    ]}
                  >
                    At least 8 characters
                  </Text>
                </View>

                <View style={styles.checkItemRow}>
                  <Ionicons
                    name={hasUppercase ? "checkmark-circle" : "close-circle"}
                    size={15}
                    color={hasUppercase ? "#16A34A" : "#DC2626"}
                    style={styles.checkIcon}
                  />
                  <Text
                    style={[
                      styles.checkItemText,
                      hasUppercase && styles.checkItemTextValid,
                    ]}
                  >
                    Include one uppercase letter
                  </Text>
                </View>

                <View style={styles.checkItemRow}>
                  <Ionicons
                    name={hasNumber ? "checkmark-circle" : "close-circle"}
                    size={15}
                    color={hasNumber ? "#16A34A" : "#DC2626"}
                    style={styles.checkIcon}
                  />
                  <Text
                    style={[
                      styles.checkItemText,
                      hasNumber && styles.checkItemTextValid,
                    ]}
                  >
                    Include one number
                  </Text>
                </View>

                <View style={styles.checkItemRow}>
                  <Ionicons
                    name={hasSpecial ? "checkmark-circle" : "close-circle"}
                    size={15}
                    color={hasSpecial ? "#16A34A" : "#DC2626"}
                    style={styles.checkIcon}
                  />
                  <Text
                    style={[
                      styles.checkItemText,
                      hasSpecial && styles.checkItemTextValid,
                    ]}
                  >
                    Include one special character
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Field 4: Confirm Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Confirm Password</Text>
            <View
              style={[
                styles.inputWrapper,
                focusedField === "confirmPassword" && styles.inputWrapperFocused,
                Boolean(fieldErrors.confirmPassword) && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={
                  focusedField === "confirmPassword"
                    ? "#0D9488"
                    : fieldErrors.confirmPassword
                    ? "#DC2626"
                    : "#64748B"
                }
                style={styles.inputLeftIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="Re-enter your password"
                placeholderTextColor="#94A3B8"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: undefined,
                    }));
                  }
                  if (serverError) setServerError(null);
                }}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => {
                  setFocusedField(null);
                  if (hasAttemptedSubmit) validateAllFields();
                }}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                editable={!loading}
                accessibilityLabel="Confirm password input"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
                disabled={loading}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>
            {fieldErrors.confirmPassword ? (
              <View style={styles.fieldErrorRow}>
                <Ionicons name="close-circle" size={15} color="#DC2626" />
                <Text style={styles.fieldErrorText}>
                  {fieldErrors.confirmPassword}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Create Account Action Button (Normal teal / Disabled lighter teal) */}
          <TouchableOpacity
            style={[
              styles.createAccountBtn,
              hasAttemptedSubmit && isFormInvalid && styles.createAccountBtnInvalid,
              loading && styles.createAccountBtnLoading,
            ]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={loading ? "Creating account" : "Create Account"}
          >
            {loading ? (
              <View style={styles.buttonLoadingRow}>
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.createAccountBtnText}>Creating account...</Text>
              </View>
            ) : (
              <Text style={styles.createAccountBtnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Email Information Card (Matching Reference Left & Middle Screens) */}
          <View style={styles.emailNoticeCard}>
            <View style={styles.noticeIconCircle}>
              <Ionicons name="mail-outline" size={18} color="#0D9488" />
            </View>
            <Text style={styles.noticeText}>
              After creating your account, you'll receive a verification code by email.
            </Text>
          </View>

          {/* Footer (Already have an account? Sign In) */}
          <View style={styles.signInRow}>
            <Text style={styles.signInPromptText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={onNavigateToLogin}
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={loading}
            >
              <Text style={styles.signInLinkText}>Sign In</Text>
            </TouchableOpacity>
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

  /* Role Selection Segment */
  roleContainer: {
    marginBottom: 16,
  },
  roleSegment: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  roleSegmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  roleSegmentBtnActive: {
    backgroundColor: "#0D9488",
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  roleSegmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  roleSegmentTextActive: {
    color: "#FFFFFF",
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
    backgroundColor: "#F0FDFA",
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

  /* Inline Field Error Row with Solid Red Circle Icon */
  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 5,
  },
  errorIconCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  errorExclamation: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
  fieldErrorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "500",
  },

  /* Real-Time Password Checklist */
  passwordChecklist: {
    marginTop: 8,
    gap: 4,
    paddingLeft: 2,
  },
  checkItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkIcon: {
    marginTop: 1,
  },
  checkItemText: {
    fontSize: 12,
    color: "#64748B",
  },
  checkItemTextValid: {
    color: "#0F766E",
    fontWeight: "500",
  },

  /* Server Error Banner */
  serverErrorBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  errorIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  errorExclamationText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
    lineHeight: 17,
  },
  errorTextCol: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  errorSubtitle: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 2,
  },

  /* Create Account Button */
  createAccountBtn: {
    height: 52,
    backgroundColor: "#0D9488",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  createAccountBtnInvalid: {
    backgroundColor: "#94D3CB",
    shadowOpacity: 0,
    elevation: 0,
  },
  createAccountBtnLoading: {
    opacity: 0.8,
  },
  createAccountBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  /* Email Information Notice Card */
  emailNoticeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    gap: 10,
  },
  noticeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: "#0F766E",
    lineHeight: 18,
  },

  /* Sign In Footer */
  signInRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  signInPromptText: {
    fontSize: 14,
    color: "#64748B",
  },
  signInLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D9488",
  },
});
