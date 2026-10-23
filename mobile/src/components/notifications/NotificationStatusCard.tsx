/**
 * Notification Status Component (Phase 6 / Refined to match Page 20 of ui.pdf).
 *
 * Provides a clear, calm, and accessible overview of:
 * 1. Overall reminder readiness status
 * 2. Notification setup (Notifications Allowed, Exact alarms, Reminder sound, Vibration)
 * 3. Reminder preferences (Sound, Vibration)
 * 4. Educational device/battery restriction guidance
 * 5. Direct fix actions for missing OS permissions
 *
 * Preserves 100% of underlying permission detection, exact alarm checks,
 * synchronization listeners, and system settings navigation.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import {
  NotificationPermissionState,
  SyncStatus,
  notificationService,
} from "../../services/notificationService";

export const NotificationStatusCard: React.FC = () => {
  const { user } = useAuth();
  const remindersEnabled =
    user?.notificationPreferences?.medicationRemindersEnabled !== false;

  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    activeCount: 0,
    statusLabel: remindersEnabled ? "synchronized" : "disabled",
  });

  const refreshStatus = async (force: boolean = false) => {
    try {
      const perm = await notificationService.checkPermissions();
      setPermission(perm);
      const res = await notificationService.autoSync({ force, remindersEnabled });
      setScheduledCount(res.activeCount);
    } catch (err) {
      console.warn("Error refreshing notification status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Subscribe to notification service automatic sync status updates
    const unsubscribe = notificationService.addSyncStatusListener((status) => {
      setSyncStatus(status);
      setScheduledCount(status.activeCount);
    });

    refreshStatus(false);

    return () => {
      unsubscribe();
    };
  }, [remindersEnabled]);

  const handleRequestPermission = async () => {
    setIsLoading(true);
    try {
      const res = await notificationService.requestPermissions();
      setPermission(res);
      if (res.granted) {
        Alert.alert("Permission Granted", "Medication reminder alerts are now active.");
        await notificationService.autoSync({ force: true });
      } else {
        Alert.alert(
          "Permission Required",
          "Without notification permission, your device cannot sound alarms for prescribed medication intake times. Please enable notifications in device settings.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => notificationService.openSystemSettings(),
            },
          ]
        );
      }
    } catch {
      Alert.alert("Error", "Could not request notification permissions.");
    } finally {
      setIsLoading(false);
      refreshStatus(false);
    }
  };

  const isGranted = Boolean(permission?.granted);
  const isExactAlarmReady =
    Platform.OS !== "android" || Boolean(permission?.exactAlarmGranted);
  const isReady = isGranted && isExactAlarmReady && remindersEnabled;

  return (
    <View style={styles.container}>
      {/* ============================================================== */}
      {/* 1. OVERALL STATUS BANNER (Matching Page 20 Top)                 */}
      {/* ============================================================== */}
      {isLoading ? (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingBannerText}>
            Checking reminder configuration...
          </Text>
        </View>
      ) : isReady ? (
        <View style={styles.readyBanner}>
          <View style={styles.readyIconCircle}>
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.bannerTextCol}>
            <Text style={styles.readyBannerTitle}>Reminders are ready</Text>
            <Text style={styles.readyBannerSubtitle}>
              Your medication reminders are configured correctly and should work
              reliably.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.attentionBanner}>
          <View style={styles.attentionIconCircle}>
            <Ionicons name="alert" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.bannerTextCol}>
            <Text style={styles.attentionBannerTitle}>Action needed</Text>
            <Text style={styles.attentionBannerSubtitle}>
              {!isGranted
                ? "Notification permissions are required so you never miss a dose."
                : !isExactAlarmReady
                ? "Exact alarm access is needed to sound reminders when asleep."
                : "Reminders are currently paused in your preferences."}
            </Text>
          </View>
        </View>
      )}

      {/* ============================================================== */}
      {/* 2. NOTIFICATION SETUP SECTION (Matching Page 20 Middle)         */}
      {/* ============================================================== */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Notification setup</Text>
        <Text style={styles.sectionSubtitle}>
          These settings allow MediTrack+ to send you medication reminders on time.
        </Text>
      </View>

      <View style={styles.setupCard}>
        {/* Row 1: Notifications */}
        <TouchableOpacity
          style={styles.setupRow}
          onPress={isGranted ? undefined : handleRequestPermission}
          disabled={isGranted}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Notifications permission"
        >
          <View style={styles.setupIconCircle}>
            <Ionicons name="notifications-outline" size={20} color="#0D9488" />
          </View>
          <View style={styles.setupTextCol}>
            <Text style={styles.setupRowTitle}>Notifications</Text>
            <Text style={styles.setupRowSubtitle}>
              Allow MediTrack+ to send you reminders.
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              isGranted ? styles.pillSuccess : styles.pillWarning,
            ]}
          >
            <Ionicons
              name={isGranted ? "checkmark-circle" : "alert-circle"}
              size={13}
              color={isGranted ? "#15803D" : "#B45309"}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.statusPillText,
                isGranted ? styles.pillTextSuccess : styles.pillTextWarning,
              ]}
            >
              {isGranted ? "Allowed" : "Needed"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color="#94A3B8"
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        <View style={styles.rowDivider} />

        {/* Row 2: Exact alarms */}
        <TouchableOpacity
          style={styles.setupRow}
          onPress={
            Platform.OS === "android" && !permission?.exactAlarmGranted
              ? () => notificationService.openExactAlarmSettings()
              : undefined
          }
          disabled={
            Platform.OS !== "android" || Boolean(permission?.exactAlarmGranted)
          }
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Exact alarm permission"
        >
          <View style={styles.setupIconCircle}>
            <Ionicons name="alarm-outline" size={20} color="#0D9488" />
          </View>
          <View style={styles.setupTextCol}>
            <Text style={styles.setupRowTitle}>Exact alarms</Text>
            <Text style={styles.setupRowSubtitle}>
              Ensures reminders appear on time.
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              isExactAlarmReady ? styles.pillSuccess : styles.pillWarning,
            ]}
          >
            <Ionicons
              name={isExactAlarmReady ? "checkmark-circle" : "alert-circle"}
              size={13}
              color={isExactAlarmReady ? "#15803D" : "#B45309"}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.statusPillText,
                isExactAlarmReady ? styles.pillTextSuccess : styles.pillTextWarning,
              ]}
            >
              {isExactAlarmReady ? "Enabled" : "Needed"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color="#94A3B8"
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        <View style={styles.rowDivider} />

        {/* Row 3: Reminder sound */}
        <View style={styles.setupRow}>
          <View style={styles.setupIconCircle}>
            <Ionicons name="volume-high-outline" size={20} color="#0D9488" />
          </View>
          <View style={styles.setupTextCol}>
            <Text style={styles.setupRowTitle}>Reminder sound</Text>
            <Text style={styles.setupRowSubtitle}>
              Play a sound for medication reminders.
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              remindersEnabled ? styles.pillSuccess : styles.pillMuted,
            ]}
          >
            <Ionicons
              name={remindersEnabled ? "checkmark-circle" : "pause-circle"}
              size={13}
              color={remindersEnabled ? "#15803D" : "#64748B"}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.statusPillText,
                remindersEnabled ? styles.pillTextSuccess : styles.pillTextMuted,
              ]}
            >
              {remindersEnabled ? "Enabled" : "Paused"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color="#94A3B8"
            style={{ marginLeft: 6 }}
          />
        </View>

        <View style={styles.rowDivider} />

        {/* Row 4: Vibration */}
        <View style={styles.setupRow}>
          <View style={styles.setupIconCircle}>
            <MaterialCommunityIcons name="vibrate" size={20} color="#0D9488" />
          </View>
          <View style={styles.setupTextCol}>
            <Text style={styles.setupRowTitle}>Vibration</Text>
            <Text style={styles.setupRowSubtitle}>
              Vibrate for medication reminders.
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              remindersEnabled ? styles.pillSuccess : styles.pillMuted,
            ]}
          >
            <Ionicons
              name={remindersEnabled ? "checkmark-circle" : "pause-circle"}
              size={13}
              color={remindersEnabled ? "#15803D" : "#64748B"}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.statusPillText,
                remindersEnabled ? styles.pillTextSuccess : styles.pillTextMuted,
              ]}
            >
              {remindersEnabled ? "Enabled" : "Paused"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color="#94A3B8"
            style={{ marginLeft: 6 }}
          />
        </View>
      </View>

      {/* ============================================================== */}
      {/* 3. REMINDER PREFERENCES SECTION (Matching Page 20)             */}
      {/* ============================================================== */}
      <View style={[styles.sectionHeader, { marginTop: 22 }]}>
        <Text style={styles.sectionTitle}>Reminder preferences</Text>
        <Text style={styles.sectionSubtitle}>
          Adjust how you want to be notified.
        </Text>
      </View>

      <View style={styles.setupCard}>
        {/* Preference: Sound */}
        <View style={styles.setupRow}>
          <View style={styles.setupIconCircle}>
            <Ionicons name="volume-high-outline" size={20} color="#0D9488" />
          </View>
          <View style={styles.setupTextCol}>
            <Text style={styles.setupRowTitle}>Sound</Text>
            <Text style={styles.setupRowSubtitle}>
              Play a sound for medication reminders.
            </Text>
          </View>
          <Switch
            value={remindersEnabled}
            disabled={true}
            trackColor={{ false: "#E2E8F0", true: "#99F6E4" }}
            thumbColor={remindersEnabled ? "#0D9488" : "#94A3B8"}
            accessibilityLabel="Sound for medication reminders"
          />
        </View>

        <View style={styles.rowDivider} />

        {/* Preference: Vibration */}
        <View style={styles.setupRow}>
          <View style={styles.setupIconCircle}>
            <MaterialCommunityIcons name="vibrate" size={20} color="#0D9488" />
          </View>
          <View style={styles.setupTextCol}>
            <Text style={styles.setupRowTitle}>Vibration</Text>
            <Text style={styles.setupRowSubtitle}>
              Vibrate for medication reminders.
            </Text>
          </View>
          <Switch
            value={remindersEnabled}
            disabled={true}
            trackColor={{ false: "#E2E8F0", true: "#99F6E4" }}
            thumbColor={remindersEnabled ? "#0D9488" : "#94A3B8"}
            accessibilityLabel="Vibration for medication reminders"
          />
        </View>
      </View>

      {/* ============================================================== */}
      {/* 4. IMPORTANT ADVISORY (Battery / Device Restrictions)           */}
      {/* ============================================================== */}
      <View style={styles.infoCardContainer}>
        <View style={styles.infoIconCircle}>
          <Ionicons name="information-circle" size={24} color="#0284C7" />
        </View>
        <View style={styles.infoTextCol}>
          <Text style={styles.infoCardTitle}>Important</Text>
          <Text style={styles.infoCardMessage}>
            Battery saver or device restrictions may affect medication reminders. If
            you stop receiving reminders, please check your device settings.
          </Text>
          <TouchableOpacity
            onPress={() => notificationService.openSystemSettings()}
            style={styles.infoActionLink}
            accessibilityRole="button"
            accessibilityLabel="Check device settings"
          >
            <Text style={styles.infoActionLinkText}>Check Device Settings →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ============================================================== */}
      {/* 5. QUICK FIX ACTIONS (When OS Permission is missing)           */}
      {/* ============================================================== */}
      {!isGranted && (
        <View style={styles.fixActionCard}>
          <Text style={styles.fixActionTitle}>⚠️ Enable Notifications</Text>
          <Text style={styles.fixActionSubtitle}>
            Device notification permissions are required to sound alarms for
            scheduled doses when the app is closed.
          </Text>
          <View style={styles.fixActionButtonsRow}>
            <TouchableOpacity
              style={styles.fixPrimaryBtn}
              onPress={handleRequestPermission}
              accessibilityRole="button"
            >
              <Text style={styles.fixPrimaryBtnText}>Enable Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fixSecondaryBtn}
              onPress={() => notificationService.openSystemSettings()}
              accessibilityRole="button"
            >
              <Text style={styles.fixSecondaryBtnText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {Platform.OS === "android" && isGranted && !permission?.exactAlarmGranted && (
        <View style={styles.fixActionCard}>
          <Text style={styles.fixActionTitle}>⚠️ Alarms & Reminders Needed</Text>
          <Text style={styles.fixActionSubtitle}>
            Android requires the "Alarms & Reminders" permission to wake the device
            and ring at exact scheduled times.
          </Text>
          <TouchableOpacity
            style={styles.fixPrimaryBtn}
            onPress={() => notificationService.openExactAlarmSettings()}
            accessibilityRole="button"
          >
            <Text style={styles.fixPrimaryBtnText}>
              Enable Alarms & Reminders
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ============================================================== */}
      {/* 6. DISCREET SYNC FOOTER                                        */}
      {/* ============================================================== */}
      <View style={styles.syncFooterRow}>
        <Text style={styles.syncFooterText}>
          {scheduledCount} scheduled on device •{" "}
          {syncStatus.isSyncing
            ? "Syncing..."
            : syncStatus.statusLabel === "offline"
            ? "Offline (Saved)"
            : "Synchronized"}
        </Text>
        <TouchableOpacity
          onPress={() => refreshStatus(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Refresh reminder status"
        >
          <Ionicons name="refresh" size={16} color="#0D9488" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default NotificationStatusCard;

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },

  /* 1. Overall Status Banner */
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  loadingBannerText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
    marginLeft: 12,
  },
  readyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  readyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  attentionBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FEF3C7",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  attentionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  bannerTextCol: {
    flex: 1,
  },
  readyBannerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 3,
  },
  readyBannerSubtitle: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
  attentionBannerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#92400E",
    marginBottom: 3,
  },
  attentionBannerSubtitle: {
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
  },

  /* Section Header */
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 18,
  },

  /* Setup & Preferences Card Container */
  setupCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  setupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  setupIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  setupTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  setupRowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  setupRowSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
    lineHeight: 16,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  /* Status Pills */
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillSuccess: {
    backgroundColor: "#DCFCE7",
  },
  pillWarning: {
    backgroundColor: "#FEF3C7",
  },
  pillMuted: {
    backgroundColor: "#F1F5F9",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  pillTextSuccess: {
    color: "#15803D",
  },
  pillTextWarning: {
    color: "#B45309",
  },
  pillTextMuted: {
    color: "#64748B",
  },

  /* 4. Important Advisory */
  infoCardContainer: {
    flexDirection: "row",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
    alignItems: "flex-start",
  },
  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 1,
  },
  infoTextCol: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0369A1",
    marginBottom: 3,
  },
  infoCardMessage: {
    fontSize: 12,
    color: "#0C4A6E",
    lineHeight: 17,
  },
  infoActionLink: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  infoActionLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0284C7",
  },

  /* 5. Fix Action Cards */
  fixActionCard: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  fixActionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#92400E",
    marginBottom: 4,
  },
  fixActionSubtitle: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 17,
    marginBottom: 12,
  },
  fixActionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  fixPrimaryBtn: {
    flex: 1,
    backgroundColor: "#0D9488",
    borderRadius: 10,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  fixPrimaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  fixSecondaryBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  fixSecondaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },

  /* 6. Discreet Sync Footer */
  syncFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingHorizontal: 4,
  },
  syncFooterText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
});
