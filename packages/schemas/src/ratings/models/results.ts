import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";

/** Exact signed decimal; never convert victory points through floating point. */
export const scoreSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(48);
export const resultEntrySchema = z
  .object({
    userId: targetUserIdSchema,
    score: scoreSchema.nullable(),
    rank: z.number().int().positive().nullable(),
  })
  .strict();
export const tieBreakSchema = z
  .object({ score: scoreSchema, orderedUserIds: z.array(targetUserIdSchema).min(2) })
  .strict();
export const resultsSchema = z
  .object({
    lowerWins: z.boolean(),
    entries: z.array(resultEntrySchema).min(1),
    tieBreaks: z.array(tieBreakSchema),
    finalizedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type TableResults = z.infer<typeof resultsSchema>;
