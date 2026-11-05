import { randomUUID } from "node:crypto";
import type {
  BggAccount,
  BggAccountResponse,
  BggCollectionGame,
  BggCollectionQuery,
  BggCollectionResponse,
  BggIdentity,
  BoardGame,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { CommunityError } from "@/app/lib/community.error";
import { COLLECTIONS } from "@/app/lib/db";
import { parseBggCollection } from "./bgg-collection";

const collectionCursor = z
  .object({
    snapshot: z.string(),
    name: z.string().min(1).max(1000),
    gameId: z.number().int().positive(),
  })
  .strict();

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
      ...(account?.lastAttempt
        ? {
            lastAttempt: {
              status: account.lastAttempt.status,
              at: account.lastAttempt.at.toISOString(),
            },
          }
        : {}),
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
          lastAttempt: { status: "syncing", at: new Date() },
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
      { $unset: { pending: "" }, $set: { lastAttempt: { status: "error", at: new Date() } } },
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
    const source = [...new Map(games.map((game) => [game.gameId, game])).values()];
    const counts = { withoutExpansions: 0, withExpansions: source.length, wishlist: 0 };
    for (let i = 0; i < source.length; i += 250) {
      const chunk = source.slice(i, i + 250);
      const known = await catalog
        .find(
          { id: { $in: chunk.map((game) => game.gameId) } },
          { projection: { id: 1, isExpansion: 1 } },
        )
        .toArray();
      const expansions = new Set(known.filter((game) => game.isExpansion).map((game) => game.id));
      const stored = chunk.map((game) => ({
        ...game,
        userId,
        snapshot,
        isExpansion: Boolean(
          game.isExpansion || game.subtype === "boardgameexpansion" || expansions.has(game.gameId),
        ),
      }));
      const visible = stored.filter((game) => !game.isExpansion);
      counts.withoutExpansions += visible.length;
      counts.wishlist += stored.filter((game) => game.wishlist).length;
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
      }
      await this.collection.bulkWrite(
        stored.map((game) => ({
          updateOne: {
            filter: { userId, snapshot, gameId: game.gameId },
            update: { $set: game },
            upsert: true,
          },
        })),
      );
    }
    const updated = await this.accounts.updateOne(
      { userId, "pending.snapshot": snapshot, "pending.status": "syncing" },
      {
        $set: {
          active: { ...identity, snapshot, syncedAt: new Date(), counts },
          lastAttempt: { status: "success", at: new Date() },
        },
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

  async page(userId: string, input: BggCollectionQuery): Promise<BggCollectionResponse> {
    const account = await this.get(userId);
    if (!account.active) throw new CommunityError(404, "BGG_COLLECTION_UNAVAILABLE");
    if (account.active.snapshot !== input.snapshot)
      throw new CommunityError(409, "BGG_COLLECTION_CHANGED");
    let cursor: z.infer<typeof collectionCursor> | undefined;
    if (input.cursor) {
      try {
        cursor = collectionCursor.parse(
          JSON.parse(Buffer.from(input.cursor, "base64url").toString()),
        );
      } catch {
        throw new CommunityError(400, "INVALID_CURSOR");
      }
      if (cursor.snapshot !== input.snapshot)
        throw new CommunityError(409, "BGG_COLLECTION_CHANGED");
    }
    const escaped = input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rows = await this.collection
      .find({
        userId,
        snapshot: input.snapshot,
        ...(escaped ? { name: { $regex: escaped, $options: "i" } } : {}),
        ...(cursor
          ? {
              $or: [
                { name: { $gt: cursor.name } },
                { name: cursor.name, gameId: { $gt: cursor.gameId } },
              ],
            }
          : {}),
      })
      .sort({ name: 1, gameId: 1 })
      .limit(input.limit + 1)
      .toArray();
    const visible = rows.slice(0, input.limit);
    const catalog = visible.length
      ? await this.db
          .collection<BoardGame>(COLLECTIONS.BOARD_GAMES)
          .find({ id: { $in: visible.map((row) => row.gameId) } })
          .toArray()
      : [];
    const metadata = new Map(catalog.map((row) => [row.id, row]));
    const current = await this.get(userId);
    if (current.active?.snapshot !== input.snapshot)
      throw new CommunityError(409, "BGG_COLLECTION_CHANGED");
    return {
      snapshot: input.snapshot,
      counts: account.active.counts ?? null,
      items: visible.map((row) => {
        let legacy: Omit<BggCollectionGame, "_id"> | undefined;
        if (row.userRating === undefined) {
          try {
            legacy = parseBggCollection(`<items>${row.xml}</items>`, userId, input.snapshot)[0];
          } catch {
            /* Missing legacy metadata remains N/A. */
          }
        }
        const stats = metadata.get(row.gameId);
        return {
          id: row.gameId,
          name: row.name,
          year: row.year,
          imageUrl: row.imageUrl,
          source: "collection",
          userRating: row.userRating ?? legacy?.userRating ?? null,
          wishlist: row.wishlist ?? legacy?.wishlist ?? false,
          isExpansion: row.isExpansion ?? row.subtype === "boardgameexpansion",
          average: stats?.average ?? null,
          rank: stats?.rank ?? null,
          bayesAverage: stats?.bayesAverage ?? null,
          minPlayMinutes: stats?.minPlayMinutes ?? null,
          maxPlayMinutes: stats?.maxPlayMinutes ?? null,
        };
      }),
      nextCursor:
        rows.length > input.limit
          ? Buffer.from(
              JSON.stringify({
                snapshot: input.snapshot,
                name: visible[visible.length - 1].name,
                gameId: visible[visible.length - 1].gameId,
              }),
            ).toString("base64url")
          : null,
    };
  }

  games(userId: string, snapshot: string) {
    return this.collection.find({ userId, snapshot });
  }
}
