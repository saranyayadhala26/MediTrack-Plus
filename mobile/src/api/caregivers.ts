/**
 * REST API client functions for Caregiver Management (Phase 9.1 / 9.2.6).
 * Handles fetching linked caregivers, linking a registered caregiver account,
 * and soft-revoking caregiver relationships for authenticated patients.
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  Caregiver,
  CaregiverCreatePayload,
  CaregiverMonitoringSummary,
  CaregiverNotificationAlert,
  LinkedPatient,
} from "../types";

/**
 * Retrieve caregiver relationships for the authenticated patient.
 * Optionally filter by status (e.g. 'active', 'revoked').
 */
export async function getCaregivers(status?: string): Promise<Caregiver[]> {
  const url = status
    ? `${ENDPOINTS.CAREGIVERS.BASE}?status=${encodeURIComponent(status)}`
    : ENDPOINTS.CAREGIVERS.BASE;
  const response = await apiClient.get<Caregiver[]>(url);
  return response.data;
}

/**
 * Link a registered caregiver to the authenticated patient account.
 */
export async function createCaregiver(
  payload: CaregiverCreatePayload
): Promise<Caregiver> {
  const response = await apiClient.post<Caregiver>(
    ENDPOINTS.CAREGIVERS.BASE,
    payload
  );
  return response.data;
}

/**
 * Revoke an active caregiver relationship for the authenticated patient.
 */
export async function revokeCaregiver(caregiverId: string): Promise<void> {
  await apiClient.delete(ENDPOINTS.CAREGIVERS.BY_ID(caregiverId));
}

/**
 * Retrieve list of patients linked to the authenticated caregiver (Phase 9.2.5 / 9.2.7).
 * Strictly read-only monitoring access.
 */
export async function getLinkedPatients(): Promise<LinkedPatient[]> {
  const response = await apiClient.get<LinkedPatient[]>(
    ENDPOINTS.CAREGIVERS.PATIENTS
  );
  return response.data;
}

/**
 * Retrieve adherence monitoring summary for a linked patient (Phase 9.2.5 / 9.2.7).
 * Optionally pass client reference date (YYYY-MM-DD).
 */
export async function getPatientSummary(
  patientId: string,
  clientDate?: string
): Promise<CaregiverMonitoringSummary> {
  const url = clientDate
    ? `${ENDPOINTS.CAREGIVERS.PATIENT_SUMMARY(patientId)}?clientDate=${encodeURIComponent(clientDate)}`
    : ENDPOINTS.CAREGIVERS.PATIENT_SUMMARY(patientId);
  const response = await apiClient.get<CaregiverMonitoringSummary>(url);
  return response.data;
}

/**
 * Retrieve caregiver alert notifications for the authenticated caregiver (Phase 9.2.5 / 9.2.7).
 * Supports status filtering ('unread' | 'read') and patientId filtering.
 */
export async function getCaregiverAlerts(
  status?: "read" | "unread",
  patientId?: string
): Promise<CaregiverNotificationAlert[]> {
  const params = new URLSearchParams();
  if (status) {
    params.append("status", status);
  }
  if (patientId) {
    params.append("patientId", patientId);
  }
  const queryStr = params.toString();
  const url = queryStr
    ? `${ENDPOINTS.CAREGIVERS.ALERTS}?${queryStr}`
    : ENDPOINTS.CAREGIVERS.ALERTS;
  const response = await apiClient.get<CaregiverNotificationAlert[]>(url);
  return response.data;
}

/**
 * Mark a caregiver alert notification as read (Phase 9.2.5 / 9.2.7).
 */
export async function markCaregiverAlertRead(
  alertId: string
): Promise<CaregiverNotificationAlert> {
  const response = await apiClient.patch<CaregiverNotificationAlert>(
    ENDPOINTS.CAREGIVERS.MARK_ALERT_READ(alertId)
  );
  return response.data;
}

