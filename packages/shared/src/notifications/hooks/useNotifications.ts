"use client";

import {
  type NotificationDto,
  type NotificationListResponse,
  notificationIdSchema,
  type PushPlatform,
} from "@board-game-organizer/schemas";
import {
  type InfiniteData,
  type MutationFunctionContext,
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
  optimisticMutationSignal,
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
  const lastSeen = useRef<{
    apiUrl: string;
    userId: string;
    latest: Pick<NotificationDto, "id" | "createdAt"> | null;
  } | null>(null);
  useEffect(() => {
    if (!options.enabled || !options.userId) {
      lastSeen.current = null;
      return;
    }
    const page = list.data?.pages[0];
    if (!page) return;
    const previous = lastSeen.current;
    if (previous?.apiUrl !== options.apiUrl || previous.userId !== options.userId) {
      // An empty first page is also a baseline: its first later invitation is new.
      lastSeen.current = {
        apiUrl: options.apiUrl,
        userId: options.userId,
        latest: page.notifications[0] ?? null,
      };
      return;
    }
    // Match the inbox's createdAt/_id order. Deleting/reading older rows must not
    // move this watermark backwards or masquerade as an unrelated remote write.
    const latest = previous.latest;
    const incoming = page.notifications.filter(
      (row) =>
        !latest ||
        row.createdAt > latest.createdAt ||
        (row.createdAt === latest.createdAt && row.id > latest.id),
    );
    if (!incoming.length) return;
    previous.latest = incoming[0] ?? null;
    // The old watermark fell beyond this bounded page; unseen kinds may be missing.
    const gap = Boolean(latest && page.nextCursor && incoming.length === page.notifications.length);
    if (gap || incoming.some((row) => /^(follow|friend|block|contact)/.test(row.kind)))
      void queryClient.invalidateQueries({
        queryKey: ["contacts"],
        predicate: ({ queryKey }) =>
          queryKey[2] === options.apiUrl && queryKey[3] === options.userId,
      });
    void queryClient.invalidateQueries({
      queryKey: ["groups", options.apiUrl, options.userId],
    });
    if (gap || incoming.some((row) => /^(event_|table_|group_)/.test(row.kind)))
      void queryClient.invalidateQueries({
        queryKey: ["events", options.apiUrl, options.userId],
      });
  }, [list.data, options.enabled, options.userId, options.apiUrl, queryClient]);

  const notificationResource = (id?: string) => (id ? [...root, "item", id] : root);
  const write = async (
    method: "PATCH" | "DELETE",
    id: string | undefined,
    variables: unknown,
    context: MutationFunctionContext,
  ) =>
    mutateNotification(
      options,
      method,
      id,
      await optimisticMutationSignal(queryClient, context.mutationKey, variables),
    );
  const begin = async (action: "read" | "delete", id?: string) => {
    let knownUnread: boolean | undefined;
    let capturing = true;
    const loaded = new Map<string, boolean>();
    const readAt = new Date().toISOString();
    const operation = await beginOptimisticOperation(
      queryClient,
      notificationResource(id),
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
  const settled = (
    _data: unknown,
    error: Error | null,
    _variables: unknown,
    operation: Awaited<ReturnType<typeof begin>> | undefined,
    context: MutationFunctionContext,
  ) => {
    if (!operation || operation.signal.aborted || error?.message === "MUTATION_OWNER_CHANGED")
      return;
    const ownerRoot = context.mutationKey?.slice(0, 3) ?? root;
    void queryClient.invalidateQueries({
      queryKey: ownerRoot,
      refetchType: resourceBusy(ownerRoot) ? "none" : "active",
    });
  };
  const optimisticRead = (notificationId?: string) => ({
    mutationKey: [...root, notificationId ? "read" : "read-all"],
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
    mutationFn: (notificationId: string, context) =>
      write("PATCH", notificationId, notificationId, context),
    ...optimisticRead(undefined),
    mutationKey: [...root, "read"],
    onMutate: (notificationId) => begin("read", notificationId),
  });
  const markAllRead = useMutation({
    mutationFn: (variables: void, context) => write("PATCH", undefined, variables, context),
    ...optimisticRead(),
  });
  const beginDeletion = async (id?: string) => {
    const operation = await begin("delete", id);
    if (operation.active)
      options.feedback?.onOptimisticUpdate?.(
        id ? "delete_notification" : "delete_all_notifications",
      );
    return operation;
  };
  const deletion = {
    retry: false,
    onSuccess: (
      _data: unknown,
      _id: unknown,
      operation: Awaited<ReturnType<typeof begin>> | undefined,
    ) => {
      if (!operation?.active) return;
      operation.commit();
    },
    onError: async (
      error: Error,
      _id: unknown,
      operation: Awaited<ReturnType<typeof begin>> | undefined,
      context: MutationFunctionContext,
    ) => {
      if (error.message === "MUTATION_OWNER_CHANGED" || (operation && !operation.active)) return;
      options.feedback?.onError?.(
        error,
        optimisticFailureAction(
          error,
          context.mutationKey?.[3] === "delete-all"
            ? "delete_all_notifications"
            : "delete_notification",
        ),
      );
      await operation?.reject(error);
    },
    onSettled: settled,
  };
  const deleteNotification = useMutation({
    ...deletion,
    mutationKey: [...root, "delete"],
    mutationFn: (notificationId: string, context) =>
      write("DELETE", notificationId, notificationId, context),
    onMutate: (notificationId) => {
      // Missing or malformed row IDs must never fall through to whole-inbox deletion.
      const parsed = notificationIdSchema.safeParse(notificationId);
      if (!parsed.success) throw new CommunityApiError(400, "Invalid notification");
      return beginDeletion(parsed.data);
    },
  });
  const deleteAllNotifications = useMutation({
    ...deletion,
    mutationKey: [...root, "delete-all"],
    mutationFn: (variables: void, context) => write("DELETE", undefined, variables, context),
    onMutate: () => beginDeletion(),
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
    deleteAllNotifications,
    registerPush,
    removePush,
    busy: resourceBusy(),
    isBusy: (notificationId: string) => resourceBusy(notificationResource(notificationId)),
  };
}
