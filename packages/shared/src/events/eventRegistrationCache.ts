import type { PlannedTableResponse, TableRegistration } from "@board-game-organizer/schemas";

/** Reconcile acknowledged participation, never an inferred seat or permission grant. */
export function acknowledgeTableRegistration(
  table: PlannedTableResponse,
  registration: TableRegistration,
  userId: string | null | undefined,
): PlannedTableResponse {
  if (
    registration.userId !== userId ||
    table.id !== registration.tableId ||
    table.eventId !== registration.eventId ||
    (table.myRegistration?.version ?? 0) > registration.version
  )
    return table;
  const before = table.myRegistration;
  const wasAccepted = before?.status === "ACCEPTED",
    accepted = registration.status === "ACCEPTED";
  let counts = table.gameVoteCounts;
  if (counts && (wasAccepted || accepted)) {
    counts = { ...counts };
    for (const gameId of Object.keys(counts)) {
      const previous = before?.gameVotes[gameId] ?? "UNKNOWN",
        next = registration.gameVotes[gameId] ?? "UNKNOWN";
      if (wasAccepted === accepted && previous === next) continue;
      const votes = { ...counts[gameId] };
      if (wasAccepted) votes[previous] = Math.max(0, votes[previous] - 1);
      if (accepted) votes[next]++;
      counts[gameId] = votes;
    }
  }
  return {
    ...table,
    myRegistration: { ...before, ...registration },
    canRegister: false,
    canRespond: registration.status === "PENDING" ? table.canRespond : false,
    ...(registration.status === "CANCELLED" || registration.status === "DECLINED"
      ? { myPosition: null, canLeave: false }
      : {}),
    ...(counts ? { gameVoteCounts: counts } : {}),
  };
}
