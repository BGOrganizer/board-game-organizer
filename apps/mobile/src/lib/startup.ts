import type { QueryClient } from "@tanstack/react-query";

const initialRoles = "admin,invited,accepted";

export const STARTUP_SPLASH_LIMIT_MS = 4000;

export function remainingSplashMs(startedAt: number, now: number): number {
  return Math.max(0, STARTUP_SPLASH_LIMIT_MS - (now - startedAt));
}

export function isStartupAuthPending(
  isAuthLoaded: boolean,
  isRestoredSignedIn: boolean | undefined,
  isSessionSignedIn: boolean | undefined,
  isUserLoaded: boolean,
): boolean {
  return (
    !isAuthLoaded ||
    isRestoredSignedIn === undefined ||
    (isRestoredSignedIn && (!isSessionSignedIn || !isUserLoaded))
  );
}

/** Wait for the mounted destination screen's own request, not a duplicate bootstrap request. */
export function isStartupDestinationSettled(
  queryClient: QueryClient,
  pathname: string,
  apiUrl: string,
  userId: string,
): boolean {
  if (pathname === "/") return false; // Wait for the declarative redirect.

  const segments = pathname.split("/").filter(Boolean);
  const matchDetail =
    segments[0] === "match" &&
    segments.length === 2 &&
    !["wizard", "results", "search-game", "search-user"].includes(segments[1]);
  const groupDetail = segments[0] === "group" && segments.length === 2 && segments[1] !== "wizard";
  const matches = queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => {
      const key = query.queryKey;
      if (query.state.status === "pending" || query.state.fetchStatus !== "idle") return false;
      if (matchDetail) {
        return (
          key[0] === "matches" &&
          key[1] === "detail" &&
          key[2] === segments[1] &&
          key[3] === apiUrl &&
          Boolean(key[4])
        );
      }
      if (groupDetail) {
        return key[0] === "groups" && key[1] === apiUrl && Boolean(key[2]);
      }
      if (pathname === "/matches" || pathname === "/groups") {
        return (
          key[0] === (pathname === "/matches" ? "matches" : "groups") &&
          key[1] === "paged" &&
          key[2] === apiUrl &&
          Boolean(key[3]) &&
          key[4] === "" &&
          key[5] === initialRoles
        );
      }
      if (pathname === "/contacts") {
        return (
          key[0] === "contacts" &&
          (key[1] === "friends" || key[1] === "pending") &&
          key[2] === apiUrl &&
          Boolean(key[3])
        );
      }
      if (pathname === "/notifications") {
        return (
          key[0] === "notifications" && key[1] === apiUrl && key[2] === userId && key[3] === 20
        );
      }
      return (
        pathname === "/profile" && key[0] === "profile" && key[1] === apiUrl && key[2] === userId
      );
    });

  if (pathname === "/contacts") {
    return ["friends", "pending"].every((type) =>
      matches.some((query) => query.queryKey[1] === type),
    );
  }
  // Unknown routes have no mandatory startup request.
  if (
    !["/matches", "/groups", "/notifications", "/profile"].includes(pathname) &&
    !matchDetail &&
    !groupDetail
  )
    return true;
  return matches.length > 0;
}
