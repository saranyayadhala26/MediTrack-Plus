/**
 * Core Domain TypeScript Type Definitions for MediTrack+
 */

export type UserRole = "patient" | "caregiver";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  emergencyContact?: string;
  healthConditions?: string[];
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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

