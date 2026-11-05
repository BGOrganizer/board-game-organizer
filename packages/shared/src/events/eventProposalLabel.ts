import type { EventProposalPayload } from "@board-game-organizer/schemas";
/** Proposed clocks are local wall times, not instants in a venue that has not yet been selected. */
export function eventProposalLabel(
  payload: EventProposalPayload,
  fallback: string,
  locale: string,
) {
  if (payload.kind !== "date") return fallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(`${payload.day}T${payload.startTime}Z`));
  } catch {
    return fallback;
  }
}
