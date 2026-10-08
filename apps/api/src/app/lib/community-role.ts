import { getBgoRole } from "@board-game-organizer/schemas";
import { clerkClient } from "@clerk/nextjs/server";
import { CommunityError } from "./community.error";

/** Never authorize moderation from JWT snapshots, unsafeMetadata or MongoDB mirrors. */
export async function requireBgoModerator(userId: string): Promise<void> {
  const user = await (await clerkClient()).users.getUser(userId);
  if (getBgoRole(user.publicMetadata) !== "ADMIN") {
    throw new CommunityError(403, "MODERATOR_REQUIRED");
  }
}
