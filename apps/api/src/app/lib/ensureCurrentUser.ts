import { getMobileNumber } from "@board-game-organizer/schemas";
import { clerkClient } from "@clerk/nextjs/server";
import type { Db } from "mongodb";
import { UsersRepository } from "@/app/lib/users.repository";

/** Repair a missing Clerk mirror before authenticated requests need it. */
export async function ensureCurrentUser(userId: string, db: Db) {
  const users = new UsersRepository(db);
  const existing = await users.findById(userId);
  if (existing?.name) return;

  // Only fetch the authenticated caller: never let request data select a Clerk user.
  const user = await (await clerkClient()).users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress ?? "";
  await users.upsertFromClerk({
    id: user.id,
    email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || email,
    avatarUrl: user.imageUrl,
    mobileNumber: getMobileNumber(user.unsafeMetadata) ?? null,
    preferredLanguage: "en",
    e2e: user.publicMetadata?.e2e === true ? true : undefined,
  });
}
