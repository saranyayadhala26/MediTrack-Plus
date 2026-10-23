/**
 * Profile Screen for MediTrack+
 * Redesigned to match Page 19 of ui.pdf.
 *
 * Visual Structure:
 * 1. Screen Header: "Profile", subtitle "Manage your account and app settings."
 * 2. Account Header Card: Avatar with initials, Full Name, Email, Verified badge, "Edit Profile" pill button.
 * 3. Personal Information: Display rows for Full Name, Email, Phone Number (and Emergency Contact).
 *    Includes toggleable in-place edit mode preserving full profile updates.
 * 4. Account Section: Edit Profile and Change Password rows with icons and chevrons.
 * 5. Medication & Reminders Section: Medication Reminders switch, Test Alarm button, and NotificationStatusCard.
 * 6. Safety & Support Section: Emergency Contact and Caregiver Management rows.
 * 7. Sign Out: Red action button at bottom invoking existing handleLogout().
 *
 * Preserves 100% of existing authentication, profile persistence, notification preferences,
 * password management, and caregiver integration.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getLinkedPatients } from "../../api/caregivers";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { notificationService } from "../../services/notificationService";
import { NotificationStatusCard } from "../../components/notifications/NotificationStatusCard";
import { config } from "../../constants/config";
import { LinkedPatient } from "../../types";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { NotificationPreferencesView } from "./NotificationPreferencesView";
import { EmergencyContactView } from "./EmergencyContactView";
import { CaregiverManagementView } from "./CaregiverManagementView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InlineError, InlineSuccess } from "../../components/common";

interface ProfileScreenProps {
  onBack: () => void;
}

/**
 * Generate 1-2 letter uppercase initials from full name
 */
