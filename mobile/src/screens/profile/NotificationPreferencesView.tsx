/**
 * Notification Preferences View for MediTrack+
 * Matches PDF Page 16 / 33 with complete backend persistence.
 *
 * Supported settings:
 * 1. Medication Reminders (Master & Daily Reminder Switch)
 * 2. Reminder Sound (soundEnabled)
 * 3. Reminder Vibration (vibrationEnabled)
 * 4. Missed Medication Alerts (missedDoseAlertsEnabled)
 * 5. Email Notifications (emailNotificationsEnabled)
 * 6. Adherence Summary Email Reports (emailReportsEnabled)
 * 7. Caregiver Missed-Dose Email Alerts (emailAlertsEnabled)
 *
 * All settings persist to backend PUT /auth/notification-preferences.
 * Toggling medication reminders coordinates directly with notificationService.autoSync.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiClient } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { notificationService } from "../../services/notificationService";

export interface NotificationPreferencesViewProps {
  onBack: () => void;
  onOpenNotificationStatus: () => void;
  remindersEnabled?: boolean;
  onToggleReminders?: (newValue: boolean) => Promise<void> | void;
  isTogglingReminders?: boolean;
  isCaregiver?: boolean;
}

export const NotificationPreferencesView: React.FC<
  NotificationPreferencesViewProps
> = ({
  onBack,
  onOpenNotificationStatus,
  remindersEnabled: initialRemindersEnabled,
  onToggleReminders,
  isTogglingReminders = false,
  isCaregiver = false,
}) => {
  const { user, refreshProfile } = useAuth();
  const userPrefs = user?.notificationPreferences || {};

  // Safe area insets handling
  let insetsTop = 0;
  try {
    const insets = useSafeAreaInsets();
    insetsTop = insets?.top || 0;
  } catch {
    insetsTop = 0;
  }
  const statusBarHeight = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0;
  const topInset = Math.max(insetsTop, statusBarHeight);

  // Form states persisted to backend
  const [remindersEnabled, setRemindersEnabled] = useState(
    initialRemindersEnabled !== undefined
      ? initialRemindersEnabled
      : userPrefs.medicationRemindersEnabled !== false
  );
  const [soundEnabled, setSoundEnabled] = useState(
    userPrefs.soundEnabled !== false
  );
  const [vibrationEnabled, setVibrationEnabled] = useState(
    userPrefs.vibrationEnabled !== false
  );
  const [missedDoseEnabled, setMissedDoseEnabled] = useState(
    userPrefs.missedDoseAlertsEnabled !== false
  );
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(
    userPrefs.emailNotificationsEnabled !== false
  );
  const [emailReportsEnabled, setEmailReportsEnabled] = useState(
    userPrefs.emailReportsEnabled === true
  );
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(
    userPrefs.emailAlertsEnabled === true
  );

  // Status & feedback
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Synchronize state when user object updates
  useEffect(() => {
    if (user?.notificationPreferences) {
      const p = user.notificationPreferences;
      if (initialRemindersEnabled === undefined) {
        setRemindersEnabled(p.medicationRemindersEnabled !== false);
      }
      setSoundEnabled(p.soundEnabled !== false);
      setVibrationEnabled(p.vibrationEnabled !== false);
      setMissedDoseEnabled(p.missedDoseAlertsEnabled !== false);
      setEmailNotificationsEnabled(p.emailNotificationsEnabled !== false);
      setEmailReportsEnabled(p.emailReportsEnabled === true);
      setEmailAlertsEnabled(p.emailAlertsEnabled === true);
    }
  }, [user]);

  // Persist preference updates to backend API
  const handlePreferenceChange = async (key: string, newValue: boolean) => {
    setSavingKey(key);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Optimistically update local state
    if (key === "medicationRemindersEnabled") setRemindersEnabled(newValue);
    else if (key === "soundEnabled") setSoundEnabled(newValue);
    else if (key === "vibrationEnabled") setVibrationEnabled(newValue);
    else if (key === "missedDoseAlertsEnabled") setMissedDoseEnabled(newValue);
    else if (key === "emailNotificationsEnabled") setEmailNotificationsEnabled(newValue);
    else if (key === "emailReportsEnabled") setEmailReportsEnabled(newValue);
    else if (key === "emailAlertsEnabled") setEmailAlertsEnabled(newValue);

    try {
      await apiClient.put("/auth/notification-preferences", {
        [key]: newValue,
      });
      await refreshProfile();

      if (key === "medicationRemindersEnabled") {
        if (!newValue) {
          await notificationService.autoSync({ force: true, remindersEnabled: false });
          setSuccessMessage("Medication reminders paused.");
        } else {
          await notificationService.autoSync({ force: true, remindersEnabled: true });
          setSuccessMessage("Medication reminders synchronized.");
        }
        if (onToggleReminders) {
          await onToggleReminders(newValue);
        }
      } else {
        setSuccessMessage("Preferences saved.");
      }
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      // Revert on error
      if (key === "medicationRemindersEnabled") setRemindersEnabled(!newValue);
      else if (key === "soundEnabled") setSoundEnabled(!newValue);
      else if (key === "vibrationEnabled") setVibrationEnabled(!newValue);
      else if (key === "missedDoseAlertsEnabled") setMissedDoseEnabled(!newValue);
      else if (key === "emailNotificationsEnabled") setEmailNotificationsEnabled(!newValue);
      else if (key === "emailReportsEnabled") setEmailReportsEnabled(!newValue);
      else if (key === "emailAlertsEnabled") setEmailAlertsEnabled(!newValue);

      const msg = err.response?.data?.detail || "Failed to update notification settings.";
      setErrorMessage(typeof msg === "string" ? msg : JSON.stringify(msg));
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setSavingKey(null);
    }
  };

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
          accessibilityLabel="Back to Profile"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.screenTitle}>Notification Preferences</Text>
          <Text style={styles.screenSubtitle}>
            Customize how MediTrack+ reminds you.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Feedback Banners */}
        {successMessage && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#15803D" style={{ marginRight: 6 }} />
            <Text style={styles.successBannerText}>{successMessage}</Text>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 6 }} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        {/* ============================================================== */}
        {/* 1. SECTION 1 — MEDICATION NOTIFICATIONS (Master Control)       */}
        {/* ============================================================== */}
        <View style={styles.sectionCard}>
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="notifications-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Medication Notifications</Text>
              <Text style={styles.rowSubtitle}>
                Allow MediTrack+ to send medication reminders and important notifications.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {isTogglingReminders || savingKey === "medicationRemindersEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={remindersEnabled}
                  onValueChange={(val) => handlePreferenceChange("medicationRemindersEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Medication Notifications"
                />
              )}
            </View>
          </View>
        </View>

        {/* ============================================================== */}
        {/* 2. SECTION 2 — MEDICATION REMINDERS                            */}
        {/* ============================================================== */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Medication Reminders</Text>
        </View>

        <View style={styles.sectionCard}>
          {/* Row 2.1: Medication Reminders */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="medical-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Medication Reminders</Text>
              <Text style={styles.rowSubtitle}>
                Receive reminders when it's time to take your medicine.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {savingKey === "medicationRemindersEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={remindersEnabled}
                  onValueChange={(val) => handlePreferenceChange("medicationRemindersEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Medication Reminders"
                />
              )}
            </View>
          </View>

          <View style={styles.rowDivider} />

          {/* Row 2.2: Reminder Sound */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="volume-high-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Reminder Sound</Text>
              <Text style={styles.rowSubtitle}>
                Play a sound when a medication reminder appears.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {savingKey === "soundEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={soundEnabled}
                  onValueChange={(val) => handlePreferenceChange("soundEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Reminder Sound"
                />
              )}
            </View>
          </View>

          <View style={styles.rowDivider} />

          {/* Row 2.3: Vibration */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="phone-portrait-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Vibration</Text>
              <Text style={styles.rowSubtitle}>
                Vibrate when a medication reminder appears.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {savingKey === "vibrationEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={vibrationEnabled}
                  onValueChange={(val) => handlePreferenceChange("vibrationEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Vibration"
                />
              )}
            </View>
          </View>
        </View>

        {/* ============================================================== */}
        {/* 3. SECTION 3 — IMPORTANT NOTIFICATIONS                         */}
        {/* ============================================================== */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Important Notifications</Text>
        </View>

        <View style={styles.sectionCard}>
          {/* Row 3.1: Missed Dose Alerts */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="alert-circle-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Missed Dose Alerts</Text>
              <Text style={styles.rowSubtitle}>
                Get notified when a scheduled dose is missed.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {savingKey === "missedDoseAlertsEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={missedDoseEnabled}
                  onValueChange={(val) => handlePreferenceChange("missedDoseAlertsEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Missed Dose Alerts"
                />
              )}
            </View>
          </View>

          <View style={styles.rowDivider} />

          {/* Row 3.2: Email Notifications */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="mail-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Email Notifications</Text>
              <Text style={styles.rowSubtitle}>
                Receive account and security notices via email.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {savingKey === "emailNotificationsEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={emailNotificationsEnabled}
                  onValueChange={(val) => handlePreferenceChange("emailNotificationsEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Email Notifications"
                />
              )}
            </View>
          </View>

          <View style={styles.rowDivider} />

          {/* Row 3.3: Email Reports */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="document-text-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Email Adherence Reports</Text>
              <Text style={styles.rowSubtitle}>
                Receive scheduled weekly/monthly summary reports.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {savingKey === "emailReportsEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={emailReportsEnabled}
                  onValueChange={(val) => handlePreferenceChange("emailReportsEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Email Reports"
                />
              )}
            </View>
          </View>

          <View style={styles.rowDivider} />

          {/* Row 3.4: Caregiver Email Alerts */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="people-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Caregiver Missed-Dose Alerts</Text>
              <Text style={styles.rowSubtitle}>
                Receive critical patient missed-dose alerts via registered email.
              </Text>
            </View>
            <View style={styles.switchWrapper}>
              {savingKey === "emailAlertsEnabled" ? (
                <ActivityIndicator size="small" color="#0D9488" />
              ) : (
                <Switch
                  value={emailAlertsEnabled}
                  onValueChange={(val) => handlePreferenceChange("emailAlertsEnabled", val)}
                  trackColor={{ false: "#E2E8F0", true: "#0D9488" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E2E8F0"
                  accessibilityLabel="Toggle Caregiver Alerts"
                />
              )}
            </View>
          </View>
        </View>

        {/* ============================================================== */}
        {/* 4. SECTION 4 — NOTIFICATION BEHAVIOUR                          */}
        {/* ============================================================== */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notification Behaviour</Text>
        </View>

        <View style={styles.sectionCard}>
          {/* Row 4.1: Reminder Sound */}
          <View style={styles.rowContent}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="musical-notes-outline" size={18} color="#0D9488" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Reminder Sound</Text>
              <Text style={styles.rowSubtitle}>Default</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </View>
        </View>

        {/* ============================================================== */}
        {/* 5. DEVICE SETTINGS NOTICE & CHECK STATUS BUTTON                */}
        {/* ============================================================== */}
        <View style={styles.deviceNoticeCard}>
          <View style={styles.noticeLeftCol}>
            <Ionicons
              name="information-circle-outline"
              size={22}
              color="#0284C7"
              style={{ marginRight: 8, marginTop: 1 }}
            />
            <Text style={styles.noticeText}>
              Notification settings may also be affected by your device settings.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.checkStatusBtn}
            onPress={onOpenNotificationStatus}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Check Notification Status"
          >
            <Text style={styles.checkStatusBtnText}>Check Notification Status</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ============================================================== */}
      {/* 6. FIXED BOTTOM NAVIGATION BAR (Page 16)                       */}
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
              accessibilityLabel="Today Tab"
            >
              <Ionicons name="calendar-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Today</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={onBack}
              accessibilityRole="tab"
              accessibilityLabel="Medicines Tab"
            >
              <Ionicons name="medical-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Medicines</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomTabButton}
              onPress={onBack}
              accessibilityRole="tab"
              accessibilityLabel="Reports Tab"
            >
              <Ionicons name="document-text-outline" size={22} color="#94A3B8" />
              <Text style={styles.bottomTabLabel}>Reports</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  screenSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  successBannerText: {
    fontSize: 13,
    color: "#15803D",
    fontWeight: "600",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "600",
    flex: 1,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
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
    marginRight: 14,
  },
  rowTextCol: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 16,
  },
  switchWrapper: {
    justifyContent: "center",
    alignItems: "center",
    minWidth: 48,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  /* Device Notice Card */
  deviceNoticeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
    marginBottom: 16,
  },
  noticeLeftCol: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 10,
  },
  noticeText: {
    fontSize: 11,
    color: "#0369A1",
    lineHeight: 16,
    flex: 1,
    fontWeight: "500",
  },
  checkStatusBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#0D9488",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  checkStatusBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0D9488",
  },

  /* Fixed Bottom Tab Bar */
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
});
