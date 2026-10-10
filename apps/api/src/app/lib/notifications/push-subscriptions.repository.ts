import type { PushPlatform, PushSubscription } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

export class PushSubscriptionsRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  upsert(userId: string, token: string, platform: PushPlatform, locale: "en" | "it") {
    const now = new Date();
    return this.db.collection<PushSubscription>(COLLECTIONS.PUSH_SUBSCRIPTIONS).updateOne(
      { token },
      {
        $set: {
          userId,
          token,
          platform,
          provider: platform === "ios" ? "apns" : "fcm",
          locale,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, ...this.opts },
    );
  }

  remove(userId: string, token: string) {
    return this.db
      .collection<PushSubscription>(COLLECTIONS.PUSH_SUBSCRIPTIONS)
      .deleteOne({ userId, token }, this.opts);
  }

  removeToken(token: string) {
    return this.db
      .collection<PushSubscription>(COLLECTIONS.PUSH_SUBSCRIPTIONS)
      .deleteOne({ token }, this.opts);
  }

  listByUser(userId: string) {
    return this.db
      .collection<PushSubscription>(COLLECTIONS.PUSH_SUBSCRIPTIONS)
      .find({ userId }, this.opts)
      .toArray();
  }
}
