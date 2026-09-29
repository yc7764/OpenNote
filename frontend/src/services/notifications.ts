/**
 * 알림 API 서비스
 */
import { apiClient } from '@/lib/apiClient';
import type {
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
  ReadNotificationResponse,
  ReadAllNotificationsResponse,
} from '@/types/notification';

/**
 * 알림 목록 조회
 */
export async function fetchNotifications(): Promise<NotificationListResponse> {
  return apiClient('/api/notifications/');
}

/**
 * 읽지 않은 알림 수 조회
 */
export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  return apiClient('/api/notifications/unread-count/');
}

/**
 * 단일 알림 읽음 처리
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<ReadNotificationResponse> {
  return apiClient(`/api/notifications/${notificationId}/read/`, {
    method: 'POST',
  });
}

/**
 * 모든 알림 읽음 처리
 */
export async function markAllNotificationsAsRead(): Promise<ReadAllNotificationsResponse> {
  return apiClient('/api/notifications/read-all/', {
    method: 'POST',
  });
}

/** 알림 서비스 객체 (편의용) */
export const notificationService = {
  fetchList: fetchNotifications,
  getUnreadCount: fetchUnreadCount,
  markAsRead: markNotificationAsRead,
  markAllAsRead: markAllNotificationsAsRead,
};
