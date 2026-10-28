import {
  eventRecordKeys,
  groupRecordKeys,
  notificationListKey,
  startupRelationshipTypes,
} from "@board-game-organizer/shared";
import type { QueryClient } from "@tanstack/react-query";

export { startupRelationshipTypes } from "@board-game-organizer/shared";
export const STARTUP_SPLASH_LIMIT_MS = 5000;
export function startupLinkPath(url: string | null | undefined): string | null {
  if (!url?.startsWith("bgo:")) return null;
  return `/${url.slice(4).replace(/^\/+/, "").split("?")[0]}`;
}
export function remainingSplashMs(startedAt: number, now: number) {
  return Math.max(0, STARTUP_SPLASH_LIMIT_MS - (now - startedAt));
}
export function isStartupAuthPending(
  isAuthLoaded: boolean,
  isRestoredSignedIn: boolean | undefined,
  isSessionSignedIn: boolean | undefined,
  isUserLoaded: boolean,
) {
  return (
    !isAuthLoaded ||
    isRestoredSignedIn === undefined ||
    Boolean(isRestoredSignedIn && (!isSessionSignedIn || !isUserLoaded))
  );
}
function settled(client: QueryClient, key: readonly unknown[]) {
  const s = client.getQueryState(key);
  return Boolean(s && s.status !== "pending" && s.fetchStatus === "idle");
}
export function isStartupDestinationSettled(
  client: QueryClient,
  pathname: string,
  apiUrl: string,
  userId: string,
  locale: "en" | "it",
) {
  if (pathname === "/") return false;
  const o = { apiUrl, userId };
  const group = /^\/group\/([^/]+)$/.exec(pathname);
  if (group && !["wizard", "search", "invite", "ban", "search-user"].includes(group[1]))
    return settled(client, groupRecordKeys.detail(o, group[1]));
  const event = /^\/event\/([^/]+)$/.exec(pathname);
  if (event && !["wizard", "table", "invite", "results", "table-edit"].includes(event[1]))
    return settled(client, eventRecordKeys.detail(o, event[1]));
  if (pathname === "/event/table")
    return client
      .getQueryCache()
      .findAll({ queryKey: [...eventRecordKeys.root(o), "table"] })
      .some((q) => q.state.status !== "pending" && q.state.fetchStatus === "idle");
  if (pathname === "/tables" || pathname === "/matches")
    return settled(client, eventRecordKeys.tables(o, null));
  if (pathname === "/groups") return settled(client, groupRecordKeys.list(o, "mine"));
  if (pathname === "/events") return settled(client, eventRecordKeys.list(o));
  if (pathname === "/contacts")
    return startupRelationshipTypes.every((type) =>
      settled(client, ["contacts", type, apiUrl, userId]),
    );
  if (pathname === "/profile") return settled(client, ["profile", apiUrl, userId]);
  if (pathname === "/notifications")
    return settled(client, notificationListKey({ apiUrl, userId, locale }, 20));
  return true;
}
export function isStartupEssentialsSettled(client: QueryClient, apiUrl: string, userId: string) {
  const o = { apiUrl, userId };
  return (
    settled(client, ["profile", apiUrl, userId]) &&
    settled(client, eventRecordKeys.tables(o, null)) &&
    settled(client, groupRecordKeys.list(o, "mine")) &&
    settled(client, eventRecordKeys.list(o))
  );
}
