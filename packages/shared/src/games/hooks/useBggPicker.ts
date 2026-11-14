import type { BggPickerResponse } from "@board-game-organizer/schemas";
import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import {
  CommunityApiError,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";

export function bggPickerUnavailable(error: unknown) {
  return (
    communityAccessDenied(error) ||
    (error instanceof CommunityApiError &&
      error.status === 409 &&
      error.code === "BGG_PICKER_CHANGED")
  );
}

export type BggPickerTableScope = {
  eventId: string;
  tableId: string;
  /** Cache revocation metadata only. The API resolves current Group authority itself. */
  groupId?: string | null;
};

export function bggPickerQuery({
  apiUrl,
  getToken,
  userId,
  query,
  collection,
  participants = false,
  snapshot,
  protectionBypass,
  proposalScope,
  tableScope,
}: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  query: string;
  /** Older callers may supply this; no collection chips selected always means catalog. */
  search?: boolean;
  collection: boolean;
  participants?: boolean;
  snapshot?: string | null;
  protectionBypass?: string | null;
  proposalScope?: { eventId: string; tableId: string };
  tableScope?: BggPickerTableScope;
}) {
  const trimmed = query.trim();
  const search = !collection && !participants;
  return infiniteQueryOptions({
    queryKey: [
      "bgg-picker",
      apiUrl,
      userId,
      trimmed,
      search,
      collection,
      snapshot,
      proposalScope ?? null,
      "sources-v2",
      participants,
      tableScope ?? null,
    ],
    enabled:
      Boolean(userId) &&
      ((search && trimmed.length >= 4) ||
        (collection && Boolean(snapshot)) ||
        (participants && Boolean(tableScope))),
    initialPageParam: "",
    queryFn: async ({ pageParam, signal }): Promise<BggPickerResponse> => {
      const params = new URLSearchParams({
        query: trimmed,
        search: search ? "1" : "0",
        collection: collection ? "1" : "0",
        participants: participants ? "1" : "0",
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(proposalScope
          ? { proposalEventId: proposalScope.eventId, proposalTableId: proposalScope.tableId }
          : {}),
        ...(participants && tableScope
          ? { participantEventId: tableScope.eventId, participantTableId: tableScope.tableId }
          : {}),
      });
      return communityRequest<BggPickerResponse>(
        { apiUrl, userId, getToken, protectionBypass },
        `bgg/picker?${params}`,
        "GET",
        undefined,
        signal,
      );
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: proposalScope || tableScope ? 0 : 5 * 60_000,
  });
}

export function useBggPicker(options: Parameters<typeof bggPickerQuery>[0]) {
  return useInfiniteQuery(bggPickerQuery(options));
}
