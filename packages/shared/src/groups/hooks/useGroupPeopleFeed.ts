"use client";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import type { CommunityApiOptions } from "../../community/communityApi";
import { useGroupPeople } from "./useGroupRecords";
/** Source-paged accepted roster, then requests/invitations, then bans; never fetch every page. */
export function useGroupPeopleFeed(
  options: CommunityApiOptions,
  group: GroupRecordResponse,
  query = "",
) {
  const canView = options.enabled !== false && group.canViewMembers;
  const accepted = useGroupPeople({ ...options, enabled: canView }, group.id, "accepted", query);
  const pendingEnabled =
    canView && group.role === "admin" && accepted.isSuccess && !accepted.hasNextPage;
  const pending = useGroupPeople(
    { ...options, enabled: options.enabled !== false && pendingEnabled },
    group.id,
    "pending",
    query,
  );
  const bansEnabled = pendingEnabled && pending.isSuccess && !pending.hasNextPage;
  const bans = useGroupPeople(
    { ...options, enabled: options.enabled !== false && bansEnabled },
    group.id,
    "bans",
    query,
  );
  const sources = canView
    ? [accepted, ...(pendingEnabled ? [pending] : []), ...(bansEnabled ? [bans] : [])]
    : [];
  const next = sources.find((source) => source.hasNextPage);
  return {
    items: sources.flatMap((source) => source.items),
    isPending: sources.some((source) => source.isPending),
    isError: sources.some((source) => source.isError),
    error: sources.find((source) => source.isError)?.error,
    hasNextPage: Boolean(next),
    isFetchingNextPage: sources.some((source) => source.isFetchingNextPage),
    isFetchNextPageError: sources.some((source) => source.isFetchNextPageError),
    fetchNextPage: () => next?.fetchNextPage(),
    refetch: () => {
      for (const source of sources) void source.refetch();
    },
  };
}
