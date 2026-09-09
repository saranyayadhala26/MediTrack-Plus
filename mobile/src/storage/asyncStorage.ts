/**
 * Safe local storage utility for persistent session handling.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "../constants/config";
import { User } from "../types";

export const storage = {
  async saveToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(config.tokenStorageKey, token);
    } catch (e) {
      console.error("Failed to save auth token", e);
    }
  },

  async getToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(config.tokenStorageKey);
    } catch (e) {
      console.error("Failed to retrieve auth token", e);
      return null;
    }
  },

  async removeToken(): Promise<void> {
    try {
      await AsyncStorage.removeItem(config.tokenStorageKey);
    } catch (e) {
      console.error("Failed to remove auth token", e);
    }
  },

  async saveUser(user: User): Promise<void> {
    try {
      await AsyncStorage.setItem(config.userStorageKey, JSON.stringify(user));
    } catch (e) {
      console.error("Failed to save user session", e);
    }
  },

  async getUser(): Promise<User | null> {
    try {
      const data = await AsyncStorage.getItem(config.userStorageKey);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error("Failed to retrieve user session", e);
      return null;
    }
  },

  async clearSession(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([config.tokenStorageKey, config.userStorageKey]);
    } catch (e) {
      console.error("Failed to clear session", e);
    }
  },
};
