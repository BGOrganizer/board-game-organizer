import type { EventProposalPayload, EventProposalResponse } from "@board-game-organizer/schemas";
import { formatUsername } from "../common/userIdentity";

type ProposalAuthors = Pick<
  EventProposalResponse,
  "authorName" | "authorUsername" | "gameSuggestions" | "suggestions"
> & { userId?: string };
export function eventProposalAuthorRows(row: ProposalAuthors) {
  const source = row.suggestions ?? row.gameSuggestions;
  const authors = source?.length ? source : [row];
  const unique = new Map<string, { id: string; label: string }>();
  for (const author of authors) {
    const label = formatUsername(author.authorUsername, author.authorName);
    const id = author.userId ?? label;
    if (!unique.has(id)) unique.set(id, { id, label });
  }
  return [...unique.values()];
}
export function eventProposalAuthors(row: ProposalAuthors) {
  return eventProposalAuthorRows(row)
    .map((author) => author.label)
    .join(", ");
}
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
