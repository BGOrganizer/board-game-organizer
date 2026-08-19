import {
  BLOCK_INDEXES,
  FOLLOW_INDEXES,
  FRIEND_REQUEST_INDEXES,
  INVITE_INDEXES,
  USER_INDEXES,
} from "@board-game-organizer/schemas";
import type { Db, IndexSpecification } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Phase 1 migration: creates the social collections with their indexes
 * (shared from `packages/schemas`) and drops the legacy `relationships`
 * collection, whose data model was replaced by `follows` + `friendRequests`
 * + `blocks`.
 *
 * Run via `pnpm --filter api migrate` (see scripts/migrate.ts).
 */
interface IndexDef {
  key: Record<string, number | string>;
  unique?: boolean;
  partialFilterExpression?: object;
}

export async function migrate(db: Db) {
  const tables: Array<[string, ReadonlyArray<IndexDef>]> = [
    [COLLECTIONS.USERS, USER_INDEXES],
    [COLLECTIONS.FOLLOWS, FOLLOW_INDEXES],
    [COLLECTIONS.FRIEND_REQUESTS, FRIEND_REQUEST_INDEXES],
    [COLLECTIONS.BLOCKS, BLOCK_INDEXES],
    [COLLECTIONS.INVITES, INVITE_INDEXES],
  ];

  const created: string[] = [];
  for (const [name, indexes] of tables) {
    await db.createCollection(name).catch(() => undefined); // already exists
    for (const index of indexes) {
      await db.collection(name).createIndex(index.key as IndexSpecification, {
        unique: index.unique,
        partialFilterExpression: index.partialFilterExpression,
      });
      created.push(`${name}:${JSON.stringify(index.key)}`);
    }
  }

  const dropped =
    process.env.DROP_LEGACY_RELATIONSHIPS === "true"
      ? await db
          .collection(COLLECTIONS.RELATIONSHIPS)
          .drop()
          .catch(() => false)
      : false;
  return { created, droppedLegacyRelationships: dropped };
}
