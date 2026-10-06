/**
 * Authentication and Profile REST API service functions (Phase 10.1).
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  PasswordChangePayload,
  User,
  VerifyEmailResponse,
  VerifyResetOtpResponse,
} from "../types";

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

/**
 * Validate 6-digit email verification OTP and verify user account.
 */
export const verifyEmailOtp = async (
  email: string,
  code: string
): Promise<VerifyEmailResponse> => {
  const response = await apiClient.post<VerifyEmailResponse>(
    ENDPOINTS.AUTH.VERIFY_EMAIL,
    {
      email: email.trim().toLowerCase(),
      code: code.trim(),
    }
  );
  return response.data;
};

/**
 * Request a new 6-digit email verification OTP with 60-second cooldown protection.
 */
export const resendVerificationOtp = async (
  email: string
): Promise<{ message: string }> => {
  const response = await apiClient.post<{ message: string }>(
    ENDPOINTS.AUTH.RESEND_VERIFICATION,
    {
      email: email.trim().toLowerCase(),
    }
  );
  return response.data;
};

/**
 * Validate 6-digit password reset OTP prior to setting new password.
 */
export const verifyResetOtp = async (
  email: string,
  code: string
): Promise<VerifyResetOtpResponse> => {
  const response = await apiClient.post<VerifyResetOtpResponse>(
    ENDPOINTS.AUTH.VERIFY_RESET_OTP,
    {
      email: email.trim().toLowerCase(),
      code: code.trim(),
    }
  );
  return response.data;
};
