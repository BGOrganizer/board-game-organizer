"use client";

import {
  type NotificationChangesScope,
  notificationChangesPageSchema,
  notificationChangesReceiptSchema,
  type ReadNotificationChangesInput,
} from "@board-game-organizer/schemas";
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useOptimisticBusy } from "../../common/hooks/useOptimisticBusy";
import {
  beginOptimisticOperation,
  optimisticMutationSignal,
} from "../../common/optimisticOperation";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityRequest,
} from "../../community/communityApi";
import { notificationFilters } from "../notificationAttentionCache";
import {
  notificationChangesWindow,
  projectNotificationChanges,
} from "../notificationChangeProjection";
import { reconcileNotificationChangesRead } from "../notificationChangeReconciliation";
import { displayedNotificationReferences } from "../notificationChanges";
import { readNotificationChangesSnapshot } from "../notificationChangesReadAll";

export const notificationChangesRoot = (options: Pick<CommunityApiOptions, "apiUrl" | "userId">) =>
  ["notification-changes", options.apiUrl, options.userId] as const;
type Options = CommunityApiOptions & { locale?: "en" | "it" };
export function notificationChangesQuery(
  options: Options,
  scope: NotificationChangesScope,
  limit = 8,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...notificationChangesRoot(options),
      scope.kind,
      scope.id,
      scope.tab,
      options.locale ?? "en",
      limit,
    ],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ ...scope, limit: String(limit) });
      params.set("locale", options.locale ?? "en");
      if (pageParam) params.set("cursor", pageParam);
      return notificationChangesPageSchema.parse(
        await communityRequest(
          options,
          `notifications/changes?${params}`,
          "GET",
          undefined,
          signal,
        ),
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useNotificationChanges(options: Options, scope: NotificationChangesScope) {
  const client = useQueryClient();
  const root = ["notifications", options.apiUrl, options.userId] as const;
  const busy = useOptimisticBusy(root);
  const query = useInfiniteQuery({
    ...notificationChangesQuery(options, scope),
    enabled: options.enabled !== false && Boolean(options.userId && options.apiUrl) && !busy(),
  });
  const identity = JSON.stringify([
    options.apiUrl,
    options.userId,
    options.locale ?? "en",
    scope.kind,
    scope.id,
    scope.tab,
    query.data?.pages[0]?.asOf,
  ]);
  const scopeIdentity = JSON.stringify([
    options.apiUrl,
    options.userId,
    options.locale ?? "en",
    scope.kind,
    scope.id,
    scope.tab,
  ]);
  const scopeOwner = useRef(scopeIdentity);
  scopeOwner.current = scopeIdentity;
  const allController = useRef<AbortController | null>(null);
  const [allRead, setAllRead] = useState<{ owner: string; pending: boolean; error: unknown }>({
    owner: scopeIdentity,
    pending: false,
    error: null,
  });
  useEffect(() => {
    setAllRead({ owner: scopeIdentity, pending: false, error: null });
    return () => {
      allController.current?.abort();
      allController.current = null;
    };
  }, [scopeIdentity]);
  const owner = useRef(identity);
  owner.current = identity;
  const [window, setWindow] = useState({ identity, end: 0 });
  const end = window.identity === identity ? window.end : 0;
  const pages = query.data?.pages ?? [];
  const changes = notificationChangesWindow(pages, end);
  const fetching = useRef<string | null>(null);
  const fetchNextPage = async () => {
    if (fetching.current === identity || query.isFetching || scope.tab === "none") return;
    const captured = identity;
    fetching.current = captured;
    try {
      if (end + 1 < pages.length) setWindow({ identity: captured, end: end + 1 });
      else if (query.hasNextPage) {
        const result = await query.fetchNextPage();
        if (owner.current === captured && (result.data?.pages.length ?? 0) > end + 1)
          setWindow({ identity: captured, end: end + 1 });
      }
    } finally {
      if (fetching.current === captured) fetching.current = null;
    }
  };
  type Variables = ReadNotificationChangesInput & { owner: Options };
  const mutation = useMutation({
    mutationKey: [...root, "changes-read"],
    retry: false,
    networkMode: "always",
    mutationFn: async (variables: Variables, context) => {
      const signal = await optimisticMutationSignal(client, context.mutationKey, variables);
      const { owner: capturedOwner, ...input } = variables;
      const result = notificationChangesReceiptSchema.safeParse(
        await communityRequest(capturedOwner, "notifications/changes", "PATCH", input, signal),
      );
      if (!result.success) throw new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN");
      return result.data;
    },
    onMutate: async (variables) => {
      const selection = { references: variables.references };
      const operation = await beginOptimisticOperation(
        client,
        ["notifications", variables.owner.apiUrl, variables.owner.userId, "changes-read"],
        notificationFilters(variables.owner),
        (data, key) =>
          key[0] === "notification-changes"
            ? projectNotificationChanges(data, selection.references)
            : data,
        variables.references.map((row) => [
          "notifications",
          variables.owner.apiUrl,
          variables.owner.userId,
          "item",
          row.notificationId,
        ]),
      );
      return { operation, selection, owner: variables.owner };
    },
    onSuccess: (receipt, variables, context) => {
      context.selection.references = receipt.readReferences;
      context.operation.commit((data, key) =>
        reconcileNotificationChangesRead(data, key, receipt, variables),
      );
    },
    onError: async (error, _variables, context) => {
      if (context?.operation.active) await context.operation.reject(error);
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context || context.operation.signal.aborted) return;
      void client.invalidateQueries({
        ...notificationFilters(context.owner),
        refetchType: busy(["notifications", context.owner.apiUrl, context.owner.userId])
          ? "none"
          : "active",
      });
    },
  });
  const through = pages[0]?.asOf;
  const references = displayedNotificationReferences(changes);
  const markDisplayedAsRead = () => {
    if (!through || !references.length || !options.userId || mutation.isPending || busy()) return;
    mutation.mutate({ scope: { ...scope }, through, references, owner: { ...options } });
  };
  const markAllAsRead = async () => {
    const first = pages[0];
    if (
      !first ||
      scope.tab !== "all" ||
      !options.userId ||
      mutation.isPending ||
      busy() ||
      allController.current
    )
      return;
    const captured = scopeIdentity;
    const capturedOptions = { ...options };
    const capturedScope = { ...scope };
    const controller = new AbortController();
    allController.current = controller;
    setAllRead({ owner: captured, pending: true, error: null });
    const current = () => !controller.signal.aborted && scopeOwner.current === captured;
    try {
      await readNotificationChangesSnapshot(
        first,
        async (cursor) => {
          const params = new URLSearchParams({ ...capturedScope, limit: "50", cursor });
          params.set("locale", capturedOptions.locale ?? "en");
          return notificationChangesPageSchema.parse(
            await communityRequest(
              capturedOptions,
              `notifications/changes?${params}`,
              "GET",
              undefined,
              controller.signal,
            ),
          );
        },
        async (through, references) => {
          if (current())
            await mutation.mutateAsync({
              scope: capturedScope,
              through,
              references,
              owner: capturedOptions,
            });
        },
        current,
      );
      if (current()) setAllRead({ owner: captured, pending: false, error: null });
    } catch (error) {
      if (current()) setAllRead({ owner: captured, pending: false, error });
    } finally {
      if (allController.current === controller) allController.current = null;
    }
  };
  const readOwner = mutation.variables?.owner;
  const readScope = mutation.variables?.scope;
  const ownsReadError =
    readOwner?.apiUrl === options.apiUrl &&
    readOwner.userId === options.userId &&
    (readOwner.locale ?? "en") === (options.locale ?? "en") &&
    readScope?.kind === scope.kind &&
    readScope.id === scope.id &&
    readScope.tab === scope.tab;
  return {
    changes,
    tabCounts: pages[0]?.tabCounts ?? { details: 0, members: 0, tables: 0, participants: 0 },
    hasNextPage: end + 1 < pages.length || Boolean(query.hasNextPage),
    fetchNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    isFetchingNextPage: query.isFetchingNextPage,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    markDisplayedAsRead,
    markAllAsRead,
    resetWindow: () => setWindow({ identity, end: 0 }),
    isReading: mutation.isPending || busy() || (allRead.owner === scopeIdentity && allRead.pending),
    readError:
      (allRead.owner === scopeIdentity ? allRead.error : null) ??
      (ownsReadError ? mutation.error : null),
  };
}
