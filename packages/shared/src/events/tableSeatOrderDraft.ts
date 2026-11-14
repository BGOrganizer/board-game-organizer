type PositionedRow = { id: string; seatIndex?: number | null; locked?: boolean };
export type SeatOrderPlace<T> =
  | { key: string; kind: "player"; row: T; index: number }
  | { key: string; kind: "empty"; first: number; last: number };

export function normalizeSeatOrder<T extends PositionedRow>(
  rows: readonly T[],
  seatedCount: number,
) {
  return sortSeatOrder(
    rows.map((row, index) => ({
      ...row,
      seatIndex: row.seatIndex === undefined ? (index < seatedCount ? index : null) : row.seatIndex,
    })),
  );
}

function sortSeatOrder<T extends PositionedRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    a.seatIndex == null
      ? b.seatIndex == null
        ? 0
        : 1
      : b.seatIndex == null
        ? -1
        : a.seatIndex - b.seatIndex,
  );
}

export function sendSeatToWaiting<T extends PositionedRow>(
  rows: readonly T[],
  index: number,
): T[] | null {
  const row = rows[index];
  if (!row || row.locked || row.seatIndex == null) return null;
  // Put the demoted person first in the queue without shifting any physical seat.
  const seats = rows.filter((entry) => entry.id !== row.id && entry.seatIndex != null);
  const queue = rows.filter((entry) => entry.id !== row.id && entry.seatIndex == null);
  return [...seats, { ...row, seatIndex: null }, ...queue];
}

export function moveSeatOrder<T extends PositionedRow>(
  rows: readonly T[],
  index: number,
  delta: number,
  capacity: number,
): T[] | null {
  const row = rows[index];
  if (!row || row.locked || (delta !== -1 && delta !== 1)) return null;
  const occupied = new Map(
    rows.flatMap((entry) => (entry.seatIndex == null ? [] : [[entry.seatIndex, entry] as const])),
  );
  if (row.seatIndex == null) {
    const other = rows[index + delta];
    if (other?.seatIndex == null && other) {
      if (other.locked) return null;
      const next = [...rows];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    }
    if (delta === 1) return null;
    let target = 0;
    while (target < capacity && occupied.has(target)) target++;
    if (target >= capacity) {
      const last = [...rows].reverse().find((entry) => entry.seatIndex != null && !entry.locked);
      if (!last) return null;
      target = last.seatIndex as number;
    }
    const displaced = occupied.get(target);
    return sortSeatOrder(
      rows.map((entry) =>
        entry.id === row.id
          ? { ...entry, seatIndex: target }
          : entry.id === displaced?.id
            ? { ...entry, seatIndex: null }
            : entry,
      ),
    );
  }
  let target = row.seatIndex + delta;
  while (target >= 0 && target < capacity && occupied.get(target)?.locked) target += delta;
  if (target < 0) return null;
  if (target >= capacity) return sendSeatToWaiting(rows, index);
  const other = occupied.get(target);
  return sortSeatOrder(
    rows.map((entry) =>
      entry.id === row.id
        ? { ...entry, seatIndex: target }
        : entry.id === other?.id
          ? { ...entry, seatIndex: row.seatIndex }
          : entry,
    ),
  );
}

/** Represent empty ranges sparsely: a large table never allocates capacity-sized arrays. */
export function seatOrderPlaces<T extends PositionedRow>(rows: readonly T[], capacity: number) {
  const seated: SeatOrderPlace<T>[] = [];
  const waiting: SeatOrderPlace<T>[] = [];
  let next = 0;
  for (const [index, row] of rows.entries()) {
    if (row.seatIndex == null) {
      waiting.push({ kind: "player", key: row.id, row, index });
      continue;
    }
    if (row.seatIndex > next)
      seated.push({ kind: "empty", key: `empty:${next}`, first: next, last: row.seatIndex - 1 });
    seated.push({ kind: "player", key: row.id, row, index });
    next = row.seatIndex + 1;
  }
  if (next < capacity)
    seated.push({ kind: "empty", key: `empty:${next}`, first: next, last: capacity - 1 });
  return { seated, waiting };
}
