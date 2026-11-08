import type {
  EventRecord,
  TableRegistration,
  TableSeatPosition,
} from "@board-game-organizer/schemas";

export type ParticipationIndicator = "confirmed" | "request" | "invitation" | "waiting";
type OwnRegistration = TableRegistration & { position?: TableSeatPosition };

/** Position is an authorized source projection, not a registration status or organizer seat. */
export function tableRegistrationPosition(
  status: EventRecord["status"],
  registration: Pick<TableRegistration, "id" | "userId"> | null,
  seatedIds: readonly string[],
  frozenPlayerIds: readonly string[],
): TableSeatPosition | null {
  if (!registration) return null;
  if (status !== "PLANNING")
    return frozenPlayerIds.includes(registration.userId) ? "FROZEN" : "WAITING";
  return seatedIds.includes(registration.id) ? "SEATED" : "WAITING";
}

export function tableParticipation(
  registration: TableRegistration | null,
  position: TableSeatPosition | null | undefined,
): ParticipationIndicator | null | undefined {
  if (position === "FROZEN") return "confirmed";
  if (!registration) return position === "WAITING" ? "waiting" : null;
  if (registration.status === "PENDING")
    return registration.kind === "INVITATION" ? "invitation" : "request";
  if (registration.status !== "ACCEPTED") return null;
  if (position === "WAITING") return "waiting";
  return position === "SEATED" ? "confirmed" : undefined;
}

/** Consent facts are independent across Tables. Acceptance is not evidence of a seated place. */
export function eventParticipationFlags(registrations: readonly OwnRegistration[]) {
  return {
    accepted: registrations.some((row) => row.status === "ACCEPTED" || row.position === "FROZEN"),
    pending: registrations.some((row) => row.status === "PENDING"),
  };
}

/** Complete own registrations, never a partially fetched Table list. Unknown seats stay unknown. */
export function eventParticipation(
  registrations: readonly OwnRegistration[],
): ParticipationIndicator | null | undefined {
  const states = registrations.map((row) => tableParticipation(row, row.position));
  if (states.includes("confirmed")) return "confirmed";
  if (states.includes(undefined)) return undefined;
  for (const state of ["request", "invitation", "waiting"] as const)
    if (states.includes(state)) return state;
  return null;
}
