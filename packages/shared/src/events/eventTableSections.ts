import type { PendingTablePlace } from "./eventTablePending";
import type { EventTablePlace } from "./eventTableRoster";

/** Sectioning only: server positions/priority remain unchanged; local intent has no assigned place. */
export function eventTableSections<T extends EventTablePlace | PendingTablePlace>(
  rows: readonly T[],
  queueOpen: boolean,
) {
  const seats: T[] = [],
    waiting: T[] = [];
  for (const row of rows) {
    const queued =
      queueOpen &&
      (row.kind === "player" ? row.user.position === "WAITING" : row.kind === "empty" && row.queue);
    (queued ? waiting : seats).push(row);
  }
  return { seats, waiting };
}
