/** Usernames are handles, never display names or inferred identifiers. */
export function formatUsername(username: string | null | undefined, fallback: string): string {
  const handle = username?.trim().replace(/^@+/, "");
  return handle ? `@${handle}` : fallback;
}
