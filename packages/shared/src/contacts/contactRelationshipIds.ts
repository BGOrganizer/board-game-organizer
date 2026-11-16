import type { RelationshipRow } from "./hooks/useContacts";

/** Keep canonical precedence/block facts independently from a bounded profile window. */
export function contactRelationshipIds(
  pages: readonly { rows: readonly RelationshipRow[] }[] | undefined,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const page of pages ?? [])
    for (const row of page.rows) if (row.profile) ids.add(row.profile.id);
  return ids;
}
