import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import type { RecordUserRole } from "../common/recordUserRoles";

/** Display current, source-authorized membership only; historical ratings never confer a role. */
export function groupLeaderboardRoles(
  player: Pick<GroupLeaderboardResponse["players"][number], "left" | "groupRole">,
): RecordUserRole[] {
  if (player.left) return [];
  switch (player.groupRole) {
    case "ADMIN":
      return ["admin"];
    case "MODERATOR":
      return ["moderator"];
    case "MEMBER":
      return ["acceptedMember"];
    default:
      return [];
  }
}
