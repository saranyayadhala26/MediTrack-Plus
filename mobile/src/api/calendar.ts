/**
 * REST API client functions for Medication Calendar & Adherence Streaks (Phase 8).
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import { CalendarResponse, StreakData } from "../types";

export interface CalendarQueryParams {
  startDate?: string;
  endDate?: string;
  clientDate?: string;
  patientId?: string;
}

export interface StreakQueryParams {
  clientDate?: string;
  patientId?: string;
}

/**
 * Format local date as YYYY-MM-DD for clientDate query parameter.
 */
export function getLocalTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Retrieve calendar medication occurrences and daily aggregate adherence status.
 */
export async function getMedicationCalendar(
  params?: CalendarQueryParams
): Promise<CalendarResponse> {
  const query = {
    clientDate: getLocalTodayString(),
    ...params,
  };
  const response = await apiClient.get<CalendarResponse>(
    ENDPOINTS.CALENDAR.BASE,
    { params: query }
  );
  return response.data;
}

/**
 * Retrieve adherence streak statistics (current streak, longest streak, total adherent days).
 */
export async function getAdherenceStreaks(
  params?: StreakQueryParams
): Promise<StreakData> {
  const query = {
    clientDate: getLocalTodayString(),
    ...params,
  };
  const response = await apiClient.get<StreakData>(
    ENDPOINTS.CALENDAR.STREAKS,
    { params: query }
  );
  return response.data;
}
