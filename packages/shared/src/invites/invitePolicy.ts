import type { PlannedEventResponse } from "@board-game-organizer/schemas";

/** Private Group Events inherit private visibility, including older records without that field. */
export function canGenerateTableInviteLink(
  event:
    | Pick<PlannedEventResponse, "canInvite" | "groupId" | "groupType" | "status">
    | null
    | undefined,
): boolean {
  return Boolean(
    event?.canInvite &&
      event.groupId &&
      event.groupType === "PRIVATE" &&
      event.status === "PLANNING",
  );
}
