"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import useSWR from 'swr';
import { useAuthContext } from '@/contexts/AuthContext';
import { notificationService } from '@/services/notifications';
import type { Notification } from '@/types/notification';

/** 폴링 간격 (밀리초) */
const POLLING_INTERVAL = 30000; // 30초

interface NotificationContextType {
  /** 읽지 않은 알림 수 */
  unreadCount: number;
  /** 알림 목록 */
  notifications: Notification[];
  /** 로딩 상태 */
  isLoading: boolean;
  /** 알림 목록 새로고침 */
  refresh: () => Promise<void>;
  /** 단일 알림 읽음 처리 */
  markAsRead: (notificationId: string) => Promise<void>;
  /** 모든 알림 읽음 처리 */
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const extractCount = (response: unknown): number =>
  (response as { unread_count?: number; count?: number }).unread_count
  ?? (response as { count?: number }).count
  ?? 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthContext();
  const [optimisticCountDelta, setOptimisticCountDelta] = useState(0);
  const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(new Set());
  const [optimisticAllRead, setOptimisticAllRead] = useState(false);

  // 읽지 않은 알림 수 (30초 간격 폴링 + 탭 포커스 시 재검증)
  const {
    data: countData,
    mutate: mutateCount,
  } = useSWR(
    isAuthenticated ? '/api/notifications/unread-count' : null,
    () => notificationService.getUnreadCount(),
    {
      refreshInterval: POLLING_INTERVAL,
      revalidateOnFocus: true,
      refreshWhenHidden: false,
      // M7: 서버의 최신 카운트가 도착하면 카운트용 낙관적 오버레이를 걷어낸다. 과거엔
      // 이 값들이 수동 refresh()(드롭다운 열 때)에서만 리셋돼, 30초 폴링으로 base가
      // 갱신돼도 delta가 계속 더해져 1개씩 영구 과소표시되고, markAllAsRead 후
      // allRead가 유지돼 새 알림이 와도 뱃지가 0으로 고정됐다. 서버가 읽음 상태를
      // 이미 반영한 시점이므로 리셋한다. (per-item 목록 오버레이 optimisticReadIds는
      // 목록 새로고침 시점에 정리되므로 여기서 건드리지 않아 드롭다운 표시를 흔들지 않음)
      onSuccess: () => {
        setOptimisticCountDelta(0);
        setOptimisticAllRead(false);
      },
    }
  );

  // 알림 목록 (수동 새로고침 트리거 시에만 fetch)
  const {
    data: listData,
    isLoading,
    mutate: mutateList,
  } = useSWR(
    isAuthenticated ? '/api/notifications' : null,
    () => notificationService.fetchList(),
    { revalidateOnFocus: false }
  );

  const baseUnreadCount = countData ? extractCount(countData) : 0;
  const unreadCount = optimisticAllRead
    ? 0
    : Math.max(0, baseUnreadCount + optimisticCountDelta);

  const notifications = useMemo<Notification[]>(() => {
    if (!listData) return [];
    const list = Array.isArray(listData) ? listData : (listData.results ?? []);
    if (!optimisticAllRead && optimisticReadIds.size === 0) return list;
    const now = new Date().toISOString();
    return list.map((n: Notification) => {
      if (optimisticAllRead || optimisticReadIds.has(n.id)) {
        return { ...n, is_read: true, read_at: n.read_at || now };
      }
      return n;
    });
  }, [listData, optimisticAllRead, optimisticReadIds]);

  /** 알림 목록 새로고침 (수동) */
  const refresh = useCallback(async () => {
    setOptimisticCountDelta(0);
    setOptimisticReadIds(new Set());
    setOptimisticAllRead(false);
    await Promise.all([mutateCount(), mutateList()]);
  }, [mutateCount, mutateList]);

  /** 단일 알림 읽음 처리 */
  const markAsRead = useCallback(async (notificationId: string) => {
    // 낙관적 업데이트
    setOptimisticReadIds(prev => new Set(prev).add(notificationId));
    setOptimisticCountDelta(prev => prev - 1);
    try {
      await notificationService.markAsRead(notificationId);
    } catch (error) {
      // 롤백
      setOptimisticReadIds(prev => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
      setOptimisticCountDelta(prev => prev + 1);
      throw error;
    }
  }, []);

  /** 모든 알림 읽음 처리 */
  const markAllAsRead = useCallback(async () => {
    setOptimisticAllRead(true);
    try {
      await notificationService.markAllAsRead();
    } catch (error) {
      setOptimisticAllRead(false);
      throw error;
    }
  }, []);

  const value: NotificationContextType = {
    unreadCount,
    notifications,
    isLoading,
    refresh,
    markAsRead,
    markAllAsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotificationContext must be used within a NotificationProvider'
    );
  }
  return context;
}
