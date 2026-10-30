"use client";

import type { NotificationListResponse, PushPlatform } from "@board-game-organizer/schemas";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiHeaders, withProtectionBypass } from "../../common/api";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import type { MutationFeedback } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  optimisticFailureAction,
  optimisticOperationSignal,
} from "../../common/optimisticOperation";
import { CommunityApiError } from "../../community/communityApi";
import { optimisticNotificationData } from "../notificationOptimistic";

export interface NotificationsApiOptions {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  enabled: boolean;
  protectionBypass?: string | null;
  feedback?: MutationFeedback;
  locale?: "en" | "it";
}

async function authToken(getToken: () => Promise<string | null>): Promise<string> {
  const token = await getToken();
  if (!token) throw new CommunityApiError(401, "Authentication required");
  return token;
}

async function fetchNotifications(
  options: NotificationsApiOptions,
  limit: number,
  cursor?: string,
  signal?: AbortSignal,
): Promise<NotificationListResponse> {
  const token = await authToken(options.getToken);
  if (signal?.aborted) throw new Error("MUTATION_OWNER_CHANGED");
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  if (options.locale) query.set("locale", options.locale);
  const response = await fetch(
    withProtectionBypass(
      `${options.apiUrl}/api/notifications?${query.toString()}`,
      options.protectionBypass,
    ),
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as NotificationListResponse;
}

async function mutateNotification(
  options: NotificationsApiOptions,
  method: "PATCH" | "DELETE",
  notificationId?: string,
  signal?: AbortSignal,
): Promise<void> {
  const token = await authToken(options.getToken);
  if (signal?.aborted) throw new Error("MUTATION_OWNER_CHANGED");
  const path = notificationId
    ? `/api/notifications/${encodeURIComponent(notificationId)}`
    : "/api/notifications";
  const response = await fetch(
    withProtectionBypass(`${options.apiUrl}${path}`, options.protectionBypass),
    { method, headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new CommunityApiError(response.status, `HTTP ${response.status}`);
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

export function notificationListKey(
  options: Pick<NotificationsApiOptions, "apiUrl" | "userId" | "locale">,
  limit: number,
) {
  return ["notifications", options.apiUrl, options.userId, limit, options.locale] as const;
}
export function notificationsPageQuery(options: NotificationsApiOptions, limit = 5) {
  return {
    queryKey: notificationListKey(options, limit),
    queryFn: ({ pageParam, signal }: { pageParam: string | undefined; signal?: AbortSignal }) =>
      fetchNotifications(options, limit, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: NotificationListResponse) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  };
}

export function useNotifications(options: NotificationsApiOptions, limit = 5) {
  const queryClient = useQueryClient();
  const root = ["notifications", options.apiUrl, options.userId] as const;
  const resourceBusy = useOptimisticBusy(root);
  const list = useInfiniteQuery({
    ...notificationsPageQuery(options, limit),
    enabled: options.enabled && Boolean(options.userId) && !resourceBusy(),
    refetchInterval: resourceBusy() ? false : 30_000,
  });
  const lastSeen = useRef<{ userId: string; id: string } | null>(null);
  useEffect(() => {
    if (!options.userId) {
      lastSeen.current = null;
      return;
    }
    const latest = list.data?.pages[0]?.notifications[0];
    if (!latest) return;
    if (lastSeen.current?.userId === options.userId && lastSeen.current.id !== latest.id) {
      if (/^(follow|friend|block|contact)/.test(latest.kind))
        void queryClient.invalidateQueries({ queryKey: ["contacts"], refetchType: "none" });
      void queryClient.invalidateQueries({
        queryKey: ["groups", options.apiUrl, options.userId],
        refetchType: "none",
      });
      if (/^(event_|table_|group_)/.test(latest.kind))
        void queryClient.invalidateQueries({
          queryKey: ["events", options.apiUrl, options.userId],
          refetchType: "none",
        });
    }
    lastSeen.current = { userId: options.userId, id: latest.id };
  }, [list.data, options.userId, options.apiUrl, queryClient]);

  const begin = async (action: "read" | "delete", id?: string) => {
    let knownUnread: boolean | undefined;
    let capturing = true;
    const loaded = new Map<string, boolean>();
    const readAt = new Date().toISOString();
    const operation = await beginOptimisticOperation(
      queryClient,
      root,
      { queryKey: root },
      (data, key) => {
        knownUnread ??= queryClient
          .getQueriesData<InfiniteData<NotificationListResponse>>({ queryKey: root })
          .some(([, cached]) =>
            cached?.pages.some((page) =>
              page.notifications.some((row) => row.id === id && !row.readAt),
            ),
          );
        const identity = JSON.stringify(key);
        if (capturing && !loaded.has(identity))
          loaded.set(
            identity,
            Boolean(
              (data as InfiniteData<NotificationListResponse> | undefined)?.pages.some((page) =>
                page.notifications.some((row) => row.id === id),
              ),
            ),
          );
        return optimisticNotificationData(
          data,
          action,
          id,
          readAt,
          knownUnread,
          loaded.get(identity) ?? false,
        );
      },
    );
    capturing = false;
    return operation;
  };
  const settled = () => {
    void queryClient.invalidateQueries({ queryKey: root });
  };
  const optimisticRead = (notificationId?: string) => ({
    mutationKey: root,
    onMutate: () => begin("read", notificationId),
    onSuccess: (
      _data: unknown,
      _variables: unknown,
      operation: Awaited<ReturnType<typeof begin>> | undefined,
    ) => operation?.commit(),
    onError: async (
      error: Error,
      variables: unknown,
      operation: Awaited<ReturnType<typeof begin>> | undefined,
    ) => {
      if (operation && !operation.active) return;
      options.feedback?.onError?.(
        error,
        optimisticFailureAction(
          error,
          typeof variables === "string" ? "read_notification" : "read_all_notifications",
        ),
      );
      await operation?.reject(error);
    },
    onSettled: settled,
  });

  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      mutateNotification(
        options,
        "PATCH",
        notificationId,
        optimisticOperationSignal(queryClient, root),
      ),
    ...optimisticRead(undefined),
    onMutate: (notificationId) => begin("read", notificationId),
  });
  const markAllRead = useMutation({
    mutationFn: () =>
      mutateNotification(options, "PATCH", undefined, optimisticOperationSignal(queryClient, root)),
    ...optimisticRead(),
  });
  const deleteNotification = useMutation({
    mutationKey: root,
    mutationFn: (notificationId: string) =>
      mutateNotification(
        options,
        "DELETE",
        notificationId,
        optimisticOperationSignal(queryClient, root),
      ),
    onMutate: async (notificationId) => {
      const operation = await begin("delete", notificationId);
      if (operation.modified) options.feedback?.onOptimisticUpdate?.("delete_notification");
      return operation;
    },
    onSuccess: (_data, _id, operation) => {
      if (!operation?.active) return;
      operation.commit();
      if (!operation.modified) options.feedback?.onSuccess?.("delete_notification");
    },
    onError: async (error, _id, operation) => {
      if (operation && !operation.active) return;
      options.feedback?.onError?.(error, optimisticFailureAction(error, "delete_notification"));
      await operation?.reject(error);
    },
    onSettled: settled,
  });
  const registerPush = useMutation({
    mutationKey: root,
    mutationFn: (input: { token: string; platform: PushPlatform; locale: "en" | "it" }) =>
      updatePushSubscription(options, "POST", input),
  });
  const removePush = useMutation({
    mutationKey: root,
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
    busy: resourceBusy(),
  };
}
