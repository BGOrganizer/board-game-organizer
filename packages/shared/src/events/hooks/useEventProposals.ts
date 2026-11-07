"use client";
import type { EventProposalsResponse } from "@board-game-organizer/schemas";
import { hashKey, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import {
  type ClientProposalPage,
  EVENT_PROPOSAL_PAGE_SIZE,
  type EventProposalScope,
  eventProposalKeys,
  reconcileProposalAccessError,
} from "../eventProposalCache";
export function eventProposalsPageQuery(
  o: CommunityApiOptions,
  scope: EventProposalScope,
  cursor = "",
) {
  const key = eventProposalKeys.page(o, scope, cursor);
  const params = new URLSearchParams({
    kind: scope.kind,
    mode: scope.mode,
    limit: String(EVENT_PROPOSAL_PAGE_SIZE),
  });
  if (scope.tableId) params.set("tableId", scope.tableId);
  if (cursor) params.set("cursor", cursor);
  return queryOptions({
    queryKey: key,
    queryFn: async ({ signal, client }) => {
      try {
        return await communityRequest<EventProposalsResponse>(
          o,
          `events/${encodeURIComponent(scope.eventId)}/proposals?${params}`,
          "GET",
          undefined,
          signal,
        );
      } catch (error) {
        reconcileProposalAccessError(client, o, scope, error, key);
        throw error;
      }
    },
    enabled: Boolean(
      o.apiUrl &&
        o.userId &&
        o.enabled !== false &&
        scope.eventId &&
        scope.groupId &&
        (scope.kind !== "game" || scope.tableId),
    ),
    retry: (count, error) => !communityAccessDenied(error) && count < 1,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });
}
/** Fixed five-row source pages. Local cursor history is navigation, never a mirror of server records. */
export function useEventProposals(o: CommunityApiOptions, scope: EventProposalScope) {
  const client = useQueryClient();
  const identity = hashKey(eventProposalKeys.page(o, scope));
  const latest = useRef(identity),
    mounted = useRef(true);
  latest.current = identity;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [navigation, setNavigation] = useState({ identity, cursors: [""] });
  const cursors = navigation.identity === identity ? navigation.cursors : [""];
  const cursor = cursors.at(-1) ?? "";
  const q = useQuery(eventProposalsPageQuery(o, scope, cursor));
  const current = q.data as ClientProposalPage | undefined;
  return {
    ...q,
    hasVerifiedBase:
      Boolean(q.data) &&
      client.getQueryState(eventProposalKeys.page(o, scope, cursor))?.isInvalidated === false &&
      !communityAccessDenied(q.error),
    items: communityAccessDenied(q.error)
      ? []
      : (current?.items.slice(0, EVENT_PROPOSAL_PAGE_SIZE) ?? []),
    page: cursors.length,
    canPrevious: cursors.length > 1,
    previous: () => {
      if (mounted.current && latest.current === identity)
        setNavigation((old) =>
          old.identity === identity && old.cursors.length > 1
            ? { identity, cursors: old.cursors.slice(0, -1) }
            : old,
        );
    },
    next: () => {
      if (!mounted.current || latest.current !== identity) return;
      const next = q.data?.nextCursor;
      if (!next || q.isFetching) return;
      setNavigation((old) =>
        old.identity !== identity
          ? { identity, cursors: ["", next] }
          : old.cursors.at(-1) === cursor
            ? { identity, cursors: [...old.cursors, next] }
            : old,
      );
    },
  };
}
