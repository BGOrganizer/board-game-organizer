import type {
  EventVote,
  EventVoteCounts,
  OptionVoteVoters,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";

export function withoutEventVoteVoters({
  voteVoters: _privateBallots,
  ...event
}: PlannedEventResponse) {
  return event;
}
/** Ballots must already be restricted to distinct, accepted eligible participants. */
export function eventVoteCounts(
  options: readonly string[],
  ballots: readonly Readonly<Record<string, EventVote>>[],
): Record<string, EventVoteCounts> {
  return Object.fromEntries(
    options.map((id) => {
      const counts: EventVoteCounts = { YES: 0, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 };
      for (const ballot of ballots) counts[ballot[id] ?? "UNKNOWN"]++;
      return [id, counts];
    }),
  );
}
export function changeEventVoteCounts(
  counts: Record<string, EventVoteCounts> | undefined,
  id: string,
  previous: EventVote,
  next: EventVote,
) {
  const old = counts?.[id];
  if (!old || previous === next) return counts;
  return {
    ...counts,
    [id]: { ...old, [previous]: Math.max(0, old[previous] - 1), [next]: old[next] + 1 },
  };
}

const visibleVotes = ["YES", "IF_NEEDED", "NO"] as const;

export function hasOptionVoters(voters: OptionVoteVoters | undefined): voters is OptionVoteVoters {
  return voters !== undefined && visibleVotes.some((vote) => voters[vote].length > 0);
}

/** Update only the current actor in a previously authorized voter projection. */
export function changeGameVoteVoters(
  groups: OptionVoteVoters,
  actor: NonNullable<PlannedTableResponse["myRegistration"]>,
  vote: EventVote,
): OptionVoteVoters {
  const previous = visibleVotes.find((key) =>
    groups[key].some((row) => row.userId === actor.userId),
  );
  const next = vote === "UNKNOWN" ? undefined : vote;
  if (previous === next) return groups;

  const knownIdentity = previous && groups[previous].find((row) => row.userId === actor.userId);
  return {
    ...groups,
    ...(previous
      ? { [previous]: groups[previous].filter((row) => row.userId !== actor.userId) }
      : {}),
    ...(next
      ? {
          [next]: [
            ...groups[next],
            knownIdentity || {
              userId: actor.userId,
              name:
                actor.name && actor.name !== actor.email ? actor.name : (actor.username ?? null),
              username: actor.username ?? null,
              avatarUrl: actor.avatarUrl ?? null,
            },
          ],
        }
      : {}),
  };
}
