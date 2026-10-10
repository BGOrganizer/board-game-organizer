import { normalizePhoneNumberForMatching, type User } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Repository over the `users` collection.
 *
 * Users are mirrored from Clerk via the webhook (Phase 1); the Clerk user ID
 * (`clerkId`) is the stable cross-app identity — the same value returned by
 * `auth()` in route handlers.
 */
export class UsersRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get col() {
    return this.db.collection<User>(COLLECTIONS.USERS);
  }

  async upsertFromClerk(user: {
    id: string;
    email: string;
    name: string;
    username?: string | null;
    bgoRole?: "ADMIN" | null;
    avatarUrl?: string;
    mobileNumber?: string | null;
    preferredLanguage: "en" | "it";
    plan?: string;
    e2e?: boolean;
  }) {
    const now = new Date();
    const mobileNumberNormalized = normalizePhoneNumberForMatching(user.mobileNumber);
    const unset: Record<string, ""> = {};
    if (user.mobileNumber === null) unset.mobileNumber = "";
    if (user.mobileNumber !== undefined && !mobileNumberNormalized)
      unset.mobileNumberNormalized = "";
    if (user.bgoRole === null) unset.bgoRole = "";
    return this.col.findOneAndUpdate(
      { clerkId: user.id },
      {
        $set: {
          email: user.email,
          name: user.name,
          ...(user.username !== undefined ? { username: user.username } : {}),
          ...(user.bgoRole ? { bgoRole: user.bgoRole } : {}),
          ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
          ...(typeof user.mobileNumber === "string" ? { mobileNumber: user.mobileNumber } : {}),
          ...(mobileNumberNormalized ? { mobileNumberNormalized } : {}),
          preferredLanguage: user.preferredLanguage,
          plan: user.plan ?? "free",
          ...(user.e2e !== undefined ? { e2e: user.e2e } : {}),
          updatedAt: now,
        },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        $setOnInsert: {
          clerkId: user.id,
          presence: { online: false, lastActiveAt: now },
          createdAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        ...(this.session ? { session: this.session } : {}),
      },
    );
  }

  lock(clerkId: string) {
    return this.col.updateOne(
      { clerkId },
      { $inc: { "community.uploadLock": 1 } },
      this.session ? { session: this.session } : {},
    );
  }

  async moderatorIds() {
    const users = await this.col
      .find(
        { bgoRole: "ADMIN" },
        { projection: { clerkId: 1 }, ...(this.session ? { session: this.session } : {}) },
      )
      .toArray();
    return users.map((user) => user.clerkId);
  }

  findById(clerkId: string) {
    return this.col.findOne({ clerkId }, this.session ? { session: this.session } : {});
  }

  findByIds(clerkIds: string[]) {
    return this.col
      .find(
        { clerkId: { $in: clerkIds } },
        { projection: { _id: 0 }, ...(this.session ? { session: this.session } : {}) },
      )
      .toArray();
  }

  findByEmail(email: string) {
    return this.col.findOne({ email }, this.session ? { session: this.session } : {});
  }

  deleteByClerkId(clerkId: string) {
    return this.col.deleteOne({ clerkId }, this.session ? { session: this.session } : {});
  }
}
