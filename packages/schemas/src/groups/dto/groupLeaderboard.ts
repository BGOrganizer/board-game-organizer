import { z } from "zod";

export const leaderboardSortSchema = z.enum(["rating", "gamesPlayed", "gamesWon", "nd"]);
export type LeaderboardSort = z.infer<typeof leaderboardSortSchema>;

export const leaderboardDirectionSchema = z.enum(["asc", "desc"]);
export type LeaderboardDirection = z.infer<typeof leaderboardDirectionSchema>;

export const leaderboardQuerySchema = z.strictObject({
  gameId: z.coerce.number().int().positive().optional(),
  cursor: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  query: z.string().trim().min(4).max(120).optional(),
  sort: leaderboardSortSchema.optional(),
  direction: leaderboardDirectionSchema.optional(),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const groupLeaderboardResponseSchema = z.object({
  games: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      imageUrl: z.string().nullable(),
    }),
  ),
  players: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      username: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      gamesPlayed: z.number().int().nonnegative(),
      gamesWon: z.number().int().nonnegative(),
      nd: z.number().int().nonnegative(),
      rating: z.number().finite().nullable(),
      position: z.number().int().positive().nullable().optional(),
      provisional: z.boolean(),
      left: z.boolean(),
      groupRole: z.enum(["ADMIN", "MODERATOR", "MEMBER"]).nullable().optional(),
    }),
  ),
  nextCursor: z.number().int().nonnegative().nullable(),
});

export type GroupLeaderboardResponse = z.infer<typeof groupLeaderboardResponseSchema>;
