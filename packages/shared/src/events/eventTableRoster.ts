import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import type { UserProfile } from "../common/types";
import { canManageEvent } from "./eventRecordPolicy";
export type EventTablePlace =
  | { key: string; kind: "player"; user: TableSeatResponse }
  | { key: string; kind: "reserved" | "empty"; queue: boolean; seatIndex?: number | null };
/** Display anonymous places, never assign a server seat or disclose another user's pending identity. */
export function eventTableRoster(
  table: PlannedTableResponse,
  accepted: readonly TableSeatResponse[],
  pending: readonly TableSeatResponse[],
  userId: string,
  limit: number,
  selfProfile?: Pick<UserProfile, "id" | "name" | "username" | "avatarUrl">,
) {
  const known = new Map<string, TableSeatResponse>();
  for (const row of [...accepted, ...pending]) {
    if (row.status === "PENDING" && !canManageEvent(table, userId) && row.userId !== userId)
      continue;
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
  if (table.eventStatus === "PLANNING" && table.occupiedSeatIndices) {
    const occupiedSlots = new Set(table.occupiedSeatIndices);
    const seated = new Map(
      people.flatMap((row) =>
        row.position !== "WAITING" && typeof row.seatIndex === "number"
          ? [[row.seatIndex, row] as const]
          : [],
      ),
    );
    const waiting = people.filter((row) => row.position === "WAITING");
    const queued = Math.max(waiting.length, table.waitingCount);
    const full = occupiedSlots.size >= table.maxPlayers;
    const total = table.maxPlayers + queued + Number(full);
    const rows: EventTablePlace[] = [];
    for (let index = 0; index < Math.min(limit, total); index++) {
      const queue = index >= table.maxPlayers;
      const user = queue ? waiting[index - table.maxPlayers] : seated.get(index);
      if (user) {
        const profile =
          selfProfile?.id === userId && user.userId === userId ? selfProfile : undefined;
        rows.push({
          key: user.id,
          kind: "player",
          user: profile
            ? {
                ...user,
                name: (user.name && user.name !== userId ? user.name : profile.name) || null,
                username: user.username ?? profile.username ?? null,
                avatarUrl: user.avatarUrl ?? profile.avatarUrl,
              }
            : user,
        });
      } else {
        const reserved = queue ? index < table.maxPlayers + queued : occupiedSlots.has(index);
        rows.push({
          key: `${reserved ? "reserved" : "empty"}:${index}`,
          kind: reserved ? "reserved" : "empty",
          queue,
          seatIndex: queue ? null : index,
        });
      }
    }
    return { rows, total, queueOpen: full || queued > 0 };
  }
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
  const profile = selfProfile?.id === userId ? selfProfile : undefined;
  const seated = people.filter((row) => row.position !== "WAITING");
  const waiting = people.filter((row) => row.position === "WAITING");
  const rows: EventTablePlace[] = [];
  for (let i = 0; i < size; i++) {
    // Unloaded/anonymous primary reservations must precede the waiting section too.
    const user =
      i < seated.length
        ? seated[i]
        : i >= seated.length + hidden
          ? waiting[i - seated.length - hidden]
          : undefined;
    if (user) {
      rows.push({
        key: user.id,
        kind: "player",
        user:
          profile && user.userId === userId
            ? {
                ...user,
                name: (user.name && user.name !== userId ? user.name : profile.name) || null,
                username: user.username ?? profile.username ?? null,
                avatarUrl: user.avatarUrl ?? profile.avatarUrl,
              }
            : user,
      });
    } else {
      const reserved = i < seated.length + hidden;
      rows.push({
        key: `${reserved ? "reserved" : "empty"}:${i}`,
        kind: reserved ? "reserved" : "empty",
        queue: occupied >= table.maxPlayers,
      });
    }
  }
  return { rows, total, queueOpen: occupied >= table.maxPlayers };
}
