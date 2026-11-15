/** Mirror fallbacks may contain email; public identity never does. */
export function publicUserName(
  user:
    | { name?: string | null; email?: string | null; username?: string | null }
    | null
    | undefined,
  fallback = "",
) {
  return user?.name && user.name !== user.email ? user.name : user?.username || fallback;
}
