"use client";

import {
  type NotificationAttentionCount,
  type NotificationAttentionSnapshot,
  type NotificationAttentionTarget,
  type NotificationListResponse,
  notificationAttentionReceiptSchema,
  notificationAttentionSnapshotSchema,
  notificationAttentionTargetSchema,
} from "@board-game-organizer/schemas";
import {
  type InfiniteData,
  queryOptions,
  useMutation,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
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
import {
  attentionKey,
  attentionMatches,
  attentionReference,
  readReference,
} from "../notificationAttention";
import {
  attentionRoot,
  cachedAttention,
  notificationFilters,
  notificationReadAliases,
  projectAttentionRead,
} from "../notificationAttentionCache";
import { projectNotificationItemRead } from "../notificationItemRead";

export function notificationAttentionQuery(
  options: CommunityApiOptions,
  targets: readonly NotificationAttentionTarget[],
) {
  const sorted = [
    ...new Map(targets.map((target) => [attentionKey(target), target])).values(),
  ].sort((a, b) => attentionKey(a).localeCompare(attentionKey(b)));
  return queryOptions({
    queryKey: [...attentionRoot(options), sorted],
    queryFn: async ({ signal }) => {
      const snapshot = notificationAttentionSnapshotSchema.parse(
        await communityRequest(
          options,
          `notifications/attention?targets=${encodeURIComponent(JSON.stringify(sorted))}`,
          "GET",
          undefined,
          signal,
        ),
      );
      const received = new Set(snapshot.targets.map((row) => attentionKey(row.target)));
      if (
        received.size !== sorted.length ||
        snapshot.targets.length !== sorted.length ||
        sorted.some((target) => !received.has(attentionKey(target)))
      )
        throw new CommunityApiError(502, "INVALID_NOTIFICATION_ATTENTION");
      return snapshot;
    },
    enabled: Boolean(options.apiUrl && options.userId && options.enabled !== false),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
}
export function useNotificationAttention(
  options: CommunityApiOptions,
  targets: readonly NotificationAttentionTarget[],
) {
  const client = useQueryClient();
  const busy = useOptimisticBusy(["notifications", options.apiUrl, options.userId]);
  const valid = [
    ...new Map(
      targets
        .filter((target) => notificationAttentionTargetSchema.safeParse(target).success)
        .map((target) => [attentionKey(target), target]),
    ).values(),
  ].sort((a, b) => attentionKey(a).localeCompare(attentionKey(b)));
  const chunks: NotificationAttentionTarget[][] = [];
  for (let i = 0; i < valid.length; i += 50) chunks.push(valid.slice(i, i + 50));
  const queries = useQueries({
    queries: chunks.map((chunk) => ({
      ...notificationAttentionQuery(options, chunk),
      enabled: options.enabled !== false && Boolean(options.apiUrl && options.userId) && !busy(),
    })),
  });
  const rows = new Map(
    queries.flatMap(
      (query) => query.data?.targets.map((row) => [attentionKey(row.target), row] as const) ?? [],
    ),
  );
  return {
    get: (target: NotificationAttentionTarget): NotificationAttentionCount | undefined =>
      rows.get(attentionKey(target)) ?? cachedAttention(client, options, target)?.row,
    ready: queries.every((query) => query.data !== undefined),
    error: queries.find((query) => query.isError)?.error,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

type ReadVariables = {
  target: NotificationAttentionTarget;
  snapshot: NotificationAttentionSnapshot;
  owner: CommunityApiOptions;
};
export function useReadNotificationAttention(options: CommunityApiOptions) {
  const client = useQueryClient();
  const busy = useOptimisticBusy(["notifications", options.apiUrl, options.userId]);
  const mutation = useMutation({
    mutationKey: ["notifications", options.apiUrl, options.userId, "attention-read"],
    retry: false,
    mutationFn: async (variables: ReadVariables, context) => {
      const signal = await optimisticMutationSignal(client, context.mutationKey, variables);
      const response = await communityRequest(
        variables.owner,
        "notifications/attention",
        "PATCH",
        { target: variables.target, through: variables.snapshot.asOf },
        signal,
      );
      const parsed = notificationAttentionReceiptSchema.safeParse(response);
      if (
        !parsed.success ||
        !parsed.data.snapshot.targets.some(
          (row) => attentionKey(row.target) === attentionKey(variables.target),
        )
      )
        throw new CommunityApiError(502, "MUTATION_OUTCOME_UNKNOWN");
      return parsed.data;
    },
    onMutate: async (variables) => {
      if (variables.target.kind !== "item")
        variables.snapshot =
          cachedAttention(client, variables.owner, variables.target)?.snapshot ??
          variables.snapshot;
      const row = variables.snapshot.targets.find(
        (value) => attentionKey(value.target) === attentionKey(variables.target),
      );
      if (!row || variables.target.kind === "contact")
        throw new CommunityApiError(400, "Invalid read target");
      const reference = readReference(row),
        readAt = new Date().toISOString();
      const aliases = notificationReadAliases(
        client,
        variables.owner,
        variables.target,
        variables.snapshot.asOf,
      );
      const operation = await beginOptimisticOperation(
        client,
        [
          "notifications",
          variables.owner.apiUrl,
          variables.owner.userId,
          "target",
          attentionKey(variables.target),
        ],
        notificationFilters(variables.owner),
        (data, key) =>
          variables.target.kind === "item"
            ? projectNotificationItemRead(data, key, row, variables.snapshot.asOf, readAt)
            : projectAttentionRead(
                data,
                key,
                reference,
                row.direct,
                variables.snapshot.asOf,
                readAt,
              ),
        aliases,
      );
      return { operation, owner: variables.owner };
    },
    onSuccess: (_receipt, _variables, context) => {
      // Reads of disjoint targets remain concurrent. A receipt can predate another
      // write's ACK: commit owned projection, then obtain a fresh source snapshot.
      context?.operation.commit();
    },
    onError: async (error, variables, context) => {
      if (context && !context.operation.active) return;
      await context?.operation.reject(error);
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context || context.operation.signal.aborted) return;
      const root = ["notifications", context.owner.apiUrl, context.owner.userId];
      void client.invalidateQueries({
        ...notificationFilters(context.owner),
        refetchType: busy(root) ? "none" : "active",
      });
    },
  });
  const read = (target: NotificationAttentionTarget, captured?: NotificationAttentionSnapshot) => {
    if (
      !options.apiUrl ||
      !options.userId ||
      options.enabled === false ||
      target.kind === "contact" ||
      !notificationAttentionTargetSchema.safeParse(target).success
    )
      return;
    if (
      busy(["notifications", options.apiUrl, options.userId, "target", attentionKey(target)]) ||
      client
        .getMutationCache()
        .getAll()
        .some(
          (item) =>
            item.state.status === "pending" &&
            item.options.mutationKey?.[0] === "notifications" &&
            item.options.mutationKey?.[1] === options.apiUrl &&
            item.options.mutationKey?.[2] === options.userId &&
            item.options.mutationKey?.[3] === "attention-read" &&
            attentionKey((item.state.variables as ReadVariables).target) === attentionKey(target),
        )
    )
      return;
    if (captured) {
      if (
        captured.targets.some(
          (row) => attentionKey(row.target) === attentionKey(target) && row.direct > 0,
        )
      )
        mutation.mutate({ target, snapshot: captured, owner: { ...options } });
      return;
    }
    const found = cachedAttention(client, options, target);
    const foundQuery =
      found &&
      client
        .getQueryCache()
        .findAll({ queryKey: attentionRoot(options) })
        .find((query) => query.state.data === found.snapshot);
    if (
      found &&
      foundQuery &&
      !foundQuery.isStaleByTime(30_000) &&
      foundQuery.state.fetchStatus !== "fetching"
    ) {
      if (found.row.direct)
        mutation.mutate({ target, snapshot: found.snapshot, owner: { ...options } });
      return;
    }
    const covering = client
      .getQueryCache()
      .findAll({ queryKey: attentionRoot(options) })
      .find(
        (query) =>
          Array.isArray(query.queryKey[3]) &&
          (query.queryKey[3] as NotificationAttentionTarget[]).some(
            (value) => attentionKey(value) === attentionKey(target),
          ),
      );
    const query = notificationAttentionQuery(
      options,
      covering ? (covering.queryKey[3] as NotificationAttentionTarget[]) : [target],
    );
    const pending = client.fetchQuery(query);
    const instance = client.getQueryCache().find({ queryKey: query.queryKey, exact: true });
    void pending
      .then((snapshot) => {
        if (client.getQueryCache().find({ queryKey: query.queryKey, exact: true }) !== instance)
          return;
        if (
          snapshot.targets.find((row) => attentionKey(row.target) === attentionKey(target))?.direct
        )
          read(target);
      })
      // The owning count query exposes this read failure; notification reads stay toast-free.
      .catch(() => undefined);
  };
  return { read, error: mutation.error };
}
