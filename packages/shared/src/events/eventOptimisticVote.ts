import type {
  ChangeEventVoteInput,
  PlannedEventResponse,
  PlannedTableResponse,
  TableRegistration,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { mapCommunityCache } from "../community/queryCache";
import { changeEventVoteCounts } from "./eventVotes";

type Row = PlannedEventResponse | PlannedTableResponse | TableSeatResponse;
function gameVote(
  registration: TableRegistration,
  input: Extract<ChangeEventVoteInput, { kind: "game" }>,
) {
  return {
    ...registration,
    gameVotes: { ...registration.gameVotes, [input.gameId]: input.vote },
  };
}

/** A user's pending ballot is an intent, not an old whole-Event version. Rebase
 * just that field over earlier ACKs; never restore removed options or consent. */
export function optimisticEventVote(
  data: unknown,
  eventId: string,
  userId: string | null | undefined,
  input: ChangeEventVoteInput,
): unknown {
  if (!userId) return data;
  return mapCommunityCache<Row>(data, (row) => {
    if ("dates" in row) {
      if (row.id !== eventId || row.status !== "PLANNING" || !row.canVote) return row;
      if (input.kind === "game")
        return {
          ...row,
          myRegistrations: row.myRegistrations.map((registration) =>
            registration.tableId === input.tableId &&
            registration.userId === userId &&
            registration.status === "ACCEPTED" &&
            String(input.gameId) in registration.gameVotes
              ? gameVote(registration, input)
              : registration,
          ),
        };
      const options = input.kind === "date" ? row.dates : row.locations;
      if (!options.some((option) => option.id === input.optionId)) return row;
      const field = input.kind === "date" ? "dateVotes" : "locationVotes";
      const counts = input.kind === "date" ? "dates" : "locations";
      return {
        ...row,
        ...(row.voteCounts
          ? {
              voteCounts: {
                ...row.voteCounts,
                [counts]: changeEventVoteCounts(
                  row.voteCounts[counts],
                  input.optionId,
                  row.myVotes?.[field][input.optionId] ?? "UNKNOWN",
                  input.vote,
                ),
              },
            }
          : {}),
        myVotes: {
          dateVotes: { ...row.myVotes?.dateVotes },
          locationVotes: { ...row.myVotes?.locationVotes },
          [field]: { ...row.myVotes?.[field], [input.optionId]: input.vote },
        },
      };
    }
    if (input.kind !== "game" || row.eventId !== eventId) return row;
    if ("games" in row) {
      const registration = row.myRegistration;
      if (
        row.id !== input.tableId ||
        row.eventStatus !== "PLANNING" ||
        !row.games.some((game) => game.gameId === input.gameId) ||
        registration?.userId !== userId ||
        registration?.status !== "ACCEPTED"
      )
        return row;
      return {
        ...row,
        ...(row.gameVoteCounts
          ? {
              gameVoteCounts: changeEventVoteCounts(
                row.gameVoteCounts,
                String(input.gameId),
                registration.gameVotes[input.gameId] ?? "UNKNOWN",
                input.vote,
              ),
            }
          : {}),
        myRegistration: { ...registration, ...gameVote(registration, input) },
      };
    }
    return row.tableId === input.tableId &&
      row.userId === userId &&
      row.status === "ACCEPTED" &&
      String(input.gameId) in row.gameVotes
      ? { ...row, ...gameVote(row, input) }
      : row;
  });
}
