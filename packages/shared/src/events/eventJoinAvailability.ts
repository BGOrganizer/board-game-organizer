import type {
  EventVote,
  JoinEventAvailability,
  TableRegistration,
} from "@board-game-organizer/schemas";
export function hasOtherAcceptedTable(
  registrations: ReadonlyArray<Pick<TableRegistration, "status" | "tableId">>,
  tableId: string,
) {
  return registrations.some((row) => row.status === "ACCEPTED" && row.tableId !== tableId);
}
export function eventOptionsRequireVote(options: readonly unknown[], requireSingleVote = false) {
  return options.length > 1 || (options.length === 1 && requireSingleVote);
}

/** Ordinary singleton settings are accepted through participation without a preference ballot. */
export function eventVotingChoices<V extends EventVote>(
  options: ReadonlyArray<{ id: string }>,
  choices: Readonly<Record<string, V>>,
  requireSingleVote = false,
): Record<string, V> {
  return eventOptionsRequireVote(options, requireSingleVote)
    ? Object.fromEntries(
        options
          .filter((option) => Object.hasOwn(choices, option.id))
          .map((option) => [option.id, choices[option.id]]),
      )
    : {};
}

export function eventAvailabilityVoteIsAllowed(
  options: ReadonlyArray<{ id: string }>,
  choices: Readonly<Record<string, EventVote>>,
  optionId: string,
  vote: EventVote,
  requireSingleVote = false,
) {
  return (
    eventOptionsRequireVote(options, requireSingleVote) &&
    vote !== "UNKNOWN" &&
    options.some((option) => option.id === optionId) &&
    (options.length === 1 ||
      options.some((option) => {
        const value = option.id === optionId ? vote : choices[option.id];
        return value === "YES" || value === "IF_NEEDED";
      }))
  );
}
/** Enrollment requires all active answers and a positive choice for each votable category.
 * Positive payloads for ordinary singletons remain valid for older clients. */
export function eventOptionVotesAreComplete(
  options: ReadonlyArray<{ id: string }>,
  choices: Readonly<Record<string, EventVote>>,
  requireSingleVote = false,
): boolean {
  if (options.length === 1 && !requireSingleVote && Object.keys(choices).length === 0) return true;
  return (
    options.length > 0 &&
    Object.keys(choices).length === options.length &&
    options.every((option) => ["YES", "NO", "IF_NEEDED"].includes(choices[option.id])) &&
    options.some((option) => choices[option.id] === "YES" || choices[option.id] === "IF_NEEDED")
  );
}
/** Missing ballots come first; an all-negative set points to its first option. */
export function eventFirstInvalidVote(
  options: ReadonlyArray<{ id: string }>,
  choices: Readonly<Record<string, EventVote>>,
  requireSingleVote = false,
): number | undefined {
  if (!options.length || eventOptionVotesAreComplete(options, choices, requireSingleVote))
    return undefined;
  return Math.max(
    0,
    options.findIndex((option) => !["YES", "NO", "IF_NEEDED"].includes(choices[option.id])),
  );
}
/** Multiple options and changed singletons need explicit choices. */
export function eventJoinAvailabilityIsComplete(
  event: {
    dates: ReadonlyArray<{ id: string }>;
    locations: ReadonlyArray<{ id: string }>;
    dateVoteRequired?: boolean;
    locationVoteRequired?: boolean;
  },
  votes: Pick<JoinEventAvailability, "dateVotes" | "locationVotes">,
): boolean {
  return (
    [
      [event.dates, votes.dateVotes, event.dateVoteRequired],
      [event.locations, votes.locationVotes, event.locationVoteRequired],
    ] as const
  ).every(([options, choices, required]) =>
    eventOptionVotesAreComplete(options, choices, required),
  );
}
