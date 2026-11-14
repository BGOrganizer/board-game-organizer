import type {
  TableInviteeResponse,
  TableInviteesPageResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";

export type TableInviteeIntent = {
  mutationId: number;
  kind: "invite" | "remove";
  userId: string;
  status: "idle" | "pending" | "success" | "error";
  failed: boolean;
  aborted: boolean;
  uncertain: boolean;
  acknowledgedVersion?: number;
  person?: Pick<TableSeatResponse, "userId" | "name" | "username" | "avatarUrl">;
};
type CandidateSnapshot = { query: string; pages: readonly TableInviteesPageResponse[] };
function matches(person: NonNullable<TableInviteeIntent["person"]>, query: string) {
  const text = query.toLocaleLowerCase();
  return [person.name, person.username].some((value) => value?.toLocaleLowerCase().includes(text));
}

/** Presentation-only release intent, outside source pages. POST still revalidates eligibility. */
export function tableInviteeItems(
  canonical: readonly (TableInviteeResponse & { optimisticInvited?: boolean })[],
  intents: readonly TableInviteeIntent[],
  snapshots: readonly CandidateSnapshot[],
  query: string,
) {
  const seen = new Set<string>();
  const excluded = new Set<string>();
  const released: TableInviteeResponse[] = [];
  for (const intent of [...intents].sort((a, b) => b.mutationId - a.mutationId)) {
    if (
      intent.aborted ||
      intent.status === "idle" ||
      seen.has(intent.userId) ||
      (intent.failed && intent.kind === "invite")
    )
      continue;
    seen.add(intent.userId);
    if (intent.failed) continue;
    if (intent.kind === "invite") {
      if (intent.status === "pending") excluded.add(intent.userId);
      continue;
    }
    const person = intent.person;
    if (
      !person ||
      person.userId !== intent.userId ||
      intent.status === "error" ||
      (intent.status === "success" && !intent.acknowledgedVersion) ||
      (intent.uncertain && !intent.acknowledgedVersion) ||
      (query && !matches(person, query))
    )
      continue;
    // Only a complete, matching authorized snapshot at/after the receipt can
    // retire this hint. Empty pre-ACK pages and partial paging prove nothing.
    const acknowledgedVersion = intent.acknowledgedVersion;
    if (
      acknowledgedVersion &&
      snapshots.some(
        (snapshot) =>
          (!snapshot.query || matches(person, snapshot.query)) &&
          snapshot.pages.length > 0 &&
          snapshot.pages[snapshot.pages.length - 1].nextCursor === null &&
          snapshot.pages.every(
            (page) =>
              (page.eventVersion ?? 0) >= acknowledgedVersion &&
              !page.items.some((row) => row.id === intent.userId),
          ),
      )
    )
      continue;
    released.push({
      id: person.userId,
      name: person.name ?? person.username ?? person.userId,
      username: person.username,
      avatarUrl: person.avatarUrl,
      email: null,
      invitationBlockReason: null,
    });
  }
  const items = canonical.filter((row) => !row.optimisticInvited && !excluded.has(row.id));
  const known = new Set(items.map((row) => row.id));
  return [...released.filter((row) => !known.has(row.id)), ...items];
}
