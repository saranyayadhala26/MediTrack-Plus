import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

interface ExactAlarmModuleInterface {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): boolean;
}

const ExactAlarm = requireOptionalNativeModule<ExactAlarmModuleInterface>("ExactAlarmModule");

/**
 * Check whether Android allows scheduling exact alarms (Android 12+ / API 31+).
 * Below Android 12 or on non-Android platforms, returns true.
 * In Expo Go or if permission revoked, returns false.
 */
export function canScheduleExactAlarms(): boolean {
  if (Platform.OS !== "android") {
    return true;
  }
  try {
    return ExactAlarm?.canScheduleExactAlarms() ?? false;
  } catch {
    return false;
  }
}

/**
 * Direct the patient to Android's "Alarms & Reminders" special app access screen.
 */
export function openExactAlarmSettings(): boolean {
  if (Platform.OS !== "android") {
    return false;
  }
  try {
    return ExactAlarm?.openExactAlarmSettings() ?? false;
  } catch {
    return false;
  }
}
