/**
 * 알림 관련 타입 정의
 */

/** 알림 유형 */
type NotificationType = 'inquiry_reply' | 'system';

/** 알림 객체 */
export interface Notification {
  id: string;  // UUID
  notification_type: NotificationType;
  title: string;
  message: string;
  action_url: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

/** 알림 목록 응답 (페이지네이션 있는 경우) */
interface NotificationListPaginatedResponse {
  results: Notification[];
  count: number;
  next: string | null;
  previous: string | null;
}

/** 알림 목록 응답 (배열 또는 페이지네이션) */
export type NotificationListResponse = Notification[] | NotificationListPaginatedResponse;

/** 읽지 않은 알림 수 응답 */
export interface UnreadCountResponse {
  unread_count: number;
}

/** 읽음 처리 응답 */
export interface ReadNotificationResponse {
  status: 'ok';
}

/** 모두 읽음 처리 응답 */
export interface ReadAllNotificationsResponse {
  updated_count: number;
}
