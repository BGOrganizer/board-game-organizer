import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
export type EventTablePlace =
  | { key: string; kind: "player"; user: TableSeatResponse }
  | { key: string; kind: "reserved" | "empty"; queue: boolean };
/** Display anonymous places, never assign a server seat or disclose another user's pending identity. */
export function eventTableRoster(
  table: PlannedTableResponse,
  accepted: readonly TableSeatResponse[],
  pending: readonly TableSeatResponse[],
  userId: string,
  limit: number,
) {
  const known = new Map<string, TableSeatResponse>();
  for (const row of [...accepted, ...pending]) {
    if (row.status === "PENDING" && table.adminUserId !== userId && row.userId !== userId) continue;
    const previous = known.get(row.id);
    if (row.status === "ACCEPTED" || row.status === "PENDING") {
      if (!previous || previous.version < row.version) known.set(row.id, row);
    }
  }
  const own = table.myRegistration;
  if (own && own.userId === userId) {
    const previous = known.get(own.id);
    if (!previous || previous.version <= own.version) {
      if (own.status === "ACCEPTED" || own.status === "PENDING")
        known.set(own.id, {
          ...own,
          name: own.name ?? previous?.name ?? null,
          email: own.email ?? previous?.email ?? null,
          username: own.username ?? previous?.username ?? null,
          avatarUrl: own.avatarUrl ?? previous?.avatarUrl ?? null,
          position: table.myPosition ?? previous?.position ?? "WAITING",
        });
      else known.delete(own.id);
    }
  }
  const people = [...known.values()].sort(
    (a, b) =>
      Number(a.position === "WAITING") - Number(b.position === "WAITING") ||
      Date.parse(a.priorityAt) - Date.parse(b.priorityAt) ||
      a.sequence - b.sequence ||
      a.id.localeCompare(b.id),
  );
  const occupied = Math.max(
    people.length,
    table.seatedCount + table.pendingCount + table.waitingCount,
  );
  const hidden = Math.max(
    0,
    table.seatedCount +
      table.pendingCount -
      people.filter((row) => row.position !== "WAITING").length,
  );
  const free = table.eventStatus === "PLANNING" ? Math.max(0, table.maxPlayers - occupied) : 0;
  const empty = table.eventStatus === "PLANNING" ? Math.max(1, free) : 0;
  const total = people.length + hidden + empty;
  const size = Math.max(0, Math.min(limit, total));
  const rows: EventTablePlace[] = people
    .slice(0, size)
    .map((user) => ({ key: user.id, kind: "player", user }));
  for (let i = rows.length; i < size; i++) {
    const reserved = i < people.length + hidden;
    rows.push({
      key: `${reserved ? "reserved" : "empty"}:${i}`,
      kind: reserved ? "reserved" : "empty",
      queue: occupied >= table.maxPlayers,
    });
  }
  return { rows, total };
}
