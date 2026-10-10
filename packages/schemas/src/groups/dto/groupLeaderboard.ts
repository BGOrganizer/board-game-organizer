import { z } from "zod";

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
      provisional: z.boolean(),
      left: z.boolean(),
    }),
  ),
  nextCursor: z.number().int().nonnegative().nullable(),
});

export type GroupLeaderboardResponse = z.infer<typeof groupLeaderboardResponseSchema>;
