/**
 * Centralized REST API Endpoint Constants
 */

export const ENDPOINTS = {
  // Health
  HEALTH: "/health",

  // Auth & Profile
  AUTH: {
    REGISTER: "/auth/register",
    LOGIN: "/auth/login",
    PROFILE: "/auth/me",
    UPDATE_PROFILE: "/auth/profile",
  },

  // Medicines
  MEDICINES: {
    BASE: "/medicines",
    BY_ID: (id: string) => `/medicines/${id}`,
  },

  // Schedules
  SCHEDULES: {
    BASE: "/schedules",
    BY_ID: (id: string) => `/schedules/${id}`,
    TODAY: "/schedules/today",
  },

  // Medication Actions & History
  ACTIVITIES: {
    RECORD: "/medication-activities",
    HISTORY: "/history",
  },

  // Analytics & Adherence
  ADHERENCE: {
    SUMMARY: "/adherence/summary",
    CALENDAR: "/calendar",
    STREAKS: "/streaks",
  },

  // Caregivers
  CAREGIVERS: {
    BASE: "/caregivers",
    BY_ID: (id: string) => `/caregivers/${id}`,
    MONITOR: (patientId: string) => `/caregivers/monitor/${patientId}`,
  },

  // Notifications
  NOTIFICATIONS: {
    BASE: "/notifications",
    MARK_READ: (id: string) => `/notifications/${id}/read`,
  },
};
