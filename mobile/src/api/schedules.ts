/**
 * REST API client functions for Medication Scheduling (Phase 5).
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  MedicationSchedule,
  ScheduleCreatePayload,
  ScheduleUpdatePayload,
} from "../types";

export interface ScheduleListResponse {
  items: MedicationSchedule[];
  total: number;
  medical_disclaimer?: string;
}

export interface ScheduleDeleteResponse {
  message: string;
  id: string;
  medical_disclaimer?: string;
}

/**
 * Fetch schedules belonging to the authenticated patient, optionally filtered by medicineId.
 */
export async function getSchedules(medicineId?: string): Promise<ScheduleListResponse> {
  const url = medicineId
    ? `${ENDPOINTS.SCHEDULES.BASE}?medicine_id=${encodeURIComponent(medicineId)}`
    : ENDPOINTS.SCHEDULES.BASE;
  const response = await apiClient.get<ScheduleListResponse>(url);
  return response.data;
}

/**
 * Fetch a single schedule by ID.
 */
export async function getScheduleById(id: string): Promise<MedicationSchedule> {
  const response = await apiClient.get<MedicationSchedule>(ENDPOINTS.SCHEDULES.BY_ID(id));
  return response.data;
}

/**
 * Create a new medication schedule.
 */
export async function createSchedule(
  payload: ScheduleCreatePayload
): Promise<MedicationSchedule> {
  const response = await apiClient.post<MedicationSchedule>(
    ENDPOINTS.SCHEDULES.BASE,
    payload
  );
  return response.data;
}

/**
 * Update an existing schedule (e.g. time, frequency, days, enabled status).
 */
export async function updateSchedule(
  id: string,
  payload: ScheduleUpdatePayload
): Promise<MedicationSchedule> {
  const response = await apiClient.patch<MedicationSchedule>(
    ENDPOINTS.SCHEDULES.BY_ID(id),
    payload
  );
  return response.data;
}

/**
 * Delete a schedule by ID.
 */
export async function deleteSchedule(id: string): Promise<ScheduleDeleteResponse> {
  const response = await apiClient.delete<ScheduleDeleteResponse>(
    ENDPOINTS.SCHEDULES.BY_ID(id)
  );
  return response.data;
}
