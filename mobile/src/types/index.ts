/**
 * Core Domain TypeScript Type Definitions for MediTrack+
 */

export type UserRole = "patient" | "caregiver";

export interface NotificationPreferences {
  medicationRemindersEnabled?: boolean;
  missedDoseAlertsEnabled?: boolean;
  emailNotificationsEnabled?: boolean;
  emailReportsEnabled?: boolean;
  emailAlertsEnabled?: boolean;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  phone?: string;
  emergencyContact?: string;
  healthConditions?: string[];
  notificationPreferences?: NotificationPreferences;
  isEmailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VerifyEmailResponse {
  message: string;
  isEmailVerified: boolean;
  access_token?: string;
  token_type?: string;
  user?: User;
}

export interface VerifyResetOtpResponse {
  valid: boolean;
  message: string;
}

export interface PasswordChangePayload {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export type DosageUnit = "mg" | "ml" | "tablet" | "capsule" | "drop" | "puff" | "unit" | "other";

export interface Medicine {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  dosageUnit: DosageUnit;
  frequency: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  inventory?: number;
  refillThreshold?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineCreatePayload {
  name: string;
  dosage: string;
  dosageUnit: DosageUnit;
  frequency: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  inventory?: number;
  refillThreshold?: number;
}

export interface MedicineUpdatePayload {
  name?: string;
  dosage?: string;
  dosageUnit?: DosageUnit;
  frequency?: string;
  instructions?: string;
  startDate?: string;
  endDate?: string;
  inventory?: number;
  refillThreshold?: number;
}

export type ScheduleFrequency = "daily" | "weekly" | "custom";

export interface MedicationSchedule {
  id: string;
  userId: string;
  medicineId: string;
  medicineName?: string;
  dosage?: string;
  dosageUnit?: string;
  time: string; // HH:mm (24-hour format)
  frequencyType: ScheduleFrequency;
  daysOfWeek?: number[]; // 0=Sunday, 1=Monday...
  dates?: string[]; // Specific dates for custom frequency
  startDate?: string;
  endDate?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleCreatePayload {
  medicineId: string;
  time: string;
  frequencyType: ScheduleFrequency;
  daysOfWeek?: number[];
  dates?: string[];
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
}

export interface ScheduleUpdatePayload {
  time?: string;
  frequencyType?: ScheduleFrequency;
  daysOfWeek?: number[];
  dates?: string[];
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
}

export type MedicationActionType = "Taken" | "Skipped" | "Snoozed";

export interface MedicationActivity {
  id: string;
  userId: string;
  medicineId: string;
  scheduleId: string;
  medicineName?: string;
  dosage?: string;
  dosageUnit?: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  action: MedicationActionType;
  actionTime: string; // ISO DateTime
  skipReason?: string;
  wasSnoozed?: boolean;
  snoozeCount?: number;
  createdAt: string;
}

export interface Caregiver {
  id: string;
  patientId: string;
  caregiverName: string;
  caregiverEmail: string;
  caregiverPhone: string;
  relationship: string;
  status: "active" | "pending" | "revoked";
  permissionsNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaregiverCreatePayload {
  caregiverEmail: string;
  caregiverName?: string;
  caregiverPhone?: string;
  relationship?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  caregiverId?: string;
  medicineId?: string;
  scheduleId?: string;
  type: "reminder" | "snooze" | "caregiver_alert" | "system";
  title: string;
  message: string;
  scheduledTime: string;
  status: "unread" | "read";
  createdAt: string;
}

export interface AdherenceSummary {
  startDate?: string;
  endDate?: string;
  totalScheduled: number;
  takenCount: number;
  skippedCount: number;
  snoozedCount: number;
  pendingCount: number;
  adherencePercentage: number;
  formula?: string;
}

export type CalendarStatus = "Pending" | "Taken" | "Skipped" | "Snoozed";
export type DayAggregateStatus = "Adherent" | "Skipped" | "Snoozed" | "Pending" | "None";

export interface CalendarOccurrence {
  date: string;
  scheduledTime: string;
  medicineId: string;
  medicineName: string;
  dosage: string;
  dosageUnit: string;
  scheduleId: string;
  frequencyType: string;
  status: CalendarStatus;
  activityId?: string | null;
  actionTime?: string | null;
  skipReason?: string | null;
  wasSnoozed: boolean;
  snoozeCount: number;
}

export interface DaySummary {
  date: string;
  status: DayAggregateStatus;
  totalDoses: number;
  takenCount: number;
  skippedCount: number;
  snoozedCount: number;
  pendingCount: number;
}

export interface CalendarResponse {
  medical_disclaimer?: string;
  startDate: string;
  endDate: string;
  clientDate?: string;
  occurrences: CalendarOccurrence[];
  days?: DaySummary[];
  daysSummary?: DaySummary[];
  totalOccurrences: number;
  takenCount: number;
  skippedCount: number;
  snoozedCount: number;
  pendingCount: number;
}

export interface StreakData {
  medical_disclaimer?: string;
  currentStreak: number;
  longestStreak: number;
  totalAdherentDays: number;
  totalTrackedDays: number;
  adherenceRule?: string;
  lastAdherentDate?: string | null;
  evaluatedDate: string;
}

export interface LinkedPatient {
  patientId: string;
  fullName: string;
  email: string;
  emergencyContact?: string | null;
  relationship: string;
  status: string;
  linkedAt: string;
}

export interface CaregiverAlertItem {
  patientId: string;
  patientName: string;
  medicineName: string;
  missedDosesCount: number;
  scheduledTimes: string[];
  alertMessage: string;
  timestamp: string;
}

export interface CaregiverMonitoringSummary {
  patientId: string;
  patientName: string;
  adherencePercentage: number;
  totalScheduledToday: number;
  takenToday: number;
  skippedToday: number;
  missedToday: number;
  recentAlerts: CaregiverAlertItem[];
  currentStreak?: number;
  longestStreak?: number;
  permissionsNote: string;
  medical_disclaimer?: string;
}

export interface CaregiverNotificationAlert {
  id: string;
  userId: string;
  caregiverId?: string;
  patientId?: string;
  type: string;
  alertType?: string;
  title: string;
  message: string;
  status: "unread" | "read";
  metadata?: {
    medicineName?: string;
    scheduledTime?: string;
    scheduledDate?: string;
    ruleType?: string;
    [key: string]: any;
  };
  createdAt: string;
}

// ============================================================================
// Phase 11: Medication Adherence Report Types
// ============================================================================

export type ReportPeriodType = "weekly" | "monthly";

export interface ReportSummary {
  totalScheduled: number;
  takenCount: number;
  skippedCount: number;
  missedCount: number;
  unresolvedSnoozedCount: number;
  pendingCount: number;
  adherencePercentage: number;
  hasScheduledDoses: boolean;
}

export interface ReportStreakSummary {
  currentStreak: number;
  longestStreak: number;
  totalAdherentDays: number;
  totalTrackedDays: number;
  lastAdherentDate?: string | null;
  evaluatedDate: string;
}

export interface ReportMedicineBreakdown {
  medicineId: string;
  medicineName: string;
  dosage: string;
  dosageUnit: string;
  totalScheduled: number;
  takenCount: number;
  skippedCount: number;
  missedCount: number;
  unresolvedSnoozedCount: number;
  pendingCount: number;
  adherencePercentage: number;
  hasScheduledDoses: boolean;
}

export interface ReportDailySummary {
  date: string;
  totalScheduled: number;
  takenCount: number;
  skippedCount: number;
  missedCount: number;
  unresolvedSnoozedCount: number;
  pendingCount: number;
  adherencePercentage: number;
  hasScheduledDoses: boolean;
}

export interface MedicationReportResponse {
  reportType: ReportPeriodType;
  startDate: string;
  endDate: string;
  generatedAt: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  summary: ReportSummary;
  streak: ReportStreakSummary;
  medicines: ReportMedicineBreakdown[];
  dailySummaries: ReportDailySummary[];
  medicalDisclaimer: string;
}
