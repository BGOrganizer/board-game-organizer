import type { RelationshipRow } from "./hooks/useContacts";

/** Presentation windows never erase known requests from the per-person action menu. */
export function contactRequestContext(
  pending: readonly { rows: readonly RelationshipRow[] }[] | undefined,
  sent: readonly { rows: readonly RelationshipRow[] }[] | undefined,
  userId: string,
): "incoming" | "outgoing" | undefined {
  for (const page of pending ?? [])
    if (page.rows.some((row) => row.profile?.id === userId)) return "incoming";
  for (const page of sent ?? [])
    if (page.rows.some((row) => row.profile?.id === userId)) return "outgoing";
  return undefined;
}
