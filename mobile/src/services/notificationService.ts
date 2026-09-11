/**
 * Local Notification Service for MediTrack+ (Phase 6).
 * Manages Android high-importance notification channels, permission flows,
 * local reminder scheduling (daily, weekly, custom), reconciliation with MongoDB schedules,
 * foreground presentation behavior, and tap event listeners.
 */

import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { getSchedules } from "../api/schedules";
import { MedicationSchedule } from "../types";

export const MEDICATION_CHANNEL_ID = "medication-reminders";
export const MEDICATION_CHANNEL_NAME = "Medication Reminders";

// Configure foreground presentation: Show banner, play sound, alert user with high priority
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface NotificationPermissionState {
  status: Notifications.PermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
}

export interface ReconciliationResult {
  activeCount: number;
  scheduledCount: number;
  cancelledCount: number;
  timestamp: string;
}

export type SyncStatusLabel =
  | "synchronized"
  | "syncing"
  | "disabled"
  | "permission_required"
  | "offline";

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  activeCount: number;
  statusLabel: SyncStatusLabel;
  error?: string;
}

class NotificationService {
  private isInitialized = false;
  private reconciliationPromise: Promise<ReconciliationResult> | null = null;
  private lastSyncTimestamp = 0;
  private readonly SYNC_THROTTLE_MS = 15_000;
  private remindersEnabled = true;
  private statusListeners: Array<(status: SyncStatus) => void> = [];

  /**
   * Initialize notification channels and settings.
   * Upgraded in Phase 10.2 to MAX importance, Alarm audio stream, and public lockscreen visibility.
   * Safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
          name: MEDICATION_CHANNEL_NAME,
          importance: Notifications.AndroidImportance.MAX,
          sound: "default",
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.ALARM,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
            flags: {
              enforceAudibility: true,
              requestHardwareAudioVideoSynchronization: false,
            },
          },
          vibrationPattern: [0, 500, 250, 500, 250, 500, 250, 500],
          enableLights: true,
          enableVibrate: true,
          lightColor: "#0D9488",
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
          description: "Crucial local alarms and reminders for prescribed medication intake times.",
        });
      }
      this.isInitialized = true;
    } catch (error) {
      console.warn("NotificationService: Failed to setup Android notification channel", error);
    }
  }

  /**
   * Check current device notification permission status.
   */
  async checkPermissions(): Promise<NotificationPermissionState> {
    try {
      const settings = await Notifications.getPermissionsAsync();
      return {
        status: settings.status,
        granted: settings.granted || settings.status === Notifications.PermissionStatus.GRANTED,
        canAskAgain: settings.canAskAgain,
      };
    } catch (error) {
      console.warn("NotificationService: Error checking permissions", error);
      return {
        status: Notifications.PermissionStatus.UNDETERMINED,
        granted: false,
        canAskAgain: true,
      };
    }
  }

  /**
   * Request notification permissions from the user.
   */
  async requestPermissions(): Promise<NotificationPermissionState> {
    try {
      await this.initialize();
      const settings = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      return {
        status: settings.status,
        granted: settings.granted || settings.status === Notifications.PermissionStatus.GRANTED,
        canAskAgain: settings.canAskAgain,
      };
    } catch (error) {
      console.warn("NotificationService: Error requesting permissions", error);
      return {
        status: Notifications.PermissionStatus.DENIED,
        granted: false,
        canAskAgain: false,
      };
    }
  }

  /**
   * Direct the user to system settings when permission has been permanently denied.
   */
  openSystemSettings(): void {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
  }

  /**
   * Schedule recurring local notification(s) for a given medication schedule.
   * Respects daily, weekly, and custom frequencies, as well as start and end date bounds.
   */
  async scheduleScheduleReminder(schedule: MedicationSchedule): Promise<string[]> {
    if (!schedule.enabled) {
      return [];
    }

    await this.initialize();

    // Check bounds: if end date has already passed today, do not schedule
    const todayStr = new Date().toISOString().split("T")[0];
    if (schedule.endDate && schedule.endDate < todayStr) {
      return [];
    }

    const [hourStr, minuteStr] = schedule.time.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.warn(`NotificationService: Invalid time format "${schedule.time}" for schedule ${schedule.id}`);
      return [];
    }