const getInitials = (name?: string): string => {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack }) => {
  const { user, updateProfile, logout } = useAuth();
  const isCaregiver = user?.role === "caregiver";

  // Safe area insets handling (guarantees header begins below system status bar)
  let insetsTop = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
  } catch {
    insetsTop = 0;
  }
  const statusBarHeight = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

  // Form state
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [emergencyContact, setEmergencyContact] = useState(user?.emergencyContact || "");

  // Notification preference state
  const [remindersEnabled, setRemindersEnabled] = useState(
    user?.notificationPreferences?.medicationRemindersEnabled !== false
  );
  const [isTogglingReminder, setIsTogglingReminder] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Caregiver stats
  const [linkedPatients, setLinkedPatients] = useState<LinkedPatient[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // UI state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isNotificationStatusOpen, setIsNotificationStatusOpen] = useState(false);
  const [isNotificationPreferencesOpen, setIsNotificationPreferencesOpen] = useState(false);
  const [isEmergencyContactOpen, setIsEmergencyContactOpen] = useState(false);
  const [isCaregiverManagementOpen, setIsCaregiverManagementOpen] = useState(false);

  // Handle Android hardware back press for Emergency Contact, Caregiver Management, Notification Preferences, Notification Status view, Edit Profile, and Change Password
  useEffect(() => {
    const onBackPress = () => {
      if (isEmergencyContactOpen) {
        setIsEmergencyContactOpen(false);
        return true;
      }
      if (isCaregiverManagementOpen) {
        setIsCaregiverManagementOpen(false);
        return true;
      }
      if (isNotificationPreferencesOpen) {
        setIsNotificationPreferencesOpen(false);
        return true;
      }
      if (isNotificationStatusOpen) {
        setIsNotificationStatusOpen(false);
        return true;
      }
      if (isEditing) {
        handleCancel();
        return true;
      }
      if (isChangePasswordOpen) {
        setIsChangePasswordOpen(false);
        return true;
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => {
      backSubscription.remove();
    };
  }, [
    isEmergencyContactOpen,
    isCaregiverManagementOpen,
    isNotificationPreferencesOpen,
    isNotificationStatusOpen,
    isEditing,
    isChangePasswordOpen,
  ]);

  // Synchronize form when user updates
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || "");
      setPhone(user.phone || "");
      setEmergencyContact(user.emergencyContact || "");
      setRemindersEnabled(
        user.notificationPreferences?.medicationRemindersEnabled !== false
      );
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
        await notificationService.autoSync({ force: true, remindersEnabled: false });
        setSuccessMessage("Medication reminder alarms paused. Existing schedules remain saved.");
      } else {
        // Enabled: reconcile active schedules with notification service
        await notificationService.autoSync({ force: true, remindersEnabled: true });
        setSuccessMessage("Medication reminder alarms enabled and synchronized.");
      }

      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Could not update notification setting.");
    } finally {
      setIsTogglingReminder(false);
    }
  };

  const handleSendTestAlert = async () => {
    setIsSendingTest(true);
    try {
      await notificationService.sendTestReminder();
      Alert.alert(
        "Test Alarm Scheduled",
        "A test notification will trigger in 3 seconds. Lock your phone or leave the screen on to verify the sound and alert.",
        [{ text: "OK" }]
      );
    } catch {
      Alert.alert("Error", "Failed to schedule test reminder.");
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleNotificationPreferencesPress = () => {
    Alert.alert(
      "Notification Preferences",
      `Medication reminder alarms are currently ${
        remindersEnabled ? "enabled" : "paused"
      }.`,
      [
        {
          text: remindersEnabled ? "Pause Reminders" : "Enable Reminders",
          onPress: () => handleToggleReminders(!remindersEnabled),
        },
        {
          text: "Send Test Alarm",
          onPress: () => handleSendTestAlert(),
        },
        { text: "Close", style: "cancel" },
      ]
    );
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
  const handleSave = async (): Promise<boolean> => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validate()) return false;

    setIsSaving(true);
    try {
      const payload: any = {
        fullName: fullName.trim(),
        phone: phone.trim() ? phone.trim() : null,
      };

      if (!isCaregiver) {
        payload.emergencyContact = emergencyContact.trim()
          ? emergencyContact.trim()
          : null;
      }

      const res = await updateProfile(payload);
      if (res.success) {
        setSuccessMessage("Profile updated successfully!");
        setTimeout(() => setSuccessMessage(null), 3000);
        return true;
      } else {
        setErrorMessage(res.error || "Failed to save profile changes.");
        return false;
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error while updating profile.");
      return false;
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
    setIsEditing(false);
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

  // Dedicated sub-view for Notification Status (Matching Page 20)
  if (isNotificationStatusOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* Screen Header Bar */}
        <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setIsNotificationStatusOpen(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back to Profile"
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.screenTitle}>Notification Status</Text>
            <Text style={styles.screenSubtitle}>
              Make sure your medication reminders work reliably.
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <NotificationStatusCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Dedicated sub-view for Notification Preferences (Matching Page 16)
  if (isNotificationPreferencesOpen) {
    return (
      <NotificationPreferencesView
        onBack={() => setIsNotificationPreferencesOpen(false)}
        onOpenNotificationStatus={() => {
          setIsNotificationPreferencesOpen(false);
          setIsNotificationStatusOpen(true);
        }}
        remindersEnabled={remindersEnabled}
        onToggleReminders={handleToggleReminders}
        isTogglingReminders={isTogglingReminder}
        isCaregiver={isCaregiver}
      />
    );
  }

  // Dedicated sub-view for Edit Profile (Matching Page 18)
  if (isEditing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* Screen Header Bar */}
        <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleCancel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back to Profile"
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.screenTitle}>Edit Profile</Text>
            <Text style={styles.screenSubtitle}>
              Update your personal information.
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardContainer}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Feedback Banners */}
            {errorMessage ? (
              <InlineError
                title={errorMessage}
                onDismiss={() => setErrorMessage(null)}
              />
            ) : null}

            {/* Profile Photo Area */}
            <View style={styles.editPhotoSection}>
              <View style={styles.editAvatarWrapper}>
                <View style={styles.editAvatarCircle}>
                  <Text style={styles.editAvatarText}>
                    {getInitials(user?.fullName)}
                  </Text>
                </View>
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.changePhotoBtn}
                accessibilityRole="button"
                accessibilityLabel="Change Photo"
                onPress={() => {
                  Alert.alert(
                    "Profile Photo",
                    "Profile photo upload is currently not supported."
                  );
                }}
              >
                <Text style={styles.changePhotoText}>Change Photo</Text>
              </TouchableOpacity>
            </View>

            {/* Personal Information Section */}
            <View style={styles.editSectionHeader}>
              <Text style={styles.editSectionTitle}>Personal Information</Text>
              <Text style={styles.editSectionSubtitle}>
                Update your personal information.
              </Text>
            </View>

            {/* Field 1: Full Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <View style={styles.fieldInputContainer}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color="#0D9488"
                  style={styles.fieldIcon}
                />
                <TextInput
                  style={styles.fieldTextInput}
                  value={fullName}
                  onChangeText={(val) => {
                    setFullName(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter full name"
                  placeholderTextColor="#94A3B8"
                  editable={!isSaving}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Field 2: Email (READ ONLY) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View
                style={[
                  styles.fieldInputContainer,
                  styles.fieldInputDisabled,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color="#94A3B8"
                  style={styles.fieldIcon}
                />
                <TextInput
                  style={[styles.fieldTextInput, styles.fieldTextInputDisabled]}
                  value={user?.email || ""}
                  editable={false}
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <Text style={styles.fieldHelperText}>
                Email cannot be changed here.
              </Text>
            </View>

            {/* Field 3: Phone Number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <View
                style={[
                  styles.fieldInputContainer,
                  styles.fieldInputActive,
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={18}
                  color="#0D9488"
                  style={styles.fieldIcon}
                />
                <TextInput
                  style={styles.fieldTextInput}
                  value={phone}
                  onChangeText={(val) => {
                    setPhone(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  editable={!isSaving}
                />
              </View>
            </View>

            {/* Field 4: Country Code (Display/UI-only) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Country Code</Text>
              <View style={[styles.fieldInputContainer, styles.countryCodeBox]}>
                <Text style={styles.countryCodeText}>India (+91)</Text>
                <Ionicons name="chevron-down" size={18} color="#0D9488" />
              </View>
            </View>

            {/* Save Changes Button */}
            <TouchableOpacity
              style={[
                styles.saveChangesBtn,
                isSaving && styles.btnDisabled,
              ]}
              onPress={async () => {
                const saved = await handleSave();
                if (saved) {
                  setIsEditing(false);
                }
              }}
              disabled={isSaving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Save Changes"
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveChangesBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Dedicated sub-view for Emergency Contact (Matching Page 15)
  if (isEmergencyContactOpen) {
    return (
      <EmergencyContactView
        onBack={() => setIsEmergencyContactOpen(false)}
        onSuccess={() => {
          setIsEmergencyContactOpen(false);
          setSuccessMessage("Emergency contact updated successfully.");
          setTimeout(() => setSuccessMessage(null), 3000);
        }}
        isCaregiver={isCaregiver}
      />
    );
  }

  // Dedicated sub-view for Caregiver Management (Matching Page 14 & Page 13)
  if (isCaregiverManagementOpen) {
    return (
      <CaregiverManagementView
        onBack={() => setIsCaregiverManagementOpen(false)}
        isCaregiver={isCaregiver}
      />
    );
  }

  // Dedicated sub-view for Change Password (Matching Page 17)
  if (isChangePasswordOpen) {
    return (
      <ChangePasswordModal
        onBack={() => setIsChangePasswordOpen(false)}
        onSuccess={() => {
          setIsChangePasswordOpen(false);
          setSuccessMessage("Password updated successfully.");
          setTimeout(() => setSuccessMessage(null), 3000);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header Bar */}
      <View style={[styles.topHeaderBar, { paddingTop: topInset + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.screenTitle}>Profile</Text>
          <Text style={styles.screenSubtitle}>
            Manage your account and app settings.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Feedback Banners */}
          {successMessage ? (
            <InlineSuccess
              variant="saved"
              title={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}

          {errorMessage ? (
            <InlineError
              title={errorMessage}
              onDismiss={() => setErrorMessage(null)}
            />
          ) : null}

          {/* ============================================================== */}
          {/* 1. ACCOUNT HEADER CARD (Page 19)                               */}
          {/* ============================================================== */}
          <View style={styles.accountHeaderCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {getInitials(user?.fullName)}
              </Text>
            </View>

            <View style={styles.accountInfoCol}>
              <Text style={styles.accountNameText}>
                {user?.fullName || "Saranya"}
              </Text>
              <Text style={styles.accountEmailText} numberOfLines={1}>
                {user?.email || "saranyayadhala@gmail.com"}
              </Text>
              <View
                style={[
                  styles.roleBadge,
                  isCaregiver ? styles.roleBadgeCaregiver : styles.roleBadgePatient,
                ]}
              >
                <Text
                  style={[
                    styles.roleBadgeText,
                    isCaregiver
                      ? styles.roleBadgeTextCaregiver
                      : styles.roleBadgeTextPatient,
                  ]}
                >
                  {isCaregiver ? "Caregiver Account" : "Primary Patient Account"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editPillBtn}
              onPress={() => setIsEditing(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit Profile"
            >
              <Ionicons
                name="pencil"
                size={13}
                color="#0D9488"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.editPillBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>

          {/* ============================================================== */}
          {/* 2. PERSONAL INFORMATION (Page 19 Display)                      */}
          {/* ============================================================== */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
          </View>

          <View style={styles.sectionCard}>
            {/* Full Name Row */}
            <View style={styles.displayRow}>
              <View style={styles.rowIconCircle}>
                <Ionicons name="person-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.displayTextCol}>
                <Text style={styles.displayLabel}>Full Name</Text>
                <Text style={styles.displayValue}>
                  {user?.fullName || "Not provided"}
                </Text>
              </View>
            </View>

            <View style={styles.rowDivider} />

            {/* Email Address Row */}
            <View style={styles.displayRow}>
              <View style={styles.rowIconCircle}>
                <Ionicons name="mail-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.displayTextCol}>
                <Text style={styles.displayLabel}>Email</Text>
                <Text style={styles.displayValue}>
                  {user?.email || "Not provided"}
                </Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color="#15803D"
                  style={{ marginRight: 3 }}
                />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            </View>

            <View style={styles.rowDivider} />

            {/* Phone Number Row */}
            <View style={styles.displayRow}>
              <View style={styles.rowIconCircle}>
                <Ionicons name="call-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.displayTextCol}>
                <Text style={styles.displayLabel}>Phone Number</Text>
                <Text style={styles.displayValue}>
                  {user?.phone || "Not provided"}
                </Text>
              </View>
            </View>
          </View>

          {/* ============================================================== */}
          {/* 3. ACCOUNT SECTION (Page 19)                                   */}
          {/* ============================================================== */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account</Text>
          </View>

          <View style={styles.sectionCard}>
            {/* Edit Profile Row */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsEditing(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit Profile"
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="person-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.navTextCol}>
                <Text style={styles.navRowTitle}>Edit Profile</Text>
                <Text style={styles.navRowSubtitle}>
                  Update your personal information
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Change Password Row */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsChangePasswordOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Change Password"
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="lock-closed-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.navTextCol}>
                <Text style={styles.navRowTitle}>Change Password</Text>
                <Text style={styles.navRowSubtitle}>
                  Update your account password
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* ============================================================== */}
          {/* 4. MEDICATION & REMINDERS SECTION (Page 19)                    */}
          {/* ============================================================== */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Medication & Reminders</Text>
          </View>

          <View style={styles.sectionCard}>
            {/* Notification Preferences Row */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsNotificationPreferencesOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Notification Preferences"
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="notifications-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.navTextCol}>
                <Text style={styles.navRowTitle}>Notification Preferences</Text>
                <Text style={styles.navRowSubtitle}>
                  Customize medication reminder settings
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Notification Status Row */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsNotificationStatusOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Notification Status"
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="settings-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.navTextCol}>
                <Text style={styles.navRowTitle}>Notification Status</Text>
                <Text style={styles.navRowSubtitle}>
                  Check whether medication reminders are working
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* ============================================================== */}
          {/* 5. SAFETY & SUPPORT SECTION (Page 19)                          */}
          {/* ============================================================== */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Safety & Support</Text>
          </View>

          <View style={styles.sectionCard}>
            {/* Emergency Contact Row */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsEmergencyContactOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Emergency Contact"
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="medical-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.navTextCol}>
                <Text style={styles.navRowTitle}>Emergency Contact</Text>
                <Text style={styles.navRowSubtitle}>
                  Manage your emergency contact
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Caregiver Management Row */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => setIsCaregiverManagementOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Caregiver Management"
            >
              <View style={styles.rowIconCircle}>
                <Ionicons name="people-outline" size={18} color="#0D9488" />
              </View>
              <View style={styles.navTextCol}>
                <Text style={styles.navRowTitle}>Caregiver Management</Text>
                <Text style={styles.navRowSubtitle}>
                  {isCaregiver
                    ? isLoadingStats
                      ? "Loading monitored patients..."
                      : `${linkedPatients.length} active patient${
                          linkedPatients.length === 1 ? "" : "s"
                        } monitored`
                    : "Manage your connected caregiver"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* ============================================================== */}
          {/* 6. LOG OUT ACTION (Page 19 Bottom)                             */}
          {/* ============================================================== */}
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Log Out"
          >
            <Ionicons
              name="log-out-outline"
              size={18}
              color="#EF4444"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ============================================================== */}
      {/* 7. FIXED BOTTOM NAVIGATION BAR (Page 19)                       */}
      {/* ============================================================== */}
      <View style={styles.bottomTabBar}>
        {isCaregiver ? (
          <>
            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={onBack}
              accessibilityRole="tab"
              accessibilityLabel="Patients Dashboard Tab"
            >
              <Ionicons name="people-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Patients</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={onBack}
              accessibilityRole="tab"
              accessibilityLabel="Alerts Tab"
            >
              <Ionicons name="notifications-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Alerts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              activeOpacity={1}
              accessibilityRole="tab"
              accessibilityState={{ selected: true }}
              accessibilityLabel="Profile Tab"
            >
              <Ionicons name="person" size={22} color="#0D9488" />
              <Text style={[styles.bottomTabLabel, styles.bottomTabLabelActive]}>
                Profile
              </Text>
              <View style={styles.activeTabIndicator} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={onBack}
              accessibilityRole="tab"
              accessibilityLabel="Home Tab"
            >
              <Ionicons name="home-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={onBack}
              accessibilityRole="tab"
              accessibilityLabel="Medicines Tab"
            >
              <Ionicons name="medkit-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Medicines</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={onBack}
              accessibilityRole="tab"
              accessibilityLabel="Calendar Tab"
            >
              <Ionicons name="calendar-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Calendar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              activeOpacity={1}
              accessibilityRole="tab"
              accessibilityState={{ selected: true }}
              accessibilityLabel="Profile Tab"
            >
              <Ionicons name="person" size={22} color="#0D9488" />
              <Text style={[styles.bottomTabLabel, styles.bottomTabLabelActive]}>
                Profile
              </Text>
              <View style={styles.activeTabIndicator} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  keyboardContainer: {
    flex: 1,
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 10 : 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  screenSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },

  /* Banners */
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#15803D",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
    flex: 1,
  },

  /* 1. Account Header Card */
  accountHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0D9488",
  },
  accountInfoCol: {
    flex: 1,
  },
  accountNameText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  accountEmailText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  roleBadgePatient: {
    backgroundColor: "#CCFBF1",
  },
  roleBadgeCaregiver: {
    backgroundColor: "#FEF3C7",
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  roleBadgeTextPatient: {
    color: "#0D9488",
  },
  roleBadgeTextCaregiver: {
    color: "#92400E",
  },
  editPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editPillBtnActive: {
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  editPillBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D9488",
  },
  editPillBtnTextActive: {
    color: "#64748B",
  },

  /* Sections */
  sectionHeader: {
    marginBottom: 8,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },

  /* Display Rows */
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
  },
  rowIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  displayTextCol: {
    flex: 1,
  },
  displayLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  displayValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },

  /* Navigation Rows */
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
  },
  navTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  navRowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  navRowSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  testBadge: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  testBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D9488",
  },

  /* Edit Profile Specific Styles (Page 18) */
  editPhotoSection: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  editAvatarWrapper: {
    position: "relative",
    width: 88,
    height: 88,
  },
  editAvatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  editAvatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0D9488",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0D9488",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoBtn: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D9488",
  },
  editSectionHeader: {
    marginBottom: 16,
  },
  editSectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  editSectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  fieldInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  fieldInputActive: {
    borderColor: "#0D9488",
  },
  fieldInputDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldTextInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    height: "100%",
  },
  fieldTextInputDisabled: {
    color: "#64748B",
  },
  fieldHelperText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  countryCodeBox: {
    justifyContent: "space-between",
  },
  countryCodeText: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
  },
  saveChangesBtn: {
    backgroundColor: "#0D9488",
    borderRadius: 14,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  saveChangesBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  /* Disclaimer Box */
  disclaimerBox: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    alignItems: "flex-start",
  },
  disclaimerText: {
    fontSize: 11,
    color: "#64748B",
    lineHeight: 16,
    flex: 1,
  },

  /* Log Out Button */
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    height: 48,
    marginTop: 4,
    marginBottom: 16,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#EF4444",
  },

  /* Fixed Bottom Tab Bar (Page 19) */
  bottomTabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1.5,
    borderTopColor: "#E2E8F0",
    paddingVertical: 6,
    paddingHorizontal: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  bottomTabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    minHeight: 48,
  },
  bottomTabLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
    color: "#94A3B8",
  },
  bottomTabLabelActive: {
    color: "#0D9488",
    fontWeight: "700",
  },
  activeTabIndicator: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#0D9488",
    marginTop: 3,
  },

  btnDisabled: {
    opacity: 0.6,
  },
});
