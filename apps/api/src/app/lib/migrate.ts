import {
  BLOCK_INDEXES,
  FOLLOW_INDEXES,
  FRIEND_REQUEST_INDEXES,
  INVITE_INDEXES,
  MATCH_INDEXES,
  MATCH_INVITATION_INDEXES,
  normalizePhoneNumberForMatching,
  USER_INDEXES,
  type User,
} from "@board-game-organizer/schemas";
import type { Db, IndexSpecification } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Creates application collections with shared indexes and drops the legacy
 * `relationships`
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
    [COLLECTIONS.MATCHES, MATCH_INDEXES],
    [COLLECTIONS.MATCH_INVITATIONS, MATCH_INVITATION_INDEXES],
  ];

  const created: string[] = [];
  for (const [name, indexes] of tables) {
    await db.createCollection(name).catch(() => undefined); // already exists
    for (const index of indexes) {
      await db.collection(name).createIndex(index.key as IndexSpecification, {
        ...(index.unique ? { unique: index.unique } : {}),
        ...(index.partialFilterExpression
          ? { partialFilterExpression: index.partialFilterExpression }
          : {}),
      });
      created.push(`${name}:${JSON.stringify(index.key)}`);
    }
  }

  // The legacy single `relationships` collection is no longer written by
  // the repository (Phase 1 restructure) — drop it unconditionally.
  const users = db.collection<User>(COLLECTIONS.USERS);
  const usersWithPhones = await users
    .find({ mobileNumber: { $type: "string" } }, { projection: { mobileNumber: 1 } })
    .toArray();
  if (usersWithPhones.length) {
    await users.bulkWrite(
      usersWithPhones.map((user) => {
        const normalized = normalizePhoneNumberForMatching(user.mobileNumber);
        return {
          updateOne: {
            filter: { _id: user._id },
            update: normalized
              ? { $set: { mobileNumberNormalized: normalized } }
              : { $unset: { mobileNumberNormalized: "" } },
          },
        };
      }),
    );
  }

  const dropped = await db
    .collection(COLLECTIONS.RELATIONSHIPS)
    .drop()
    .catch(() => false);
  return { created, droppedLegacyRelationships: dropped };
}