    const medicineName = schedule.medicineName || "Prescribed Medicine";
    const dosageInfo = schedule.dosage ? ` (${schedule.dosage} ${schedule.dosageUnit || ""})`.trim() : "";
    const title = "Medication Reminder";
    const body = `It's time for your scheduled medicine: ${medicineName}${dosageInfo}.`;

    // Security & Safety: Payload must not contain JWT, passwords, or sensitive clinical diagnoses.
    const safeData: Record<string, unknown> = {
      scheduleId: schedule.id,
      medicineId: schedule.medicineId,
      medicineName,
      dosage: schedule.dosage || "",
      dosageUnit: schedule.dosageUnit || "",
      time: schedule.time,
      frequencyType: schedule.frequencyType,
      isAlarm: true,
    };

    const scheduledIds: string[] = [];

    try {
      if (schedule.frequencyType === "daily") {
        const id = await Notifications.scheduleNotificationAsync({
          identifier: `meditrack-sched-${schedule.id}-daily`,
          content: {
            title,
            body,
            sound: "default",
            data: safeData,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            channelId: MEDICATION_CHANNEL_ID,
          },
        });
        scheduledIds.push(id);
      } else if (schedule.frequencyType === "weekly") {
        const days = schedule.daysOfWeek && schedule.daysOfWeek.length > 0
          ? schedule.daysOfWeek
          : [1]; // Fallback to Monday if empty

        for (const day of days) {
          // Expo Weekly Trigger weekday: 1 = Sunday, 2 = Monday, ..., 7 = Saturday
          // MediTrack schema daysOfWeek: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          const expoWeekday = day + 1;

          const id = await Notifications.scheduleNotificationAsync({
            identifier: `meditrack-sched-${schedule.id}-day-${day}`,
            content: {
              title,
              body,
              sound: "default",
              data: { ...safeData, dayOfWeek: day },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: expoWeekday,
              hour,
              minute,
              channelId: MEDICATION_CHANNEL_ID,
            },
          });
          scheduledIds.push(id);
        }
      } else if (schedule.frequencyType === "custom") {
        const dates = schedule.dates || [];
        const now = Date.now();

        for (const dateStr of dates) {
          const [y, m, d] = dateStr.split("-").map(Number);
          if (!y || !m || !d) continue;

          // month index is 0-based in JS Date
          const targetDate = new Date(y, m - 1, d, hour, minute, 0);
          if (targetDate.getTime() > now) {
            const id = await Notifications.scheduleNotificationAsync({
              identifier: `meditrack-sched-${schedule.id}-custom-${dateStr}`,
              content: {
                title,
                body,
                sound: "default",
                data: { ...safeData, scheduledDate: dateStr },
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: targetDate,
                channelId: MEDICATION_CHANNEL_ID,
              },
            });
            scheduledIds.push(id);
          }
        }
      }
    } catch (error) {
      console.warn(`NotificationService: Failed scheduling reminders for schedule ${schedule.id}:`, error);
    }

