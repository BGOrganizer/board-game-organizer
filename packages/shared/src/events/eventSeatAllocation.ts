import type { AgreementRegistration } from "./eventAgreement";

export function reservedSeatIndex(
  seated: readonly Pick<AgreementRegistration, "id" | "seatIndex">[],
  id: string,
): number | null {
  const index = seated.findIndex((row) => row.id === id);
  return index < 0 ? null : (seated[index].seatIndex ?? index);
}

export function reservationPriority(a: AgreementRegistration, b: AgreementRegistration): number {
  return (
    Date.parse(a.priorityAt) - Date.parse(b.priorityAt) ||
    a.sequence - b.sequence ||
    a.id.localeCompare(b.id)
  );
}

/** Explicit empty slots remain empty in Manual/current manager overrides; locks always anchor. */
export function allocateReservedPlaces<T extends AgreementRegistration>(
  registrations: readonly T[],
  capacity: number,
  preserveAllocation = true,
): { seated: T[]; waiting: T[] } {
  const ordered = [...registrations].sort(reservationPriority);
  if (!ordered.some((row) => row.seatIndex !== undefined))
    return { seated: ordered.slice(0, capacity), waiting: ordered.slice(capacity) };
  const occupied = new Map<number, T>();
  const waiting: T[] = [];
  const flexible: T[] = [];
  for (const row of ordered) {
    if (typeof row.seatIndex === "number" && (preserveAllocation || row.locked)) {
      if (row.seatIndex >= capacity || occupied.has(row.seatIndex))
        throw new Error("Invalid reserved seat allocation");
      occupied.set(row.seatIndex, row);
    } else if (preserveAllocation && row.seatIndex === null) waiting.push(row);
    else flexible.push(row);
  }
  let slot = 0;
  for (const row of flexible) {
    while (occupied.has(slot)) slot++;
    if (slot < capacity) occupied.set(slot, { ...row, seatIndex: slot });
    else waiting.push({ ...row, seatIndex: null });
  }
  return {
    seated: [...occupied.entries()].sort(([a], [b]) => a - b).map(([, row]) => row),
    waiting: waiting.sort(reservationPriority),
  };
}
