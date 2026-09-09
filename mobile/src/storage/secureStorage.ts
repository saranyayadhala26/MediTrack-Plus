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
   * Securely persist user profile / session data.
   */
  async saveUser(user: User): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        SECURE_KEYS.USER_SESSION,
        JSON.stringify(user),
        { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }
      );
    } catch (error) {
      console.error("Failed to save user session to SecureStore:", error);
    }
  },

  /**
   * Retrieve user profile from SecureStore.
   */
  async getUser(): Promise<User | null> {
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
