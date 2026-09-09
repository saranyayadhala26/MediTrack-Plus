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

export type ScheduleFrequency = "daily" | "weekly" | "custom";

export interface MedicationSchedule {
  id: string;
  userId: string;
  medicineId: string;
  medicineName?: string;
  time: string; // HH:mm (24-hour format)
  frequencyType: ScheduleFrequency;
  daysOfWeek?: number[]; // 0=Sunday, 1=Monday...
  startDate: string;
  endDate?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MedicationActionType = "Taken" | "Skipped" | "Snoozed";

export interface MedicationActivity {
  id: string;
  userId: string;
  medicineId: string;
  scheduleId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  action: MedicationActionType;
  actionTime: string; // ISO DateTime
  skipReason?: string;
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
  totalScheduled: number;
  takenCount: number;
  skippedCount: number;
  missedCount: number;
  adherencePercentage: number;
}
