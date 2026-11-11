import type {
  NotificationChangeRow,
  NotificationChangesScope,
} from "@board-game-organizer/schemas";

export type {
  NotificationChangeRow,
  NotificationChangesScope,
} from "@board-game-organizer/schemas";

export const notificationChangeFieldTabs = {
  group: { overview: "details", member: "members", members: "members", invitation: "details" },
  event: {
    overview: "details",
    date: "details",
    dates: "details",
    location: "details",
    locations: "details",
    tables: "tables",
  },
  table: { overview: "details", game: "details", games: "details", invitation: "participants" },
} as const;
export const notificationParticipationKinds = [
  "table_invitation",
  "event_booking_requested",
  "event_booking_confirmed",
  "event_booking_removed",
  "event_demonstrator",
] as const;
/** Canonical identity wins over stale section metadata. Table participation never belongs to Details. */
export function notificationChangeTab(
  scope: Pick<NotificationChangesScope, "kind" | "id">,
  kind: string,
  itemId?: string,
): Exclude<NotificationChangesScope["tab"], "none"> | null {
  if (itemId) {
    try {
      const [owner, id, field] = JSON.parse(itemId) as string[];
      if (owner !== scope.kind || id !== scope.id) return null;
      return (
        (
          notificationChangeFieldTabs[scope.kind] as Record<
            string,
            Exclude<NotificationChangesScope["tab"], "none">
          >
        )[field] ?? null
      );
    } catch {
      return null;
    }
  }
  if (
    scope.kind !== "group" &&
    (notificationParticipationKinds as readonly string[]).includes(kind)
  )
    return "participants";
  if (scope.kind === "group" && kind === "group_invitation") return "details";
  if (
    scope.kind === "group" &&
    [
      "group_membership_requested",
      "group_membership_updated",
      "group_invitation_accepted",
    ].includes(kind)
  )
    return "members";
  return "details";
}
export function notificationChangeMessage(
  scope: NotificationChangesScope,
  kind: string,
  itemId?: string,
): NotificationChangeRow["messageCode"] {
  if (
    [
      "event_agreement_ready",
      "event_agreement_blocked",
      "event_confirmed",
      "event_replanning",
      "event_terminated",
      "event_cancelled",
    ].includes(kind)
  )
    return kind as NotificationChangeRow["messageCode"];

  if (itemId) {
    const field = (JSON.parse(itemId) as string[])[2];
    if (
      ["date", "dates", "location", "locations", "game", "games", "tables", "invitation"].includes(
        field,
      )
    )
      return field as NotificationChangeRow["messageCode"];
    if (field === "member" || field === "members") return "member_update";
    if (scope.kind === "table") return "table_settings";
    if (scope.kind === "group") return "group_info";
  }
  if (kind.endsWith("_invitation")) return "invitation";
  if ((notificationParticipationKinds as readonly string[]).includes(kind)) return "participation";
  if (kind.startsWith("group_membership") || kind === "group_invitation_accepted")
    return "member_update";
  if (kind.includes("proposal")) return "proposal";
  if (kind.includes("review")) return "review";
  return scope.kind === "group" ? "group_info" : "information";
}
/** Read only the bounded visible selection; invitations retain their independent response workflow. */
export function displayedNotificationReferences(rows: readonly NotificationChangeRow[]) {
  return rows.filter((row) => !row.requiresResponse).map((row) => row.readReference);
}
