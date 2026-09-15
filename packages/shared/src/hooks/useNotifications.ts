import type { NotificationListResponse, PushPlatform } from "@board-game-organizer/schemas";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiHeaders, withProtectionBypass } from "../api";

export interface NotificationsApiOptions {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  enabled: boolean;
  protectionBypass?: string | null;
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

async function patchNotification(
  options: NotificationsApiOptions,
  notificationId?: string,
): Promise<void> {
  const token = await authToken(options.getToken);
  const path = notificationId
    ? `/api/notifications/${encodeURIComponent(notificationId)}`
    : "/api/notifications";
  const response = await fetch(
    withProtectionBypass(`${options.apiUrl}${path}`, options.protectionBypass),
    { method: "PATCH", headers: { Authorization: `Bearer ${token}` } },
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

export function useNotifications(options: NotificationsApiOptions, limit = 5) {
  const queryClient = useQueryClient();
  const queryKey = ["notifications", options.apiUrl, options.userId, limit] as const;
  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchNotifications(options, limit, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: options.enabled && Boolean(options.userId),
    refetchInterval: 30_000,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({
    mutationFn: (notificationId: string) => patchNotification(options, notificationId),
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: () => patchNotification(options),
    onSuccess: invalidate,
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
    registerPush,
    removePush,
  };
}
