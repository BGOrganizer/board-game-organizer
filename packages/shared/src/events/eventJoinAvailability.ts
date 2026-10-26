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
export function eventAvailabilityVoteIsAllowed(
  options: ReadonlyArray<{ id: string }>,
  choices: Readonly<Record<string, EventVote>>,
  optionId: string,
  vote: EventVote,
) {
  return (
    vote !== "UNKNOWN" &&
    options.some((option) => option.id === optionId) &&
    options.some((option) => {
      const value = option.id === optionId ? vote : choices[option.id];
      return value === "YES" || value === "IF_NEEDED";
    })
  );
}
/** All options need an explicit answer, with at least one usable date and venue. */
export function eventJoinAvailabilityIsComplete(
  event: { dates: ReadonlyArray<{ id: string }>; locations: ReadonlyArray<{ id: string }> },
  votes: Pick<JoinEventAvailability, "dateVotes" | "locationVotes">,
): boolean {
  return (
    [
      [event.dates, votes.dateVotes],
      [event.locations, votes.locationVotes],
    ] as const
  ).every(
    ([options, choices]) =>
      options.length > 0 &&
      Object.keys(choices).length === options.length &&
      options.every((option) => ["YES", "NO", "IF_NEEDED"].includes(choices[option.id])) &&
      options.some((option) => choices[option.id] === "YES" || choices[option.id] === "IF_NEEDED"),
  );
}
