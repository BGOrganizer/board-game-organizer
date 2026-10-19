import { z } from "zod";

/** All columns in the BGG rankings CSV; empty category ranks become null. */
export const boardGameCsvModel = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    yearPublished: z.number().int(),
    rank: z.number().int().nonnegative(),
    bayesAverage: z.number().nonnegative(),
    average: z.number().nonnegative(),
    usersRated: z.number().int().nonnegative(),
    isExpansion: z.boolean(),
    abstractsRank: z.number().int().positive().nullable(),
    cgsRank: z.number().int().positive().nullable(),
    childrensGamesRank: z.number().int().positive().nullable(),
    familyGamesRank: z.number().int().positive().nullable(),
    partyGamesRank: z.number().int().positive().nullable(),
    strategyGamesRank: z.number().int().positive().nullable(),
    thematicRank: z.number().int().positive().nullable(),
    warGamesRank: z.number().int().positive().nullable(),
  })
  .strict();
export type BoardGameCsv = z.infer<typeof boardGameCsvModel>;

export const boardGameModel = boardGameCsvModel.partial().extend({
  id: z.number().int().positive(),
  name: z.string(),
  yearPublished: z.number().nullable().optional(),
  image: z.string().nullable().optional(),
  imageCheckedAt: z.string().optional(),
  minPlayMinutes: z.number().int().positive().nullable().optional(),
  maxPlayMinutes: z.number().int().positive().nullable().optional(),
  durationCheckedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type BoardGame = z.infer<typeof boardGameModel>;
