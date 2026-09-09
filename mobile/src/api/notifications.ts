/**
 * REST API client functions for Notifications (Phase 6).
 * Manages notification retrieval and status updates (read/unread).
 */

import apiClient from "./client";
import { ENDPOINTS } from "./endpoints";
import { NotificationItem } from "../types";

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  medical_disclaimer?: string;
}

export interface NotificationUpdateResponse {
  id: string;
  status: "unread" | "read";
  updatedAt: string;
  medical_disclaimer?: string;
}

/**
 * Fetch patient notification history and unread alerts.
 */
export async function getNotifications(status?: "unread" | "read"): Promise<NotificationListResponse> {
  const url = status
    ? `${ENDPOINTS.NOTIFICATIONS.BASE}?status=${status}`
    : ENDPOINTS.NOTIFICATIONS.BASE;
  const response = await apiClient.get<NotificationListResponse>(url);
  return response.data;
}

/**
 * Mark a notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<NotificationUpdateResponse> {
  const response = await apiClient.patch<NotificationUpdateResponse>(
    ENDPOINTS.NOTIFICATIONS.MARK_READ(id)
  );
  return response.data;
}
