import { z } from "zod";
export const playerPollSchema = z
  .object({
    totalVotes: z.number().int().nonnegative(),
    rows: z.array(
      z
        .object({
          players: z.number().int().positive(),
          orMore: z.boolean(),
          best: z.number().int().nonnegative(),
          recommended: z.number().int().nonnegative(),
          notRecommended: z.number().int().nonnegative(),
          sampleCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    fetchedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type PlayerPoll = z.infer<typeof playerPollSchema>;
/** Strict unique plurality; missing samples and tied categories convey no recommendation. */
export function classifyPlayerCount(
  poll: PlayerPoll | null | undefined,
  count: number,
): "BEST" | "RECOMMENDED" | "NOT_RECOMMENDED" | "UNKNOWN" {
  if (!poll?.totalVotes) return "UNKNOWN";
  const row =
    poll?.rows.find((row) => !row.orMore && row.players === count) ??
    poll?.rows
      .filter((row) => row.orMore && count >= row.players)
      .sort((a, b) => b.players - a.players)[0];
  if (!row || !row.sampleCount) return "UNKNOWN";
  if (row.best > row.recommended && row.best > row.notRecommended) return "BEST";
  if (row.recommended > row.best && row.recommended > row.notRecommended) return "RECOMMENDED";
  if (row.notRecommended > row.best && row.notRecommended > row.recommended)
    return "NOT_RECOMMENDED";
  return "UNKNOWN";
}
