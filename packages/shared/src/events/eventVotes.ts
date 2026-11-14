import type { EventVote, EventVoteCounts } from "@board-game-organizer/schemas";
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
