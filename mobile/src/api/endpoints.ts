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
    CHANGE_PASSWORD: "/auth/password",
    FORGOT_PASSWORD: "/auth/forgot-password",
    RESET_PASSWORD: "/auth/reset-password",
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

  // Medication Calendar & Streaks (Phase 8)
  CALENDAR: {
    BASE: "/medication-calendar",
    STREAKS: "/medication-calendar/streaks",
  },

  // Caregivers
  CAREGIVERS: {
    BASE: "/caregivers",
    BY_ID: (id: string) => `/caregivers/${id}`,
    MONITOR: (patientId: string) => `/caregivers/monitor/${patientId}`,
    PATIENTS: "/caregivers/patients",
    PATIENT_SUMMARY: (patientId: string) => `/caregivers/patients/${patientId}/summary`,
    ALERTS: "/caregivers/alerts",
    MARK_ALERT_READ: (alertId: string) => `/caregivers/alerts/${alertId}/read`,
  },

  // Notifications
  NOTIFICATIONS: {
    BASE: "/notifications",
    MARK_READ: (id: string) => `/notifications/${id}/read`,
  },

  // Reports (Phase 11)
  REPORTS: {
    WEEKLY: "/reports/weekly",
    MONTHLY: "/reports/monthly",
    WEEKLY_PDF: "/reports/weekly/pdf",
    MONTHLY_PDF: "/reports/monthly/pdf",
    PATIENT_WEEKLY: (patientId: string) => `/reports/patients/${patientId}/weekly`,
    PATIENT_MONTHLY: (patientId: string) => `/reports/patients/${patientId}/monthly`,
    PATIENT_WEEKLY_PDF: (patientId: string) => `/reports/patients/${patientId}/weekly/pdf`,
    PATIENT_MONTHLY_PDF: (patientId: string) => `/reports/patients/${patientId}/monthly/pdf`,
  },
};
