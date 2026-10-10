"use client";

import type {
  CommunityPageResponse,
  EventBooking,
  EventBookingResponse,
  EventPeriod,
  EventResponse,
  EventTableResponse,
  SaveEventInput,
  UpdateEventInput,
} from "@board-game-organizer/schemas";
import { eventPeriods } from "@board-game-organizer/schemas";
import {
  type InfiniteData,
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import type { MutationFeedbackAction } from "../../common/mutationFeedback";
import {
  type CommunityApiOptions,
  communityPagePath,
  communityRequest,
} from "../../community/communityApi";
import { organizationKeys } from "../../organizations/hooks/useOrganizations";
import { eventMatchesFilters } from "../eventList";
import { useEventWindow } from "./useEventWindow";

type EventOwner = Pick<CommunityApiOptions, "apiUrl" | "userId">;
export const eventKeys = {
  root: (o: EventOwner) => ["events", o.apiUrl, o.userId] as const,
  detail: (o: EventOwner, id: string) => [...eventKeys.root(o), "detail", id] as const,
  list: (
    o: CommunityApiOptions,
    org: string,
    query: string,
    periods: readonly EventPeriod[] = eventPeriods,
  ) => {
    const selected = eventPeriods.filter((period) => periods.includes(period));
    return [
      ...eventKeys.root(o),
      "list",
      org,
      query,
      ...(selected.length !== eventPeriods.length ? [selected.join(",")] : []),
    ] as const;
  },
  tables: (o: CommunityApiOptions, id: string, query: string) =>
    [...eventKeys.root(o), "tables", id, query] as const,
  table: (o: CommunityApiOptions, id: string, table: string) =>
    [...eventKeys.root(o), "table", id, table] as const,
  bookings: (o: CommunityApiOptions, id: string, table: string) =>
    [...eventKeys.root(o), "bookings", id, table] as const,
};
const enabled = (o: CommunityApiOptions) => o.enabled !== false && Boolean(o.apiUrl && o.userId);
export function eventsPageQuery(
  o: CommunityApiOptions,
  org = "",
  query = "",
  periods: readonly EventPeriod[] = eventPeriods,
) {
  const selected = eventPeriods.filter((period) => periods.includes(period));
  const path = org ? `organizations/${encodeURIComponent(org)}/events` : "events";
  return infiniteQueryOptions({
    queryKey: eventKeys.list(o, org, query, selected),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<EventResponse>>(
        o,
        communityPagePath(
          selected.length === eventPeriods.length ? path : `${path}?periods=${selected.join(",")}`,
          query,
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: enabled(o),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useEventList(
  o: CommunityApiOptions,
  org = "",
  query = "",
  periods: readonly EventPeriod[] = eventPeriods,
) {
  const list = useInfiniteQuery(eventsPageQuery(o, org, query, periods));
  const client = useQueryClient();
  const { apiUrl, userId } = o;
  useEffect(() => {
    for (const row of list.data?.pages.flatMap((page) => page.items) ?? []) {
      const key = eventKeys.detail({ apiUrl, userId }, row.id);
      const previous = client.getQueryData<EventResponse>(key);
      const updated = client.getQueryState(key)?.dataUpdatedAt ?? 0;
      if (!previous || (row.version >= previous.version && list.dataUpdatedAt >= updated))
        client.setQueryData(key, row, { updatedAt: list.dataUpdatedAt });
    }
  }, [apiUrl, userId, list.data, list.dataUpdatedAt, client]);
  return { ...list, items: list.data?.pages.flatMap((p) => p.items) ?? [] };
}
export function eventDetailQuery(o: CommunityApiOptions, id: string) {
  return queryOptions({
    queryKey: eventKeys.detail(o, id),
    queryFn: ({ signal }) =>
      communityRequest<EventResponse>(
        o,
        `events/${encodeURIComponent(id)}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o) && Boolean(id),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useEvent(o: CommunityApiOptions, id: string) {
  const result = useQuery(eventDetailQuery(o, id));
  const client = useQueryClient();
  const open = useEventWindow(result.data);
  const closedId = result.data?.status === "PUBLISHED" && !result.data.closedAt && !open ? id : "";
  const organizationId = result.data?.organizationId;
  const { apiUrl, userId } = o;
  useEffect(() => {
    if (!closedId) return;
    // One cutoff transition, not polling. Keep cached fields while authoritative rosters load.
    void client.invalidateQueries({
      queryKey: eventKeys.root({ apiUrl, userId }),
      predicate: (q) =>
        q.queryKey[4] === closedId ||
        (q.queryKey[3] === "list" && (q.queryKey[4] === "" || q.queryKey[4] === organizationId)),
      refetchType: "active",
    });
  }, [client, closedId, organizationId, apiUrl, userId]);
  return result;
}
export function eventTablesQuery(o: CommunityApiOptions, id: string, query = "") {
  return infiniteQueryOptions({
    queryKey: eventKeys.tables(o, id, query),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<EventTableResponse>>(
        o,
        communityPagePath(`events/${encodeURIComponent(id)}/tables`, query, pageParam),
        "GET",
        undefined,
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: enabled(o) && Boolean(id),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useEventTables(o: CommunityApiOptions, id: string, query = "") {
  const list = useInfiniteQuery(eventTablesQuery(o, id, query));
  return { ...list, items: list.data?.pages.flatMap((p) => p.items) ?? [] };
}
export function eventTableQuery(o: CommunityApiOptions, id: string, table: string) {
  return queryOptions({
    queryKey: eventKeys.table(o, id, table),
    queryFn: ({ signal }) =>
      communityRequest<EventTableResponse>(
        o,
        `events/${encodeURIComponent(id)}/tables/${encodeURIComponent(table)}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: enabled(o) && Boolean(id && table),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useEventTable(o: CommunityApiOptions, id: string, table: string) {
  return useQuery(eventTableQuery(o, id, table));
}
export function eventBookingsQuery(o: CommunityApiOptions, id: string, table: string) {
  return infiniteQueryOptions({
    queryKey: eventKeys.bookings(o, id, table),
    queryFn: ({ pageParam, signal }) =>
      communityRequest<CommunityPageResponse<EventBookingResponse>>(
        o,
        communityPagePath(
          `events/${encodeURIComponent(id)}/tables/${encodeURIComponent(table)}/bookings`,
          "",
          pageParam,
        ),
        "GET",
        undefined,
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: enabled(o) && Boolean(id && table),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
}
export function useEventBookings(o: CommunityApiOptions, id: string, table: string) {
  const list = useInfiniteQuery(eventBookingsQuery(o, id, table));
  return { ...list, items: list.data?.pages.flatMap((p) => p.items) ?? [] };
}
export function patchEventCache<T extends { id: string }>(
  data: unknown,
  patch: (row: T) => T | null,
): unknown {
  if (!data || typeof data !== "object") return data;
  if ("id" in data) return patch(data as T) ?? data;
  if ("pages" in data && Array.isArray(data.pages)) {
    const source = data as InfiniteData<CommunityPageResponse<T>>;
    const pages = source.pages.map((page) => {
      const items = page.items.flatMap((row) => {
        const next = patch(row);
        return next ? [next] : [];
      });
      return items.length === page.items.length &&
        items.every((row, index) => row === page.items[index])
        ? page
        : { ...page, items };
    });
    return pages.every((page, index) => page === source.pages[index]) ? data : { ...source, pages };
  }
  return data;
}
export type BookingAction = "accept" | "decline" | "approve" | "reject" | "cancel" | "remove";
export const bookingFeedback: Record<BookingAction, MutationFeedbackAction> = {
  accept: "accept_event_invitation",
  decline: "decline_event_invitation",
  approve: "approve_event_booking",
  reject: "reject_event_booking",
  cancel: "cancel_event_booking",
  remove: "remove_event_player",
};
export function useEventActions(o: CommunityApiOptions) {
  const client = useQueryClient();
  const root = eventKeys.root(o);
  const busy = useIsMutating({ mutationKey: root }) > 0;
  async function begin(
    action: MutationFeedbackAction,
    patch?: (key: readonly unknown[], data: unknown) => unknown,
  ) {
    await client.cancelQueries({ queryKey: root });
    const snapshots: [readonly unknown[], unknown][] = [];
    if (patch)
      for (const [key, data] of client.getQueriesData({ queryKey: root })) {
        const next = patch(key, data);
        if (next !== data) {
          snapshots.push([key, data]);
          client.setQueryData(key, next);
        }
      }
    o.feedback?.onOptimisticUpdate?.(action);
    return { snapshots, action };
  }
  function undo(
    error: Error,
    ctx: Awaited<ReturnType<typeof begin>> | undefined,
    fallback: MutationFeedbackAction,
  ) {
    for (const [key, data] of ctx?.snapshots ?? []) client.setQueryData(key, data);
    o.feedback?.onError?.(error, ctx?.action ?? fallback);
  }
  async function settle(
    data: unknown,
    _error: Error | null,
    variables: string | { id?: string; eventId?: string; organizationId?: string },
  ) {
    const response = data as { id?: string; eventId?: string; organizationId?: string } | undefined;
    const eventId =
      response?.eventId ??
      (response?.organizationId ? response.id : undefined) ??
      (typeof variables === "string" ? variables : (variables.eventId ?? variables.id));
    const cachedEvent = eventId
      ? client.getQueryData<EventResponse>(eventKeys.detail(o, eventId))
      : undefined;
    const org =
      response?.organizationId ??
      (typeof variables === "string" ? undefined : variables.organizationId) ??
      cachedEvent?.organizationId;
    const changesList = typeof variables === "string" || !variables.eventId;
    await client.invalidateQueries({
      queryKey: root,
      predicate: (q) =>
        q.queryKey[4] === eventId ||
        (q.queryKey[3] === "list" &&
          (changesList || q.queryKey[4] === "" || q.queryKey[4] === org)),
      refetchType: "none",
    });
    await client.refetchQueries({
      queryKey: root,
      predicate: (q) =>
        q.queryKey[4] === eventId ||
        (q.queryKey[3] === "list" && (q.queryKey[4] === "" || q.queryKey[4] === org)),
      type: "active",
    });
    if (changesList && org)
      await client.invalidateQueries({
        queryKey: organizationKeys.root(o),
        predicate: (q) =>
          q.queryKey[3] === "list" || (q.queryKey[3] === "detail" && q.queryKey[4] === org),
        refetchType: "active",
      });
    await client.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === "matches" &&
        q.queryKey.includes(o.apiUrl) &&
        q.queryKey.includes(o.userId),
      refetchType: "none",
    });
  }
  const create = useMutation({
    mutationKey: root,
    mutationFn: ({ organizationId, input }: { organizationId: string; input: SaveEventInput }) =>
      communityRequest<EventResponse>(
        o,
        `organizations/${encodeURIComponent(organizationId)}/events`,
        "POST",
        input,
      ),
    onMutate: () => begin("create_event"),
    onError: (e, _v, c) => undo(e, c, "create_event"),
    onSuccess: (row) => client.setQueryData(eventKeys.detail(o, row.id), row),
    onSettled: settle,
  });
  const update = useMutation({
    mutationKey: root,
    mutationFn: ({ id, input }: { id: string; input: UpdateEventInput }) =>
      communityRequest<EventResponse>(o, `events/${encodeURIComponent(id)}`, "PATCH", input),
    onMutate: ({ id, input }) =>
      begin("update_event", (key, data) =>
        key[3] === "detail" || key[3] === "list"
          ? patchEventCache<EventResponse>(data, (row) =>
              row.id === id ? { ...row, name: input.name, location: input.location } : row,
            )
          : data,
      ),
    onError: (e, _v, c) => undo(e, c, "update_event"),
    onSuccess: (row) => {
      client.setQueryData(eventKeys.detail(o, row.id), row);
      for (const [key, data] of client.getQueriesData({ queryKey: root })) {
        if (key[3] !== "list") continue;
        client.setQueryData(
          key,
          patchEventCache<EventResponse>(data, (previous) => {
            if (previous.id !== row.id) return previous;
            const periods =
              key[6] === undefined
                ? eventPeriods
                : eventPeriods.filter((period) => String(key[6]).split(",").includes(period));
            return eventMatchesFilters(row, String(key[5] ?? ""), periods) ? row : null;
          }),
        );
      }
    },
    onSettled: settle,
  });
  const cancel = useMutation({
    mutationKey: root,
    mutationFn: (id: string) => communityRequest(o, `events/${encodeURIComponent(id)}`, "DELETE"),
    onMutate: (id) =>
      begin("cancel_event", (key, data) =>
        key[3] === "list"
          ? patchEventCache<EventResponse>(data, (row) => (row.id === id ? null : row))
          : data,
      ),
    onError: (e, _v, c) => undo(e, c, "cancel_event"),
    onSettled: settle,
  });
  const request = useMutation({
    mutationKey: root,
    mutationFn: ({ eventId, tableId }: { eventId: string; tableId: string }) =>
      communityRequest<EventBooking>(
        o,
        `events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}/bookings`,
        "POST",
        {},
      ),
    onMutate: () => begin("request_event_booking"),
    onError: (e, _v, c) => undo(e, c, "request_event_booking"),
    onSettled: settle,
  });
  const invite = useMutation({
    mutationKey: root,
    mutationFn: ({
      eventId,
      tableId,
      userId,
    }: {
      eventId: string;
      tableId: string;
      userId: string;
    }) =>
      communityRequest<EventBooking>(
        o,
        `events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}/invitations`,
        "POST",
        { userId },
      ),
    onMutate: () => begin("invite_event_player"),
    onError: (e, _v, c) => undo(e, c, "invite_event_player"),
    onSettled: settle,
  });
  const booking = useMutation({
    mutationKey: root,
    mutationFn: ({ id, action }: { id: string; action: BookingAction; eventId: string }) =>
      communityRequest<EventBooking>(o, `event-bookings/${encodeURIComponent(id)}`, "PATCH", {
        action,
      }),
    onMutate: ({ id, action }) =>
      begin(bookingFeedback[action], (key, data) =>
        key[3] === "bookings" && ["cancel", "remove", "decline", "reject"].includes(action)
          ? patchEventCache<EventBookingResponse>(data, (row) => (row.id === id ? null : row))
          : data,
      ),
    onError: (e, v, c) => undo(e, c, bookingFeedback[v.action]),
    onSettled: settle,
  });
  return { create, update, cancel, request, invite, booking, busy };
}
