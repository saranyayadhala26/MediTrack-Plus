/**
 * REST API client functions for Medication Adherence Reports (Phase 11 Step 9).
 *
 * Provides typed functions for:
 * - Patient weekly and monthly report retrieval (JSON)
 * - Patient weekly and monthly PDF download (in-memory bytes -> local filesystem)
 * - Caregiver linked-patient weekly and monthly report retrieval (JSON)
 * - Caregiver linked-patient weekly and monthly PDF download
 * - Native PDF sharing integration via expo-sharing
 *
 * Security & Integrity:
 * - Uses centralized Axios apiClient with hardware-backed Bearer authorization.
 * - Enforces zero patientId override for patient endpoints.
 * - Downloads PDFs to local document directory with deterministic naming.
 * - Sanitizes all error messages, preventing token or stack trace exposure.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import { config } from "../constants/config";
import { secureStorage } from "../storage/secureStorage";
import { MedicationReportResponse } from "../types";

// Re-export report types for convenient screen consumption
export * from "../types";

/**
 * Retrieve weekly medication adherence report for the authenticated patient.
 */
export async function getWeeklyReport(endDate?: string): Promise<MedicationReportResponse> {
  const response = await apiClient.get<MedicationReportResponse>(
    ENDPOINTS.REPORTS.WEEKLY,
    { params: endDate ? { endDate } : undefined }
  );
  return response.data;
}

/**
 * Retrieve monthly medication adherence report for the authenticated patient.
 */
export async function getMonthlyReport(endDate?: string): Promise<MedicationReportResponse> {
  const response = await apiClient.get<MedicationReportResponse>(
    ENDPOINTS.REPORTS.MONTHLY,
    { params: endDate ? { endDate } : undefined }
  );
  return response.data;
}

/**
 * Retrieve weekly adherence report for an actively linked patient (Caregiver role).
 */
export async function getPatientWeeklyReport(
  patientId: string,
  endDate?: string
): Promise<MedicationReportResponse> {
  const response = await apiClient.get<MedicationReportResponse>(
    ENDPOINTS.REPORTS.PATIENT_WEEKLY(patientId),
    { params: endDate ? { endDate } : undefined }
  );
  return response.data;
}

/**
 * Retrieve monthly adherence report for an actively linked patient (Caregiver role).
 */
export async function getPatientMonthlyReport(
  patientId: string,
  endDate?: string
): Promise<MedicationReportResponse> {
  const response = await apiClient.get<MedicationReportResponse>(
    ENDPOINTS.REPORTS.PATIENT_MONTHLY(patientId),
    { params: endDate ? { endDate } : undefined }
  );
  return response.data;
}

/**
 * Helper to download PDF from an authenticated endpoint to the app's local document directory.
 */
async function downloadPdfFromEndpoint(
  endpointPath: string,
  filename: string,
  endDate?: string
): Promise<string> {
  const token = await secureStorage.getToken();
  if (!token) {
    throw new Error("Authentication required to download PDF report.");
  }

  const query = endDate ? `?endDate=${encodeURIComponent(endDate)}` : "";
  const fullUrl = `${config.apiBaseUrl}${endpointPath}${query}`;

  const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error("Local file storage is unavailable on this device.");
  }

  const targetUri = `${directory}${filename}`;

  const downloadResult = await FileSystem.downloadAsync(fullUrl, targetUri, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/pdf",
    },
  });

  if (downloadResult.status < 200 || downloadResult.status >= 300) {
    try {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    } catch {}

    if (downloadResult.status === 403) {
      throw new Error(
        "Access forbidden: Active caregiver relationship required to download this report."
      );
    }
    if (downloadResult.status === 404) {
      throw new Error("Patient records not found.");
    }
    if (downloadResult.status === 422) {
      throw new Error("Invalid or incomplete report period requested.");
    }
    throw new Error(`Failed to download report PDF (HTTP ${downloadResult.status}).`);
  }

  return downloadResult.uri;
}

/**
 * Download authenticated patient weekly adherence report as a PDF file.
 */
export async function downloadWeeklyReportPdf(endDate?: string): Promise<string> {
  const filename = endDate
    ? `MediTrack_Weekly_Report_${endDate}.pdf`
    : `MediTrack_Weekly_Report_latest.pdf`;
  return downloadPdfFromEndpoint(ENDPOINTS.REPORTS.WEEKLY_PDF, filename, endDate);
}

/**
 * Download authenticated patient monthly adherence report as a PDF file.
 */
export async function downloadMonthlyReportPdf(endDate?: string): Promise<string> {
  const filename = endDate
    ? `MediTrack_Monthly_Report_${endDate.substring(0, 7)}.pdf`
    : `MediTrack_Monthly_Report_latest.pdf`;
  return downloadPdfFromEndpoint(ENDPOINTS.REPORTS.MONTHLY_PDF, filename, endDate);
}

/**
 * Download caregiver linked-patient weekly adherence report as a PDF file.
 */
export async function downloadPatientWeeklyReportPdf(
  patientId: string,
  endDate?: string
): Promise<string> {
  const filename = endDate
    ? `MediTrack_Weekly_Report_${patientId}_${endDate}.pdf`
    : `MediTrack_Weekly_Report_${patientId}_latest.pdf`;
  return downloadPdfFromEndpoint(
    ENDPOINTS.REPORTS.PATIENT_WEEKLY_PDF(patientId),
    filename,
    endDate
  );
}

/**
 * Download caregiver linked-patient monthly adherence report as a PDF file.
 */
export async function downloadPatientMonthlyReportPdf(
  patientId: string,
  endDate?: string
): Promise<string> {
  const filename = endDate
    ? `MediTrack_Monthly_Report_${patientId}_${endDate.substring(0, 7)}.pdf`
    : `MediTrack_Monthly_Report_${patientId}_latest.pdf`;
  return downloadPdfFromEndpoint(
    ENDPOINTS.REPORTS.PATIENT_MONTHLY_PDF(patientId),
    filename,
    endDate
  );
}

/**
 * Share or open a downloaded PDF file using expo-sharing.
 * Returns true if sharing opened, or false if sharing is unsupported on platform.
 */
export async function shareReportPdf(fileUri: string): Promise<boolean> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    return false;
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: "application/pdf",
    dialogTitle: "Share Medication Adherence Report",
    UTI: "com.adobe.pdf",
  });
  return true;
}
