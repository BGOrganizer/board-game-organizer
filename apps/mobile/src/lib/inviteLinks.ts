/** Invite continuations never accept an arbitrary URL or external API override. */
export function inviteTokenParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value) ? value : null;
}
export function inviteDestination(value: string | string[] | undefined) {
  const token = inviteTokenParam(value);
  return token ? (`/invite/${token}` as const) : ("/tables" as const);
}
