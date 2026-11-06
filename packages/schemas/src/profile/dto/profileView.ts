import { z } from "zod";
import type { BggCollectionCounts } from "../../games/models/bggCollection";

export const profileActivityKindSchema = z.enum([
  "played",
  "friendship",
  "event_join",
  "table_join",
  "group_join",
  "follower",
  "milestone",
]);
export type ProfileActivityKind = z.infer<typeof profileActivityKindSchema>;
export const profileActivityQuerySchema = z
  .object({
    kind: profileActivityKindSchema.optional(),
    limit: z.coerce
      .number()
      .pipe(z.union([z.literal(5), z.literal(10)]))
      .default(10),
    cursor: z
      .string()
      .max(100)
      .refine((value) => {
        const parts = value.split("|");
        return (
          parts.length === 2 &&
          z.iso.datetime({ precision: 3 }).safeParse(parts[0]).success &&
          z.uuid().safeParse(parts[1]).success
        );
      })
      .optional(),
  })
  .strict();
export const profileGameQuerySchema = z
  .object({
    cursor: z.coerce.number().int().nonnegative().default(0),
    query: z.string().trim().max(120).default(""),
  })
  .strict();
export const profileHistoryQuerySchema = z
  .object({ cursor: z.coerce.number().int().positive().optional() })
  .strict();
export type ProfilePlayerStats = { gamesPlayed: number; gamesWon: number; winRate: number | null };
export type ProfileView = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  social: { friends: number; followers: number; following: number };
  player: ProfilePlayerStats;
  /** Published collection metadata only; no provider account identity or sync controls. */
  collection?: { snapshot: string; counts?: BggCollectionCounts } | null;
};
/** No stored resource names or public hrefs: each read resolves current source permissions. */
export type ProfileActivityRecord = {
  id: string;
  source: string;
  userId: string;
  kind: ProfileActivityKind;
  occurredAt: string;
  eventId?: string;
  tableId?: string;
  groupId?: string;
  otherUserId?: string;
  outcome?: "won" | "played";
  milestone?: number;
};
export type ProfileActivity = Pick<
  ProfileActivityRecord,
  "id" | "kind" | "occurredAt" | "outcome" | "milestone"
> & {
  context: string | null;
  href: string | null;
  author?: ActivityAuthor;
  groupId?: string;
  eventContext?: string;
  otherUserId?: string;
  visibility?: "public-group" | "authorized";
};
export const communityNetworkSchema = z.enum(["all", "friends", "following"]);
export type CommunityNetwork = z.infer<typeof communityNetworkSchema>;
export const communityActivityQuerySchema = profileActivityQuerySchema
  .extend({
    network: communityNetworkSchema.default("all"),
    limit: z.coerce.number().pipe(z.literal(10)).default(10),
  })
  .strict();
export type ActivityAuthor = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};
export type CommunityActivity = ProfileActivity & { author: ActivityAuthor };
export type ProfileActivityPage = { items: ProfileActivity[]; nextCursor: string | null };
export type CommunityActivityPage = { items: CommunityActivity[]; nextCursor: string | null };
export type ProfileRatingGame = { id: number; name: string; imageUrl: string | null };
export type ProfileRatingGames = { items: ProfileRatingGame[]; nextCursor: number | null };
export type ProfileRatingPoint = { ordinal: number; rating: number; delta: number };
export type ProfileRatingHistory = {
  game: ProfileRatingGame | null;
  rating: number | null;
  delta: number | null;
  stats: ProfilePlayerStats;
  points: ProfileRatingPoint[];
  nextCursor: number | null;
};
export const PROFILE_ACTIVITY_INDEXES = [
  { key: { userId: 1, source: 1, kind: 1 }, unique: true },
  { key: { userId: 1, occurredAt: -1, id: -1 } },
  { key: { userId: 1, kind: 1, occurredAt: -1, id: -1 } },
  { key: { groupId: 1 } },
  { key: { eventId: 1 } },
  { key: { occurredAt: -1, id: -1 } },
  { key: { source: 1, kind: 1, id: -1 } },
  { key: { userId: 1, eventId: 1, kind: 1, occurredAt: 1 } },
] as const;
