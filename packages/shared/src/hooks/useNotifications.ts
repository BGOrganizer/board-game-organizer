import type { NotificationListResponse, PushPlatform } from "@board-game-organizer/schemas";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiHeaders, withProtectionBypass } from "../api";
import type { MutationFeedback } from "../mutationFeedback";

export interface NotificationsApiOptions {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  enabled: boolean;
  protectionBypass?: string | null;
  feedback?: MutationFeedback;
}

async function authToken(getToken: () => Promise<string | null>): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error("Authentication required");
  return token;
}

async function fetchNotifications(
  options: NotificationsApiOptions,
  limit: number,
  cursor?: string,
): Promise<NotificationListResponse> {
  const token = await authToken(options.getToken);
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(
    withProtectionBypass(
      `${options.apiUrl}/api/notifications?${query.toString()}`,
      options.protectionBypass,
    ),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as NotificationListResponse;
}

async function mutateNotification(
  options: NotificationsApiOptions,
  method: "PATCH" | "DELETE",
  notificationId?: string,
): Promise<void> {
  const token = await authToken(options.getToken);
  const path = notificationId
    ? `/api/notifications/${encodeURIComponent(notificationId)}`
    : "/api/notifications";
  const response = await fetch(
    withProtectionBypass(`${options.apiUrl}${path}`, options.protectionBypass),
    { method, headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function updatePushSubscription(
  options: NotificationsApiOptions,
  method: "POST" | "DELETE",
  input: { token: string; platform?: PushPlatform; locale?: "en" | "it" },
): Promise<void> {
  const token = await authToken(options.getToken);
  const response = await fetch(
    withProtectionBypass(`${options.apiUrl}/api/push-subscriptions`, options.protectionBypass),
    {
      method,
      headers: apiHeaders(token),
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

function optimisticNotifications(
  data: InfiniteData<NotificationListResponse> | undefined,
  notificationId?: string,
): InfiniteData<NotificationListResponse> | undefined {
  if (!data) return data;
  const now = new Date().toISOString();
  const wasUnread = notificationId
    ? data.pages.some((page) =>
        page.notifications.some(
          (notification) => notification.id === notificationId && !notification.readAt,
        ),
      )
    : false;

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      unreadCount: notificationId ? Math.max(0, page.unreadCount - (wasUnread ? 1 : 0)) : 0,
      notifications: page.notifications.map((notification) =>
        !notificationId || notification.id === notificationId
          ? { ...notification, readAt: notification.readAt ?? now }
          : notification,
      ),
    })),
  };
}

export function notificationsPageQuery(options: NotificationsApiOptions, limit = 5) {
  return {
    queryKey: ["notifications", options.apiUrl, options.userId, limit] as const,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchNotifications(options, limit, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: NotificationListResponse) => page.nextCursor ?? undefined,
  };
}

export function useNotifications(options: NotificationsApiOptions, limit = 5) {
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    ...notificationsPageQuery(options, limit),
    enabled: options.enabled && Boolean(options.userId),
    refetchInterval: 30_000,
  });

  const optimisticRead = (notificationId?: string) => ({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const snapshots = queryClient.getQueriesData<InfiniteData<NotificationListResponse>>({
        queryKey: ["notifications"],
      });
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(key, optimisticNotifications(data, notificationId));
      }
      return snapshots;
    },
    onError: (
      _error: Error,
      _variables: unknown,
      snapshots:
        | Array<[readonly unknown[], InfiniteData<NotificationListResponse> | undefined]>
        | undefined,
    ) => {
      for (const [key, data] of snapshots ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: (notificationId: string) => mutateNotification(options, "PATCH", notificationId),
    ...optimisticRead(undefined),
    onMutate: async (notificationId) => optimisticRead(notificationId).onMutate(),
  });
  const markAllRead = useMutation({
    mutationFn: () => mutateNotification(options, "PATCH"),
    ...optimisticRead(),
  });
  const deleteNotification = useMutation({
    mutationFn: (notificationId: string) => mutateNotification(options, "DELETE", notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const snapshots = queryClient.getQueriesData<InfiniteData<NotificationListResponse>>({
        queryKey: ["notifications"],
      });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        const wasUnread = data.pages.some((page) =>
          page.notifications.some((item) => item.id === notificationId && !item.readAt),
        );
        queryClient.setQueryData(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            unreadCount: Math.max(0, page.unreadCount - Number(wasUnread)),
            notifications: page.notifications.filter((item) => item.id !== notificationId),
          })),
        });
      }
      options.feedback?.onOptimisticUpdate?.("delete_notification");
      return snapshots;
    },
    onError: (error, _id, snapshots) => {
      for (const [key, data] of snapshots ?? []) queryClient.setQueryData(key, data);
      options.feedback?.onError?.(error, "delete_notification");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const registerPush = useMutation({
    mutationFn: (input: { token: string; platform: PushPlatform; locale: "en" | "it" }) =>
      updatePushSubscription(options, "POST", input),
  });
  const removePush = useMutation({
    mutationFn: (token: string) => updatePushSubscription(options, "DELETE", { token }),
  });

  return {
    list,
    notifications: list.data?.pages.flatMap((page) => page.notifications) ?? [],
    unreadCount: list.data?.pages[0]?.unreadCount ?? 0,
    hasMore: list.hasNextPage,
    markRead,
    markAllRead,
    deleteNotification,
    registerPush,
    removePush,
  };
}
