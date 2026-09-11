/**
 * Hardware-Backed Secure Storage Utility using Expo SecureStore
 * Strictly stores sensitive authentication credentials and tokens (e.g., JWT).
 * Never uses unencrypted AsyncStorage for security-critical authentication data.
 */

import * as SecureStore from "expo-secure-store";
import { User } from "../types";

const SECURE_KEYS = {
  AUTH_TOKEN: "meditrack_jwt_access_token",
  USER_SESSION: "meditrack_auth_user_session",
};

export interface AuthSessionCredentials {
  id: string;
  email: string;
  role: string;
}

export const secureStorage = {
  /**
   * Securely store the JWT access token in hardware-backed keychain / Keystore.
   */
  async saveToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, token, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch (error) {
      console.error("Failed to save auth token to SecureStore:", error);
    }
  },

  /**
   * Retrieve the JWT access token from SecureStore.
   */
  async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);
    } catch (error) {
      console.error("Failed to retrieve auth token from SecureStore:", error);
      return null;
    }
  },

  /**
   * Delete the JWT access token from SecureStore.
   */
  async removeToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN);
    } catch (error) {
      console.error("Failed to remove auth token from SecureStore:", error);
    }
  },

  /**
   * Securely persist minimal user session authorization credentials (id, email, role).
   * Strictly excludes ordinary profile fields (fullName, phone, emergencyContact,
   * notificationPreferences) from hardware-backed SecureStore.
   */
  async saveUser(user: Partial<User>): Promise<void> {
    try {
      if (!user || !user.id || !user.email || !user.role) {
        return;
      }
      const sessionData: AuthSessionCredentials = {
        id: user.id,
        email: user.email,
        role: user.role,
      };
      await SecureStore.setItemAsync(
        SECURE_KEYS.USER_SESSION,
        JSON.stringify(sessionData),
        { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }
      );
    } catch (error) {
      console.error("Failed to save user session to SecureStore:", error);
    }
  },

  /**
   * Retrieve minimal session credentials from SecureStore.
   */
  async getUser(): Promise<AuthSessionCredentials | null> {
    try {
      const data = await SecureStore.getItemAsync(SECURE_KEYS.USER_SESSION);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Failed to retrieve user session from SecureStore:", error);
      return null;
    }
  },

  /**
   * Clear all sensitive authentication data upon logout or session expiration.
   */
  async clearAuthSession(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN);
      await SecureStore.deleteItemAsync(SECURE_KEYS.USER_SESSION);
    } catch (error) {
      console.error("Failed to clear auth session from SecureStore:", error);
    }
  },
};
