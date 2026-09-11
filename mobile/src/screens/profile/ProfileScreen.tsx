/**
 * Production-Ready Profile Screen for Patient and Caregiver (Phase 10.1).
 * Features:
 * - Profile header with avatar & role badge
 * - Editable personal details (Full Name, Phone, Emergency Contact)
 * - Read-only verified email & role
 * - Caregiver-specific linked patients overview
 * - Functional medication reminder notification toggle (ON/OFF)
 * - Integrated Change Password modal
 * - Validation, loading state, success feedback, and logout
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getLinkedPatients } from "../../api/caregivers";
import { getSchedules } from "../../api/schedules";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Input } from "../../components/common/Input";
import { borderRadius, colors, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { notificationService } from "../../services/notificationService";
import { LinkedPatient } from "../../types";
import { ChangePasswordModal } from "./ChangePasswordModal";

interface ProfileScreenProps {
  onBack: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack }) => {
  const { user, updateProfile, logout } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  // Form state
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [emergencyContact, setEmergencyContact] = useState(user?.emergencyContact || "");

  // Notification preference state
  const [remindersEnabled, setRemindersEnabled] = useState(
    user?.notificationPreferences?.medicationRemindersEnabled !== false
  );
  const [isTogglingReminder, setIsTogglingReminder] = useState(false);

  // Caregiver stats
  const [linkedPatients, setLinkedPatients] = useState<LinkedPatient[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);

  // Synchronize form when user updates
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || "");
      setPhone(user.phone || "");
      setEmergencyContact(user.emergencyContact || "");
      setRemindersEnabled(user.notificationPreferences?.medicationRemindersEnabled !== false);
    }
  }, [user]);

  // Load caregiver linked patients count
  useEffect(() => {
    if (isCaregiver) {
      setIsLoadingStats(true);
      getLinkedPatients()
        .then((data) => setLinkedPatients(data || []))
        .catch(() => setLinkedPatients([]))
        .finally(() => setIsLoadingStats(false));
    }
  }, [isCaregiver]);

  // Handle Medication Reminder Toggle (Functional integration)
  const handleToggleReminders = async (newValue: boolean) => {
    setIsTogglingReminder(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await updateProfile({
        notificationPreferences: { medicationRemindersEnabled: newValue },
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to update notification preferences.");
        return;
      }

      setRemindersEnabled(newValue);

      if (!newValue) {
        // Disabled: cancel all pending device reminder notifications
        await notificationService.cancelAllNotifications();
        setSuccessMessage("Medication reminder alarms paused. Existing schedules remain saved.");
      } else {
        // Enabled: reconcile active schedules with notification service
        const schedRes = await getSchedules();
        if (schedRes?.items) {
          await notificationService.reconcileAllSchedules(schedRes.items);
        }
        setSuccessMessage("Medication reminder alarms enabled and synchronized.");
      }

      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Could not update notification setting.");
    } finally {
      setIsTogglingReminder(false);
    }
  };

  // Validate form fields
  const validate = (): boolean => {
    if (!fullName.trim()) {
      setErrorMessage("Full Name cannot be empty.");
      return false;
    }
    if (fullName.trim().length < 2) {
      setErrorMessage("Full Name must be at least 2 characters.");
      return false;
    }
    return true;
  };

  // Save profile changes
  const handleSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validate()) return;

    setIsSaving(true);
    try {
      const payload: any = {
        fullName: fullName.trim(),
        phone: phone.trim() ? phone.trim() : null,
      };

      if (!isCaregiver) {
        payload.emergencyContact = emergencyContact.trim() ? emergencyContact.trim() : null;
      }

      const res = await updateProfile(payload);
      if (res.success) {
        setSuccessMessage("Profile updated successfully!");
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage(res.error || "Failed to save profile changes.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error while updating profile.");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset form to current saved user data
  const handleCancel = () => {
    setFullName(user?.fullName || "");
    setPhone(user?.phone || "");
    setEmergencyContact(user?.emergencyContact || "");
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Logout with confirmation
  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of MediTrack+?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Screen Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back to previous screen"
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user?.fullName?.charAt(0).toUpperCase() || "U"}
            </Text>
          </View>
          <Text style={styles.headerTitle}>{user?.fullName || "User Profile"}</Text>
          <View
            style={[
              styles.roleBadge,
              isCaregiver ? styles.caregiverBadge : styles.patientBadge,
            ]}
          >
            <Text
              style={[
                styles.roleBadgeText,
                isCaregiver ? styles.caregiverBadgeText : styles.patientBadgeText,
              ]}
            >
              ● {isCaregiver ? "Caregiver Account (Monitoring)" : "Primary Patient Account"}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Feedback Messages */}
          {successMessage && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✓ {successMessage}</Text>
            </View>
          )}

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {/* Section: Personal Information */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>👤 Personal Information</Text>

            {/* Full Name */}
            <Input
              label="Full Name"
              placeholder="Enter your full name"
              value={fullName}
              onChangeText={setFullName}
              editable={!isSaving}
            />

            {/* Email Address (Read-only) */}
            <View style={styles.readOnlyField}>
              <Text style={styles.fieldLabel}>Email Address</Text>
              <View style={styles.readOnlyInputRow}>
                <Text style={styles.readOnlyValue}>{user?.email || "Not set"}</Text>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>🔒 Verified</Text>
                </View>
              </View>
              <Text style={styles.helperText}>
                Email address is linked to your account identity and cannot be changed here.
              </Text>
            </View>

            {/* Phone Contact */}
            <Input
              label="Phone Number"
              placeholder="e.g. +1-555-0123"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              editable={!isSaving}
              helperText="Used for urgent notifications and account contact."
            />

            {/* Emergency Contact (Patient-specific) */}
            {!isCaregiver && (
              <Input
                label="Emergency Contact"
                placeholder="e.g. Dr. Smith / Family (+1-555-0199)"
                value={emergencyContact}
                onChangeText={setEmergencyContact}
                editable={!isSaving}
                helperText="Primary contact person or physician phone in case of missed doses."
              />
            )}
          </Card>

          {/* Section: Caregiver Monitoring Overview (Caregiver-specific) */}
          {isCaregiver && (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>👥 Monitored Patients</Text>
              {isLoadingStats ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={styles.monitoringSummaryRow}>
                  <View style={styles.monitoringStatBox}>
                    <Text style={styles.monitoringStatNumber}>{linkedPatients.length}</Text>
                    <Text style={styles.monitoringStatLabel}>
                      {linkedPatients.length === 1 ? "Active Patient" : "Active Patients"}
                    </Text>
                  </View>
                  <Text style={styles.monitoringNote}>
                    {linkedPatients.length > 0
                      ? `Monitoring adherence for: ${linkedPatients.map((p) => p.fullName).join(", ")}`
                      : "No active patients linked yet. Patients can connect you using your registered email."}
                  </Text>
                </View>
              )}
            </Card>
          )}

          {/* Section: Preferences & Security */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>⚙️ Preferences & Security</Text>

            {/* Patient Medication Reminder Toggle */}
            {!isCaregiver && (
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceTextContainer}>
                  <Text style={styles.preferenceTitle}>Medication Reminders</Text>
                  <Text style={styles.preferenceDescription}>
                    Local device alarms and sound notifications at scheduled intake times.
                  </Text>
                </View>
                {isTogglingReminder ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={remindersEnabled}
                    onValueChange={handleToggleReminders}
                    trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
                    thumbColor={remindersEnabled ? colors.primaryDark : colors.surfaceSubtle}
                    accessibilityLabel="Toggle medication reminder alarms"
                  />
                )}
              </View>
            )}

            {/* Change Password Button */}
            <View style={styles.securityRow}>
              <View style={styles.securityTextContainer}>
                <Text style={styles.preferenceTitle}>Account Security</Text>
                <Text style={styles.preferenceDescription}>
                  Update your password regularly to keep your health data secure.
                </Text>
              </View>
              <Button
                title="Change Password"
                onPress={() => setIsPasswordModalVisible(true)}
                variant="outline"
                style={styles.changePasswordButton}
              />
            </View>
          </Card>

          {/* Action Buttons: Save Changes & Cancel */}
          <View style={styles.actionRow}>
            <Button
              title="Cancel"
              onPress={handleCancel}
              variant="outline"
              disabled={isSaving}
              style={styles.cancelButton}
            />
            <Button
              title={isSaving ? "Saving..." : "Save Changes"}
              onPress={handleSave}
              variant="primary"
              loading={isSaving}
              style={styles.saveButton}
            />
          </View>

          {/* Sign Out Button */}
          <Button
            title="Sign Out"
            onPress={handleLogout}
            variant="danger"
            style={styles.logoutButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Change Password Modal */}
      <ChangePasswordModal
        visible={isPasswordModalVisible}
        onClose={() => setIsPasswordModalVisible(false)}
        onSuccess={() => {
          setSuccessMessage("Password updated successfully.");
          setTimeout(() => setSuccessMessage(null), 3000);
        }}
      />
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
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop:
      Platform.OS === "android"
        ? (StatusBar.currentHeight || 24) + spacing.md
        : spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  backButtonText: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: "700",
  },
  headerContent: {
    alignItems: "center",
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarText: {
    ...typography.h1,
    color: colors.textInverse,
    fontWeight: "800",
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textInverse,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  roleBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  patientBadge: {
    backgroundColor: colors.primaryLight,
  },
  caregiverBadge: {
    backgroundColor: colors.secondaryLight,
  },
  roleBadgeText: {
    ...typography.caption,
    fontWeight: "700",
  },
  patientBadgeText: {
    color: colors.primaryDark,
  },
  caregiverBadgeText: {
    color: colors.secondaryDark,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  successBox: {
    backgroundColor: colors.takenLight,
    borderWidth: 1,
    borderColor: colors.taken,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.taken,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.error,
  },
  card: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  readOnlyField: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  readOnlyInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  readOnlyValue: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: "600",
    flex: 1,
  },
  verifiedBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  verifiedText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  helperText: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  monitoringSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  monitoringStatBox: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 80,
  },
  monitoringStatNumber: {
    ...typography.h2,
    color: colors.primaryDark,
    fontWeight: "800",
  },
  monitoringStatLabel: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: "600",
  },
  monitoringNote: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  preferenceTextContainer: {
    flex: 1,
    paddingRight: spacing.md,
  },
  preferenceTitle: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  preferenceDescription: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  securityRow: {
    paddingVertical: spacing.sm,
  },
  securityTextContainer: {
    marginBottom: spacing.sm,
  },
  changePasswordButton: {
    alignSelf: "flex-start",
    minWidth: 160,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1.5,
  },
  logoutButton: {
    marginBottom: spacing.lg,
  },
});
