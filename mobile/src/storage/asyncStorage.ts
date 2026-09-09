/**
 * Non-Sensitive Local Storage Utility using AsyncStorage.
 * Used exclusively for non-sensitive user preferences and application UI state.
 * For JWT tokens and credentials, use secureStorage.ts (expo-secure-store).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFERENCE_KEYS = {
  THEME_MODE: "@meditrack_theme_mode",
  NOTIFICATIONS_MUTED: "@meditrack_notifications_muted",
  LAST_ACTIVE_TAB: "@meditrack_last_active_tab",
};

export const preferenceStorage = {
  async setPreference(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.error("Failed to save preference:", key, e);
    }
  },

  async getPreference(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.error("Failed to retrieve preference:", key, e);
      return null;
    }
  },

  async removePreference(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error("Failed to remove preference:", key, e);
    }
  },

  async clearAllPreferences(): Promise<void> {
    try {
      const keys = Object.values(PREFERENCE_KEYS);
      await AsyncStorage.multiRemove(keys);
    } catch (e) {
      console.error("Failed to clear preferences:", e);
    }
  },
};
