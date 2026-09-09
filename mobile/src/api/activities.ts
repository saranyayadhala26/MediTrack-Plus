/**
 * REST API client functions for Medication Activity & Dose Tracking (Phase 7).
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import { AdherenceSummary, MedicationActionType, MedicationActivity } from "../types";

export interface RecordActivityPayload {
  medicineId: string;
  scheduleId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  action: MedicationActionType;
  skipReason?: string;
}

export interface ActivityFilterParams {
  medicineId?: string;
  scheduleId?: string;
  startDate?: string;
  endDate?: string;
  action?: MedicationActionType;
  limit?: number;
  skip?: number;
}

/**
 * Record a patient dose action (Taken, Skipped, Snoozed).
 */
export async function recordMedicationActivity(
  payload: RecordActivityPayload
): Promise<MedicationActivity> {
  const response = await apiClient.post<MedicationActivity>(
    ENDPOINTS.ACTIVITIES.RECORD,
    payload
  );
  return response.data;
}

/**
 * Retrieve patient's activity logs with optional filters.
 */
export async function getMedicationActivities(
  params?: ActivityFilterParams
): Promise<MedicationActivity[]> {
  const response = await apiClient.get<MedicationActivity[]>(
    ENDPOINTS.ACTIVITIES.RECORD,
    { params }
  );
  return response.data;
}

/**
 * Retrieve activities for a specific medicine.
 */
export async function getActivitiesByMedicine(
  medicineId: string
): Promise<MedicationActivity[]> {
  const response = await apiClient.get<MedicationActivity[]>(
    `${ENDPOINTS.ACTIVITIES.RECORD}/medicines/${medicineId}`
  );
  return response.data;
}

/**
 * Retrieve patient adherence summary calculated against real schedule occurrences.
 */
export async function getAdherenceSummary(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<AdherenceSummary> {
  const response = await apiClient.get<AdherenceSummary>(
    `${ENDPOINTS.ACTIVITIES.RECORD}/summary`,
    { params }
  );
  return response.data;
}
