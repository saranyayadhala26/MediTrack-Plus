/**
 * Authentication and Profile REST API service functions (Phase 10.1).
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import { PasswordChangePayload, User } from "../types";

/**
 * Fetch the profile of the currently authenticated user.
 */
export const getUserProfile = async (): Promise<User> => {
  const response = await apiClient.get<User>(ENDPOINTS.AUTH.PROFILE);
  return response.data;
};

/**
 * Update permitted profile fields for the authenticated user.
 * MongoDB/Backend is the source of truth.
 */
export const updateUserProfile = async (payload: Partial<User>): Promise<User> => {
  const response = await apiClient.patch<User>(ENDPOINTS.AUTH.UPDATE_PROFILE, payload);
  return response.data;
};

/**
 * Securely change password for the authenticated user.
 * Rejects incorrect current password with 401 Unauthorized.
 */
export const changePassword = async (
  payload: PasswordChangePayload
): Promise<{ message: string }> => {
  const response = await apiClient.patch<{ message: string }>(
    ENDPOINTS.AUTH.CHANGE_PASSWORD,
    payload
  );
  return response.data;
};
