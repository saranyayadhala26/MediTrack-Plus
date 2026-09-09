/**
 * Application Runtime Configuration
 * Handles environment-aware API Base URL resolution.
 */

// Default to Android Emulator loopback if not specified in environment
const DEFAULT_API_BASE_URL = "http://10.0.2.2:8000/api/v1";

export const config = {
  appName: "MediTrack+",
  version: "1.0.0",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL,
  tokenStorageKey: "@meditrack_auth_token",
  userStorageKey: "@meditrack_user_data",
  medicalDisclaimer:
    "MediTrack+ is a medication reminder and tracking platform. It does not diagnose, prescribe, or provide medical treatment advice.",
};
