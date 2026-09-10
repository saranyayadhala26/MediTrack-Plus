/**
 * REST API client functions for Caregiver Management (Phase 9.1 / 9.2.6).
 * Handles fetching linked caregivers, linking a registered caregiver account,
 * and soft-revoking caregiver relationships for authenticated patients.
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import { Caregiver, CaregiverCreatePayload } from "../types";

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
