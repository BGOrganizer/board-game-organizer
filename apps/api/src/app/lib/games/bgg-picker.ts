import { createHash } from "node:crypto";
import type {
  BggAccount,
  BggCollectionGame,
  BggPickerItem,
  BggPickerQuery,
  BggPickerResponse,
  BoardGame,
} from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { z } from "zod";
import { recordServices } from "../community/record-services";
import { CommunityError } from "../community.error";
import { COLLECTIONS } from "../db";
import { ProfileService } from "../profile/profile.service";
import { gameThumbnail, hydrateGames, searchGames } from "./bgg";

const cursorSchema = z
  .object({
    offset: z.number().int().nonnegative().max(1_000_000),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

async function contexts(db: Db, userId: string, input: BggPickerQuery) {
  if (!input.proposalEventId && input.participants !== "1")
    return { excluded: [] as number[], participantScope: null };
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const events = recordServices(db, session).events;
      const excluded =
        input.proposalEventId && input.proposalTableId
          ? await events.proposalPickerExclusions(
              userId,
              input.proposalEventId,
              input.proposalTableId,
            )
          : [];
      const participantScope =
        input.participants === "1" && input.participantEventId && input.participantTableId
          ? await events.collectionPickerScope(
              userId,
              input.participantEventId,
              input.participantTableId,
            )
          : null;
      return { excluded, participantScope };
    });
  } finally {
    await session.endSession();
  }
}

async function sources(db: Db, userId: string, input: BggPickerQuery) {
  const { excluded: capturedExcluded, participantScope } = await contexts(db, userId, input);
  const owners = new Set([
    ...(input.collection === "1" ? [userId] : []),
    ...(participantScope?.userIds ?? []),
  ]);
  const profiles = new ProfileService(db);
  // ponytail: one existing Profile guard per owner; batch this guard if large Table rosters measure slow.
  for (const owner of owners) {
    if (owner === userId) continue;
    try {
      await profiles.requireVisible(userId, owner);
    } catch (error) {
      if (!(error instanceof CommunityError) || ![403, 404].includes(error.status)) throw error;
      owners.delete(owner);
    }
  }
  const accounts = owners.size
    ? await db
        .collection<BggAccount>(COLLECTIONS.BGG_ACCOUNTS)
        .find(
          { userId: { $in: [...owners] }, "active.snapshot": { $type: "string" } },
          { projection: { _id: 0, userId: 1, "active.snapshot": 1 } },
        )
        .toArray()
    : [];
  const snapshots = accounts
    .map((account) => ({ userId: account.userId, snapshot: account.active!.snapshot }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const excluded = [...new Set(capturedExcluded)].sort((a, b) => a - b);
  const scope = createHash("sha256")
    .update(
      JSON.stringify([
        "sources-v2",
        userId,
        input.query,
        input.collection,
        input.participants,
        input.proposalEventId,
        input.proposalTableId,
        input.participantEventId,
        input.participantTableId,
        participantScope,
        snapshots,
        excluded,
      ]),
    )
    .digest("hex");
  return { scope, snapshots, excluded };
}

/** Only selected published collections are unioned; neither chip means the local catalog. */
export async function bggPickerPage(
  db: Db,
  userId: string,
  input: BggPickerQuery,
): Promise<BggPickerResponse> {
  const before = await sources(db, userId, input);
  let offset = 0;
  if (input.cursor) {
    let cursor: z.infer<typeof cursorSchema>;
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new CommunityError(409, "BGG_PICKER_CHANGED");
    }
    if (cursor.scope !== before.scope) throw new CommunityError(409, "BGG_PICKER_CHANGED");
    offset = cursor.offset;
  }
  const collections = input.collection === "1" || input.participants === "1";
  let items: BggPickerItem[] = [];
  let more = false;
  if (collections && before.snapshots.length) {
    const prefix = new RegExp(`^${input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    const rows = await db
      .collection<BggCollectionGame>(COLLECTIONS.BGG_COLLECTION_GAMES)
      .aggregate<{ _id: number; name: string; year: number | null; imageUrl: string | null }>([
        {
          $match: {
            $or: before.snapshots,
            isExpansion: { $ne: true },
            subtype: { $ne: "boardgameexpansion" },
            ...(input.query ? { name: prefix } : {}),
            ...(before.excluded.length ? { gameId: { $nin: before.excluded } } : {}),
          },
        },
        { $sort: { gameId: 1, userId: 1 } },
        {
          $group: {
            _id: "$gameId",
            name: { $first: "$name" },
            year: { $first: "$year" },
            imageUrl: { $first: "$imageUrl" },
          },
        },
        { $sort: { name: 1, _id: 1 } },
        { $skip: offset },
        { $limit: input.limit + 1 },
      ])
      .toArray();
    more = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const catalog = visible.length
      ? await db
          .collection<BoardGame>(COLLECTIONS.BOARD_GAMES)
          .find(
            { id: { $in: visible.map((row) => row._id) } },
            {
              projection: {
                _id: 0,
                id: 1,
                image: 1,
                average: 1,
                rank: 1,
                bayesAverage: 1,
                minPlayers: 1,
                maxPlayers: 1,
                playerCountsCheckedAt: 1,
                minPlayMinutes: 1,
                maxPlayMinutes: 1,
                durationCheckedAt: 1,
                metadataAttemptedAt: 1,
                imageCheckedAt: 1,
              },
            },
          )
          .toArray()
      : [];
    await hydrateGames(db, catalog, true);
    const byId = new Map(catalog.map((game) => [game.id, game]));
    items = visible.map((row) => {
      const game = byId.get(row._id);
      return {
        id: row._id,
        name: row.name,
        year: row.year,
        imageUrl: gameThumbnail(row.imageUrl ?? game?.image ?? null),
        average: game?.average ?? null,
        rank: game?.rank ?? null,
        bayesAverage: game?.bayesAverage ?? null,
        minPlayers: game?.minPlayers ?? null,
        maxPlayers: game?.maxPlayers ?? null,
        minPlayMinutes: game?.minPlayMinutes ?? null,
        maxPlayMinutes: game?.maxPlayMinutes ?? null,
        source: "collection" as const,
      };
    });
  } else if (!collections && input.query.length >= 4) {
    const rows = await searchGames(db, input.query, offset, input.limit + 1, before.excluded);
    more = rows.length > input.limit;
    items = rows.slice(0, input.limit).map((game) => ({ ...game, source: "search" }));
  }
  // Re-read current manager/Profile authority, roster and active publications after source paging.
  if ((await sources(db, userId, input)).scope !== before.scope)
    throw new CommunityError(409, "BGG_PICKER_CHANGED");
  return {
    items,
    nextCursor: more
      ? Buffer.from(
          JSON.stringify({ offset: offset + items.length, scope: before.scope }),
        ).toString("base64url")
      : null,
    sourceEpoch: before.scope,
  };
}
