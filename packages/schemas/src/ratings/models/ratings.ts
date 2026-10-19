import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";

export const ratingScopeSchema = z.enum(["GLOBAL", "GROUP"]);
export type RatingScope = z.infer<typeof ratingScopeSchema>;
export const ratingStateSchema = z.object({
  mu: z.number().finite(),
  sigma: z.number().finite().positive(),
  gamesPlayed: z.number().int().nonnegative(),
});
export type RatingState = z.infer<typeof ratingStateSchema>;

function validScope(value: { scope: RatingScope; groupId: string | null }) {
  return (value.scope === "GLOBAL") === (value.groupId === null);
}

export const playerRatingModel = ratingStateSchema
  .extend({
    userId: targetUserIdSchema,
    gameId: z.number().int().positive(),
    scope: ratingScopeSchema,
    groupId: z.uuid().nullable(),
    conservativeScore: z.number().finite(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .refine(validScope, { path: ["groupId"], message: "Invalid rating scope" });
export type PlayerRating = z.infer<typeof playerRatingModel>;

const ratingEventFields = {
  userId: targetUserIdSchema,
  gameId: z.number().int().positive(),
  scope: ratingScopeSchema,
  groupId: z.uuid().nullable(),
  algorithm: z.literal("openskill-v1"),
  rank: z.number().int().positive(),
  didNotFinish: z.boolean(),
  before: ratingStateSchema,
  after: ratingStateSchema,
  delta: z.number().finite(),
  finalizedAt: z.iso.datetime({ offset: true }),
};
export const ratingEventModel = z
  .object({ ...ratingEventFields, matchId: z.uuid() })
  .refine(validScope, { path: ["groupId"], message: "Invalid rating scope" });
export type RatingEvent = z.infer<typeof ratingEventModel>;
export const tableRatingEventModel = z
  .object({ ...ratingEventFields, tableId: z.uuid(), eventId: z.uuid() })
  .refine(validScope, { path: ["groupId"], message: "Invalid rating scope" });
export type TableRatingEvent = z.infer<typeof tableRatingEventModel>;

export const PLAYER_RATING_INDEXES = [
  { key: { userId: 1, gameId: 1, scope: 1, groupId: 1 }, unique: true },
  { key: { gameId: 1, scope: 1, groupId: 1, conservativeScore: -1, userId: 1 } },
] as const;
export const RATING_EVENT_INDEXES = [
  {
    key: { matchId: 1, userId: 1, gameId: 1, scope: 1, groupId: 1 },
    unique: true,
    partialFilterExpression: { matchId: { $exists: true } },
  },
  {
    key: { tableId: 1, userId: 1, gameId: 1, scope: 1, groupId: 1 },
    unique: true,
    partialFilterExpression: { tableId: { $exists: true } },
  },
  { key: { userId: 1, gameId: 1, scope: 1, groupId: 1, finalizedAt: -1 } },
] as const;
