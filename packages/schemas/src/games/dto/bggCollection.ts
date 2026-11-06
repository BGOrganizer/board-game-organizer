import { z } from "zod";
import type { BggCollectionCounts, BggIdentity } from "../models/bggCollection";
import type { BggSearchItem } from "./boardGames";

export const bggUsernameSchema = z.string().trim().min(1).max(64);

export interface BggAccountResponse {
  lastAttempt?: { status: "syncing" | "success" | "error"; at: string };
  active:
    | (BggIdentity & { snapshot: string; syncedAt: string; counts?: BggCollectionCounts })
    | null;
  pending:
    | (BggIdentity & {
        status: "syncing" | "failed";
        nextAttemptAt: string | null;
        error: string | null;
      })
    | null;
}

export interface BggPickerItem extends BggSearchItem {
  source: "collection" | "search";
}

export interface BggPickerResponse {
  items: BggPickerItem[];
  nextCursor: string | null;
}

export const bggCollectionQuerySchema = z
  .object({
    snapshot: z.string().min(1).max(100),
    query: z.string().trim().max(120).default(""),
    subjectId: z.string().trim().min(1).max(200).optional(),
    types: z.enum(["all", "games", "expansions", "none"]).optional(),
    wishlist: z.enum(["true", "false"]).optional(),
    commonSnapshot: z.string().min(1).max(100).optional(),
    cursor: z.string().max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    "x-vercel-protection-bypass": z.string().optional(),
  })
  .strict();
export type BggCollectionQuery = z.infer<typeof bggCollectionQuerySchema>;
export interface BggCollectionItem extends BggPickerItem {
  userRating: number | null;
  isExpansion: boolean;
  wishlist: boolean;
}
export interface BggCollectionResponse {
  snapshot: string;
  /** null means a legacy snapshot, NOT an empty collection. */
  counts: BggCollectionCounts | null;
  items: BggCollectionItem[];
  nextCursor: string | null;
}
