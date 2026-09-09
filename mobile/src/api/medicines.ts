/**
 * REST API client functions for Medicine Management (Phase 4).
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import { Medicine, MedicineCreatePayload, MedicineUpdatePayload } from "../types";

export interface MedicineListResponse {
  items: Medicine[];
  total: number;
  medical_disclaimer?: string;
}

export interface MedicineDeleteResponse {
  message: string;
  id: string;
  medical_disclaimer?: string;
}

/**
 * Fetch all medicines belonging to the authenticated patient.
 */
export async function getMedicines(): Promise<MedicineListResponse> {
  const response = await apiClient.get<MedicineListResponse>(ENDPOINTS.MEDICINES.BASE);
  return response.data;
}

/**
 * Fetch a single medicine by its ID.
 */
export async function getMedicineById(id: string): Promise<Medicine> {
  const response = await apiClient.get<Medicine>(ENDPOINTS.MEDICINES.BY_ID(id));
  return response.data;
}

/**
 * Create a new prescribed medicine.
 */
export async function createMedicine(payload: MedicineCreatePayload): Promise<Medicine> {
  const response = await apiClient.post<Medicine>(ENDPOINTS.MEDICINES.BASE, payload);
  return response.data;
}

/**
 * Update an existing medicine by ID.
 */
export async function updateMedicine(
  id: string,
  payload: MedicineUpdatePayload
): Promise<Medicine> {
  const response = await apiClient.patch<Medicine>(ENDPOINTS.MEDICINES.BY_ID(id), payload);
  return response.data;
}

/**
 * Delete a medicine by ID.
 */
export async function deleteMedicine(id: string): Promise<MedicineDeleteResponse> {
  const response = await apiClient.delete<MedicineDeleteResponse>(
    ENDPOINTS.MEDICINES.BY_ID(id)
  );
  return response.data;
}
