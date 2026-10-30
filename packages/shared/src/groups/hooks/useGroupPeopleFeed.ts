"use client";
import {
  type GroupPersonResponse,
  type GroupRecordResponse,
  groupMembershipSchema,
} from "@board-game-organizer/schemas";
import { clientMutationPhase } from "../../common/clientMutation";
import { useScopedMutations } from "../../common/hooks/useScopedMutations";
import type { CommunityApiOptions } from "../../community/communityApi";
import { groupRecordKeys, useGroupPeople } from "./useGroupRecords";

type ClientGroupPerson = GroupPersonResponse & { optimisticInvited?: true };
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
  const mutations = useScopedMutations({
    mutationKey: [...groupRecordKeys.root(options), "mutation"],
  });
  const seen = new Set<string>();
  const pendingComplete =
    pendingEnabled &&
    pending.isSuccess &&
    !pending.hasNextPage &&
    !pending.isFetching &&
    !pending.isStale;
  const invitations = [...mutations]
    .sort((a, b) => b.mutationId - a.mutationId)
    .flatMap<{
      userId: string;
      person?: Pick<GroupPersonResponse, "name" | "username" | "avatarUrl">;
      membership: GroupPersonResponse["membership"];
    }>((mutation) => {
      const input = mutation.state.variables as
        | {
            id?: string;
            userId?: string;
            input?: { userId?: string };
            person?: Pick<GroupPersonResponse, "name" | "username" | "avatarUrl">;
          }
        | undefined;
      const userId = input?.userId ?? input?.input?.userId;
      if (
        !canView ||
        group.role !== "admin" ||
        input?.id !== group.id ||
        !userId ||
        seen.has(userId) ||
        mutation.state.status === "idle"
      )
        return [];
      if (
        mutation.state.status === "error" &&
        clientMutationPhase("error", mutation.state.error) === "failed"
      )
        return [];
      seen.add(userId);
      if (mutation.options.mutationKey?.at(-1) !== "invite") return [];
      if (mutation.state.status === "pending")
        return [{ userId, person: input.person, membership: null }];
      const receipt = groupMembershipSchema.safeParse(mutation.state.data);
      // Acknowledged off-page invitations stay visible outside API pages until the
      // authorized pending stream catches up. Later target writes supersede them.
      return mutation.state.status === "success" &&
        !pendingComplete &&
        receipt.success &&
        receipt.data.groupId === group.id &&
        receipt.data.userId === userId &&
        receipt.data.status === "PENDING" &&
        receipt.data.kind === "INVITATION"
        ? [{ userId, person: input.person, membership: receipt.data }]
        : [];
    });
  const canonical = sources
    .flatMap((source) => source.items)
    .filter(
      (person) =>
        person.ban ||
        !person.membership ||
        person.membership.status === "PENDING" ||
        person.membership.status === "ACCEPTED",
    );
  const known = new Set(canonical.map((person) => person.userId));
  const local = new Map(invitations.map((intent) => [intent.userId, intent]));
  const items: ClientGroupPerson[] = [...local.values()]
    .filter(
      (intent) =>
        !known.has(intent.userId) &&
        (!query ||
          (intent.person?.name ?? intent.person?.username ?? intent.userId)
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())),
    )
    .map((intent) => ({
      userId: intent.userId,
      name: intent.person?.name ?? null,
      username: intent.person?.username ?? null,
      avatarUrl: intent.person?.avatarUrl ?? null,
      isAdmin: false,
      membership: intent.membership,
      ban: null,
      ...(!intent.membership ? { optimisticInvited: true as const } : {}),
    }));
  items.push(...canonical);
  return {
    items,
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
