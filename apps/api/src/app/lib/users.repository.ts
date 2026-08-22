import type { User } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Repository over the `users` collection.
 *
 * Users are mirrored from Clerk via the webhook (Phase 1); the Clerk user ID
 * (`clerkId`) is the stable cross-app identity — the same value returned by
 * `auth()` in route handlers.
 */
export class UsersRepository {
  constructor(private db: Db) {}

  private get col() {
    return this.db.collection<User>(COLLECTIONS.USERS);
  }

  async upsertFromClerk(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
    preferredLanguage: "en" | "it";
    plan?: string;
    e2e?: boolean;
  }) {
    const now = new Date();
    return this.col.findOneAndUpdate(
      { clerkId: user.id },
      {
        $set: {
          email: user.email,
          name: user.name,
          ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
          preferredLanguage: user.preferredLanguage,
          plan: user.plan ?? "free",
          ...(user.e2e !== undefined ? { e2e: user.e2e } : {}),
          updatedAt: now,
        },
        $setOnInsert: {
          clerkId: user.id,
          presence: { online: false, lastActiveAt: now },
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  findById(clerkId: string) {
    return this.col.findOne({ clerkId });
  }

  findByEmail(email: string) {
    return this.col.findOne({ email });
  }

  deleteByClerkId(clerkId: string) {
    return this.col.deleteOne({ clerkId });
  }
}
