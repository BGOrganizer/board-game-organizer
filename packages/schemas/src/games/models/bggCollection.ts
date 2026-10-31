import type { ObjectId } from "mongodb";

export interface BggIdentity {
  id: number;
  username: string;
  avatarUrl: string | null;
}

export interface BggAccount {
  _id: ObjectId;
  userId: string;
  active?: BggIdentity & { snapshot: string; syncedAt: Date };
  pending?: BggIdentity & {
    snapshot: string;
    status: "syncing" | "failed";
    attempts: number;
    nextAttemptAt?: Date;
    leaseUntil?: Date;
    error?: string;
  };
}

export interface BggCollectionGame {
  _id: ObjectId;
  userId: string;
  snapshot: string;
  gameId: number;
  name: string;
  year: number | null;
  imageUrl: string | null;
  subtype: string;
  /** Public BGG collection item, including status, ratings, comments and play counts. */
  xml: string;
}

export const BGG_ACCOUNT_INDEXES = [{ key: { userId: 1 }, unique: true }] as const;
export const BGG_COLLECTION_INDEXES = [
  { key: { userId: 1, snapshot: 1, gameId: 1 }, unique: true },
  { key: { userId: 1, snapshot: 1, name: 1, gameId: 1 } },
] as const;