    return scheduledIds;
  }

  /**
   * Cancel all local scheduled notifications associated with a schedule ID.
   */
  async cancelScheduleReminder(scheduleId: string): Promise<number> {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      let count = 0;

      for (const item of scheduled) {
        const matchesPrefix = item.identifier.startsWith(`meditrack-sched-${scheduleId}`);
        const dataScheduleId =
          item.content?.data?.scheduleId || (item as any)?.request?.content?.data?.scheduleId;
        const matchesData = dataScheduleId === scheduleId;

        if (matchesPrefix || matchesData) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
          count++;
        }
      }
      return count;
    } catch (error) {
      console.warn(`NotificationService: Error cancelling reminder for ${scheduleId}:`, error);
      return 0;
    }
  }

  /**
   * Cancel all local scheduled notifications across all schedules.
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.warn("NotificationService: Error cancelling all notifications:", error);
    }
  }

  /**
   * Sync a modified schedule: cancels existing reminders and re-schedules if enabled.
   */
  async syncScheduleReminder(schedule: MedicationSchedule): Promise<string[]> {
    await this.cancelScheduleReminder(schedule.id);
    if (schedule.enabled) {
      return await this.scheduleScheduleReminder(schedule);
    }
    return [];
  }

  /**
   * Reconcile local scheduled notifications with backend active schedules.
   * Cancels orphaned / disabled / deleted reminders and adds missing active reminders.
   */
  async reconcileAllSchedules(schedules: MedicationSchedule[]): Promise<ReconciliationResult> {
    await this.initialize();

    let cancelledCount = 0;
    let scheduledCount = 0;

    try {
      const scheduledList = await Notifications.getAllScheduledNotificationsAsync();
      const activeEnabledSchedules = schedules.filter((s) => s.enabled);
      const activeScheduleIds = new Set(activeEnabledSchedules.map((s) => s.id));

      // 1. Identify which schedule IDs currently have scheduled notifications
      const currentlyScheduledIds = new Set<string>();

      for (const item of scheduledList) {
        const id = item.identifier;
        let schedId: string | null = null;

        if (id.startsWith("meditrack-sched-")) {
          // Extract scheduleId from identifier pattern `meditrack-sched-${scheduleId}-...`
          const parts = id.replace("meditrack-sched-", "").split("-");
          schedId = parts[0];
        } else if (!id.startsWith("meditrack-snooze-") && !id.startsWith("meditrack-test-")) {
          schedId =
            (item.content?.data?.scheduleId as string) ||
            ((item as any)?.request?.content?.data?.scheduleId as string) ||
            null;
        }

        if (schedId) {
          // If schedule is no longer active/enabled, cancel it
          if (!activeScheduleIds.has(schedId)) {
            await Notifications.cancelScheduledNotificationAsync(item.identifier);
            cancelledCount++;
          } else {
            // Check if remote time changed
            const matchingSched = activeEnabledSchedules.find((s) => s.id === schedId);
            const itemData = item.content?.data || (item as any)?.request?.content?.data;
            if (matchingSched && itemData?.time && itemData.time !== matchingSched.time) {
              await Notifications.cancelScheduledNotificationAsync(item.identifier);
              cancelledCount++;
            } else {
              currentlyScheduledIds.add(schedId);
            }
          }
        }
      }

      // 2. Schedule notifications for active enabled schedules not yet scheduled
      for (const sched of activeEnabledSchedules) {
        if (!currentlyScheduledIds.has(sched.id)) {
          const ids = await this.scheduleScheduleReminder(sched);
          scheduledCount += ids.length;
        }
      }

      const totalActiveReminders = await this.getScheduledRemindersCount();

      return {
        activeCount: totalActiveReminders,
        scheduledCount,
        cancelledCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("NotificationService: Reconciliation error:", error);
      return {
        activeCount: 0,
        scheduledCount: 0,
        cancelledCount: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Automatic schedule reconciliation with in-flight mutex, debounce throttle,
   * offline tolerance, and preference awareness.
   */
  async autoSync(options?: {
    force?: boolean;
    remindersEnabled?: boolean;
  }): Promise<ReconciliationResult> {
    await this.initialize();

    if (options?.remindersEnabled !== undefined) {
      this.remindersEnabled = options.remindersEnabled;
    }

    // 1. Preference guard: if user explicitly disabled medication reminders, cancel all
    if (!this.remindersEnabled) {
      await this.cancelAllNotifications();
      const result: ReconciliationResult = {
        activeCount: 0,
        scheduledCount: 0,
        cancelledCount: 0,
        timestamp: new Date().toISOString(),
      };
      this.lastSyncTimestamp = Date.now();
      this.notifyStatusListeners({
        isSyncing: false,
        lastSyncTime: result.timestamp,
        activeCount: 0,
        statusLabel: "disabled",
      });
      return result;
    }

    // 2. Permission check
    const perm = await this.checkPermissions();
    if (!perm.granted) {
      const currentCount = await this.getScheduledRemindersCount();
      this.notifyStatusListeners({
        isSyncing: false,
        lastSyncTime: this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toISOString() : null,
        activeCount: currentCount,
        statusLabel: "permission_required",
      });
      return {
        activeCount: currentCount,
        scheduledCount: 0,
        cancelledCount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Debounce / throttle check: avoid redundant network requests if sync ran recently
    const now = Date.now();
    if (!options?.force && now - this.lastSyncTimestamp < this.SYNC_THROTTLE_MS) {
      const currentCount = await this.getScheduledRemindersCount();
      return {
        activeCount: currentCount,
        scheduledCount: 0,
        cancelledCount: 0,
        timestamp: new Date(this.lastSyncTimestamp).toISOString(),
      };
    }

    // 4. In-flight mutex: coalesce simultaneous reconciliation calls into the same promise
    if (this.reconciliationPromise) {
      return this.reconciliationPromise;
    }

    this.notifyStatusListeners({
      isSyncing: true,
      lastSyncTime: this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toISOString() : null,
      activeCount: await this.getScheduledRemindersCount(),
      statusLabel: "syncing",
    });

    this.reconciliationPromise = (async () => {
      try {
        const schedulesRes = await getSchedules();
        const items = schedulesRes?.items || [];
        const result = await this.reconcileAllSchedules(items);
        this.lastSyncTimestamp = Date.now();
        this.notifyStatusListeners({
          isSyncing: false,
          lastSyncTime: result.timestamp,
          activeCount: result.activeCount,
          statusLabel: "synchronized",
        });
        return result;
      } catch {
        // Offline / network failure: preserve existing local device reminders gracefully
        const currentCount = await this.getScheduledRemindersCount();
        this.notifyStatusListeners({
          isSyncing: false,
          lastSyncTime: this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toISOString() : null,
          activeCount: currentCount,
          statusLabel: "offline",
        });
        return {
          activeCount: currentCount,
          scheduledCount: 0,
          cancelledCount: 0,
          timestamp: new Date().toISOString(),
        };
      } finally {
        this.reconciliationPromise = null;
      }
    })();

    return this.reconciliationPromise;
  }

  /**
   * Subscribe a component or screen to automatic sync status updates.
   */
  addSyncStatusListener(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private notifyStatusListeners(status: SyncStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Ignore errors in listeners
      }
    }
  }

  /**
   * Send an immediate test reminder (fires in 3 seconds) so the user or QA
   * can verify hardware sound, vibration, and banner alerts on their device.
   */
  async sendTestReminder(): Promise<string> {
    await this.initialize();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTimeStr = `${hh}:${mm}`;

    return await Notifications.scheduleNotificationAsync({
      identifier: `meditrack-test-${Date.now()}`,
      content: {
        title: "MediTrack+ Medication Alarm",
        body: "Test Alarm: Time to take your scheduled medication (1 tablet).",
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: "test",
          isAlarm: true,
          medicineId: "test-med-001",
          scheduleId: "test-sched-001",
          medicineName: "Test Medication",
          dosage: "1 tablet",
          time: currentTimeStr,
          timestamp: new Date().toISOString(),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
        repeats: false,
        channelId: MEDICATION_CHANNEL_ID,
      },
    });
  }

  /**
   * Schedule a hardware local snooze reminder for a medication dose in N minutes (default 10m).
   * Generates a non-repeating alert on the max-importance medication alarm channel.
   */
  async scheduleSnoozeReminder(
    medicineName: string,
    dosageInfo: string,
    scheduleId: string,
    medicineId: string,
    snoozeMinutes: number = 10
  ): Promise<string> {
    await this.initialize();
    const identifier = `meditrack-snooze-${scheduleId}-${Date.now()}`;
    return await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `⏰ Snoozed Dose: ${medicineName}`,
        body: `It is time to take your snoozed dose of ${medicineName}${dosageInfo ? ` (${dosageInfo})` : ""}.`,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          scheduleId,
          medicineId,
          medicineName,
          dosage: dosageInfo,
          isSnooze: true,
          isAlarm: true,
          scheduledTime: new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString(),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: snoozeMinutes * 60,
        repeats: false,
        channelId: MEDICATION_CHANNEL_ID,
      },
    });
  }

  /**
   * Get the current count of active scheduled local notifications.
   */
  async getScheduledRemindersCount(): Promise<number> {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const count = scheduled.filter(
        (item) =>
          item.identifier.startsWith("meditrack-sched-") ||
          item.identifier.startsWith("meditrack-snooze-")
      ).length;
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Attach listener for notification response (tap) events.
   * Invokes the callback when the patient clicks a notification.
   */
  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  /**
   * Attach listener for notification received events (while app is in foreground).
   * Invokes the callback when a notification arrives so the app can present the alarm modal immediately.
   */
  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(callback);
  }
}

export const notificationService = new NotificationService();
