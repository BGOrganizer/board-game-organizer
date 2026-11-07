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
export function eventOptionsRequireVote(options: readonly unknown[]) {
  return options.length > 1;
}

/** Singleton settings are accepted by participation, not persisted as preference ballots. */
export function eventVotingChoices<V extends EventVote>(
  options: ReadonlyArray<{ id: string }>,
  choices: Readonly<Record<string, V>>,
): Record<string, V> {
  return eventOptionsRequireVote(options)
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
) {
  return (
    eventOptionsRequireVote(options) &&
    vote !== "UNKNOWN" &&
    options.some((option) => option.id === optionId) &&
    options.some((option) => {
      const value = option.id === optionId ? vote : choices[option.id];
      return value === "YES" || value === "IF_NEEDED";
    })
  );
}
/** Single options need no ballot; multiple options need all answers and a positive choice.
 * Positive singleton payloads from older clients remain valid, but are not stored as votes. */
export function eventOptionVotesAreComplete(
  options: ReadonlyArray<{ id: string }>,
  choices: Readonly<Record<string, EventVote>>,
): boolean {
  if (options.length === 1 && Object.keys(choices).length === 0) return true;
  return (
    options.length > 0 &&
    Object.keys(choices).length === options.length &&
    options.every((option) => ["YES", "NO", "IF_NEEDED"].includes(choices[option.id])) &&
    options.some((option) => choices[option.id] === "YES" || choices[option.id] === "IF_NEEDED")
  );
}
/** Each multi-option dimension needs explicit choices; singleton settings need none. */
export function eventJoinAvailabilityIsComplete(
  event: { dates: ReadonlyArray<{ id: string }>; locations: ReadonlyArray<{ id: string }> },
  votes: Pick<JoinEventAvailability, "dateVotes" | "locationVotes">,
): boolean {
  return (
    [
      [event.dates, votes.dateVotes],
      [event.locations, votes.locationVotes],
    ] as const
  ).every(([options, choices]) => eventOptionVotesAreComplete(options, choices));
}
