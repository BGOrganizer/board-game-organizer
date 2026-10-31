"use client";

import type {
  CommunityPageResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  TableInviteesPageResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { mergeCreationIntents } from "../../common/clientMutation";
import { useOptimisticCreations } from "../../common/hooks/useOptimisticCreations";
import { optimisticBaseData } from "../../common/optimisticOperation";
import { type CommunityApiOptions, communityRequest } from "../../community/communityApi";
import { isPersonalEventTableVisible } from "../eventList";
import {
  type ClientEventRecord,
  type CreateEventVariables,
  eventCreationMatches,
  eventCreationRecord,
} from "../eventOptimisticCreation";

type KeyOwner = Pick<CommunityApiOptions, "apiUrl" | "userId">;
type ListFilters = { groupId?: string; periods?: readonly ("past" | "future")[]; query?: string };
export const eventRecordKeys = {
  list: (o: KeyOwner, filters: ListFilters = {}) =>
    [
      ...eventRecordKeys.root(o),
      "list",
      {
        groupId: filters.groupId ?? null,
        periods: (["past", "future"] as const).filter(
          (period) => !filters.periods || filters.periods.includes(period),
        ),
        query: filters.query?.trim() ?? "",
      },
    ] as const,
  tables: (o: KeyOwner, id: string | null, filters: Omit<ListFilters, "groupId"> = {}) =>
    [
      ...eventRecordKeys.root(o),
      "tables",
      id,
      {
        periods: id
          ? null
          : (["past", "future"] as const).filter(
              (period) => !filters.periods || filters.periods.includes(period),
            ),
        query: filters.query?.trim() ?? "",
      },
    ] as const,
  root: (o: KeyOwner) => ["events", o.apiUrl, o.userId] as const,
  mutation: (o: KeyOwner, eventId: string, action?: string) =>
    [...eventRecordKeys.root(o), "mutation", eventId, ...(action ? [action] : [])] as const,
  detail: (o: KeyOwner, id: string) => [...eventRecordKeys.root(o), "detail", id] as const,
  table: (o: KeyOwner, id: string, table: string) =>
    [...eventRecordKeys.root(o), "table", id, table] as const,
};
function path(base: string, params: Record<string, string | undefined>, cursor: string) {
  const q = new URLSearchParams({ limit: "20" });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  if (cursor) q.set("cursor", cursor);
  return `${base}?${q}`;
}
function enabled(o: CommunityApiOptions) {
  return Boolean(o.apiUrl && o.userId && o.enabled !== false);
}
export function eventRecordsQuery(
  o: CommunityApiOptions,
  filters: { groupId?: string; periods?: readonly ("past" | "future")[]; query?: string } = {},
) {
  return infiniteQueryOptions({
    queryKey: eventRecordKeys.list(o, filters),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<PlannedEventResponse>>(
        o,
        path(
          "events",
          {
            groupId: filters.groupId,
            periods: filters.periods?.join(","),
            query: filters.query || undefined,
          },
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o),
    initialPageParam: "",
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useEventRecords(
  o: CommunityApiOptions,
  filters: Parameters<typeof eventRecordsQuery>[1] = {},
) {
  const q = useInfiniteQuery(eventRecordsQuery(o, filters));
  const records = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const creations = useOptimisticCreations<CreateEventVariables, PlannedEventResponse>(
    eventRecordKeys.mutation(o, "", "create"),
  );
  const local = o.userId
    ? creations
        .map((intent) => eventCreationRecord(intent, o.userId as string))
        .filter((row) => eventCreationMatches(row, filters))
    : [];
  const items: ClientEventRecord[] = mergeCreationIntents(records, local);
  return { ...q, isPending: q.isPending && !items.length, items };
}
export function useEventCreationDraft(o: CommunityApiOptions, draftId?: string) {
  return useOptimisticCreations<CreateEventVariables, PlannedEventResponse>(
    eventRecordKeys.mutation(o, "", "create"),
  ).find((intent) => intent.draftId === draftId);
}
export function eventRecordQuery(o: CommunityApiOptions, id: string) {
  return queryOptions({
    queryKey: eventRecordKeys.detail(o, id),
    queryFn: ({ signal }) =>
      communityRequest<PlannedEventResponse>(
        o,
        `events/${encodeURIComponent(id)}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o) && Boolean(id),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
}
export function useEventRecord(o: CommunityApiOptions, id: string) {
  const client = useQueryClient();
  return useQuery({
    ...eventRecordQuery(o, id),
    placeholderData: () =>
      client
        .getQueriesData<{ pages: CommunityPageResponse<PlannedEventResponse>[] }>({
          queryKey: eventRecordKeys.root(o),
          predicate: (q) => q.queryKey[3] === "list",
        })
        .flatMap(([, data]) => data?.pages.flatMap((p) => p.items) ?? [])
        .find((row) => row.id === id),
  });
}
export function recordTablesQuery(
  o: CommunityApiOptions,
  id: string | null,
  filters: { periods?: readonly ("past" | "future")[]; query?: string } = {},
) {
  return infiniteQueryOptions({
    queryKey: eventRecordKeys.tables(o, id, filters),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<PlannedTableResponse>>(
        o,
        path(
          id ? `events/${encodeURIComponent(id)}/tables` : "tables",
          {
            query: filters.query || undefined,
            ...(!id ? { periods: filters.periods?.join(",") } : {}),
          },
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o) && id !== "",
    initialPageParam: "",
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
}
export function useRecordTables(
  o: CommunityApiOptions,
  id: string | null,
  filters: Parameters<typeof recordTablesQuery>[2] = {},
) {
  const q = useInfiniteQuery(recordTablesQuery(o, id, filters));
  const items = useMemo(
    () =>
      (q.data?.pages.flatMap((p) => p.items) ?? []).filter(
        (row) => id !== null || isPersonalEventTableVisible(row),
      ),
    [q.data, id],
  );
  return { ...q, items };
}
export function useRecordTable(o: CommunityApiOptions, id: string, table: string) {
  const client = useQueryClient();
  const cached = client
    .getQueriesData<{ pages: CommunityPageResponse<PlannedTableResponse>[] }>({
      queryKey: eventRecordKeys.root(o),
      predicate: (q) => q.queryKey[3] === "tables",
    })
    .flatMap(
      ([key, data]) =>
        (optimisticBaseData(client, key) as typeof data)?.pages.flatMap((p) =>
          p.items.map((row) => ({ row, key })),
        ) ?? [],
    )
    .find(({ row }) => row.id === table && row.eventId === id);
  const q = useQuery({
    queryKey: eventRecordKeys.table(o, id, table),
    queryFn: ({ signal }) =>
      communityRequest<PlannedTableResponse>(
        o,
        `events/${encodeURIComponent(id)}/tables/${encodeURIComponent(table)}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o) && Boolean(id && table),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    ...(cached
      ? cached.row.gameVoteCounts &&
        (cached.row.eventStatus !== "TERMINATED" || cached.row.resultProfiles)
        ? {
            initialData: cached.row,
            initialDataUpdatedAt: client.getQueryState(cached.key)?.isInvalidated
              ? 0
              : client.getQueryState(cached.key)?.dataUpdatedAt,
          }
        : { placeholderData: cached.row }
      : {}),
  });
  return { ...q, data: q.data ?? cached?.row };
}
export function tableInviteesPageQuery(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  query = "",
) {
  return infiniteQueryOptions({
    queryKey: [...eventRecordKeys.root(o), "invitees", eventId, tableId, query],
    queryFn: ({ pageParam, signal }) =>
      communityRequest<TableInviteesPageResponse>(
        o,
        path(
          `events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}/invitations`,
          { query: query || undefined },
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o) && Boolean(eventId && tableId),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
    gcTime: 30 * 60_000,
  });
}
export function useTableSeats(
  o: CommunityApiOptions,
  id: string,
  table: string,
  pending = false,
  query = "",
) {
  const q = useInfiniteQuery({
    queryKey: [...eventRecordKeys.root(o), "seats", id, table, pending, query],
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<TableSeatResponse>>(
        o,
        path(
          `events/${encodeURIComponent(id)}/tables/${encodeURIComponent(table)}/seats`,
          { pending: String(pending), query: query || undefined },
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o) && Boolean(id && table),
    initialPageParam: "",
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
  return {
    ...q,
    items:
      q.data?.pages
        .flatMap((p) => p.items)
        .filter((row) => row.status === (pending ? "PENDING" : "ACCEPTED")) ?? [],
  };
}
