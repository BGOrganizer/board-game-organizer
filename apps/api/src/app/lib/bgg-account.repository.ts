import { randomUUID } from "node:crypto";
import type {
  BggAccount,
  BggAccountResponse,
  BggCollectionGame,
  BggIdentity,
  BoardGame,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

export class BggAccountRepository {
  constructor(private db: Db) {}

  private get accounts() {
    return this.db.collection<BggAccount>(COLLECTIONS.BGG_ACCOUNTS);
  }

  private get collection() {
    return this.db.collection<BggCollectionGame>(COLLECTIONS.BGG_COLLECTION_GAMES);
  }

  async get(userId: string): Promise<BggAccountResponse> {
    const account = await this.accounts.findOne({ userId });
    return {
      active: account?.active
        ? { ...account.active, syncedAt: account.active.syncedAt.toISOString() }
        : null,
      pending: account?.pending
        ? {
            id: account.pending.id,
            username: account.pending.username,
            avatarUrl: account.pending.avatarUrl,
            status: account.pending.status,
            error: account.pending.error ?? null,
            nextAttemptAt: account.pending.nextAttemptAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async stage(userId: string, identity: BggIdentity) {
    const snapshot = randomUUID();
    const previous = await this.accounts.findOneAndUpdate(
      { userId },
      {
        $set: {
          pending: { ...identity, snapshot, status: "syncing" as const, attempts: 0 },
        },
        $setOnInsert: { userId },
      },
      { upsert: true, returnDocument: "before" },
    );
    if (previous?.pending)
      await this.collection.deleteMany({ userId, snapshot: previous.pending.snapshot });
    return snapshot;
  }

  async pending(userId: string) {
    return (await this.accounts.findOne({ userId }))?.pending ?? null;
  }

  async claim(userId: string, snapshot: string) {
    return this.accounts.findOneAndUpdate(
      {
        userId,
        "pending.snapshot": snapshot,
        "pending.status": "syncing",
        $or: [
          { "pending.leaseUntil": { $exists: false } },
          { "pending.leaseUntil": { $lte: new Date() } },
        ],
      },
      { $set: { "pending.leaseUntil": new Date(Date.now() + 120_000) } },
      { returnDocument: "after" },
    );
  }

  async queued(userId: string, snapshot: string, waitMs: number) {
    const pending = await this.pending(userId);
    if (!pending || pending.snapshot !== snapshot) return;
    if (pending.attempts >= 8) return this.failed(userId, snapshot);
    await this.accounts.updateOne(
      { userId, "pending.snapshot": snapshot, "pending.status": "syncing" },
      {
        $set: { "pending.nextAttemptAt": new Date(Date.now() + waitMs) },
        $inc: { "pending.attempts": 1 },
        $unset: { "pending.leaseUntil": "" },
      },
    );
  }

  async failed(userId: string, snapshot: string) {
    await this.accounts.updateOne(
      { userId, "pending.snapshot": snapshot },
      {
        $set: { "pending.status": "failed", "pending.error": "Collection sync failed" },
        $unset: { "pending.nextAttemptAt": "", "pending.leaseUntil": "" },
      },
    );
    const current = await this.accounts.findOne({ userId }, { projection: { active: 1 } });
    if (current?.active?.snapshot !== snapshot)
      await this.collection.deleteMany({ userId, snapshot });
  }

  async restart(userId: string, snapshot: string) {
    return this.accounts.updateOne(
      { userId, "pending.snapshot": snapshot, "pending.status": "failed" },
      {
        $set: { "pending.status": "syncing", "pending.attempts": 0 },
        $unset: { "pending.error": "", "pending.nextAttemptAt": "", "pending.leaseUntil": "" },
      },
    );
  }

  async publish(
    userId: string,
    snapshot: string,
    identity: BggIdentity,
    games: Omit<BggCollectionGame, "_id">[],
  ) {
    if ((await this.pending(userId))?.snapshot !== snapshot) return;
    const catalog = this.db.collection<BoardGame>(COLLECTIONS.BOARD_GAMES);
    for (let i = 0; i < games.length; i += 250) {
      const chunk = games.slice(i, i + 250);
      const known = await catalog
        .find(
          { id: { $in: chunk.map((game) => game.gameId) } },
          { projection: { id: 1, isExpansion: 1 } },
        )
        .toArray();
      const expansions = new Set(known.filter((game) => game.isExpansion).map((game) => game.id));
      const visible = chunk.filter((game) => !expansions.has(game.gameId));
      if (visible.length) {
        await catalog.bulkWrite(
          visible.map((game) => ({
            updateOne: {
              filter: { id: game.gameId },
              update: {
                $setOnInsert: {
                  id: game.gameId,
                  name: game.name,
                  yearPublished: game.year,
                  image: game.imageUrl,
                  isExpansion: false,
                },
              },
              upsert: true,
            },
          })),
        );
        await this.collection.bulkWrite(
          visible.map((game) => ({
            updateOne: {
              filter: { userId, snapshot, gameId: game.gameId },
              update: { $set: game },
              upsert: true,
            },
          })),
        );
      }
    }
    const updated = await this.accounts.updateOne(
      { userId, "pending.snapshot": snapshot, "pending.status": "syncing" },
      {
        $set: { active: { ...identity, snapshot, syncedAt: new Date() } },
        $unset: { pending: "" },
      },
    );
    if (updated.modifiedCount === 0) {
      const current = await this.accounts.findOne({ userId }, { projection: { active: 1 } });
      if (current?.active?.snapshot !== snapshot)
        await this.collection.deleteMany({ userId, snapshot });
      return;
    }
    await this.collection.deleteMany({ userId, snapshot: { $ne: snapshot } });
  }

  async unlink(userId: string, session: ClientSession) {
    await this.accounts.deleteOne({ userId }, { session });
    await this.collection.deleteMany({ userId }, { session });
  }

  games(userId: string, snapshot: string) {
    return this.collection.find({ userId, snapshot });
  }
}
