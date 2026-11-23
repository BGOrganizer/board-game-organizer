type Target = { operation: string; args: Record<string, unknown>; detailTab?: string };

const rootOperations = new Map([
  ["/events", "list_events"],
  ["/groups", "list_groups"],
  ["/groups/new", "prepare_group_creation"],
  ["/tables", "list_table_history"],
  ["/community", "list_community_activity"],
  ["/contacts", "list_friends"],
  ["/notifications", "list_notifications"],
  ["/profile", "get_my_profile"],
]);

export function widgetTarget(path: string): Target | undefined {
  const origin = "https://bgo.example.invalid";
  const url = path.startsWith("/") && URL.parse(path, origin);
  if (!url || url.origin !== origin) return;
  const pathname = url.pathname.replace(/\/$/, "");
  const tab = url.searchParams.get("tab");
  const match = (pattern: RegExp) => pathname.match(pattern);

  const table = match(/^\/events\/([^/]+)\/tables\/([^/]+)(\/results)?$/);
  if (table) {
    const [, eventId, tableId, results] = table;
    return {
      operation: "get_table",
      args: { params: { eventId, tableId } },
      ...(results || tab === "results"
        ? { detailTab: "results" }
        : tab === "participants"
          ? { detailTab: "participants" }
          : {}),
    };
  }

  const event = match(/^\/events\/([^/]+)$/);
  if (event && event[1] !== "new") {
    const [, eventId] = event;
    return {
      operation: "get_event",
      args: { params: { eventId } },
      ...(tab === "tables" || tab === "participants" ? { detailTab: tab } : {}),
    };
  }

  const group = match(/^\/(groups|moderation)\/([^/]+)$/);
  if (group && group[2] !== "new") {
    const [, section, groupId] = group;
    if (section === "moderation")
      return { operation: "get_group_moderation_review", args: { params: { groupId } } };
    return {
      operation: "get_group",
      args: { params: { groupId } },
      ...(tab === "events" || tab === "members"
        ? { detailTab: tab }
        : tab === "leaderboard"
          ? { detailTab: "rankings" }
          : {}),
    };
  }

  const profile = match(/^\/profiles\/([^/]+)$/);
  if (profile) {
    let userId: string;
    try {
      userId = decodeURIComponent(profile[1]);
    } catch {
      return;
    }
    const operation =
      tab === "activity"
        ? "list_profile_activity"
        : tab === "games"
          ? "list_profile_games"
          : "get_user_profile";
    return { operation, args: { params: { userId } } };
  }

  if (pathname === "/contacts" && tab === "requests") {
    return { operation: "list_friend_requests", args: { query: { direction: "incoming" } } };
  }
  if (pathname === "/community" && tab === "leaderboard") {
    return { operation: "list_global_leaderboard", args: {} };
  }
  if (pathname === "/moderation") {
    return { operation: "list_groups", args: { query: { scope: "moderation" } } };
  }
  const operation = rootOperations.get(pathname);
  if (operation) return { operation, args: {} };
}
