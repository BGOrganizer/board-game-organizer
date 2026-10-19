import { z } from "zod";

export const bggSearchItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  year: z.number().nullable(),
  bayesAverage: z.number().nullable().optional(),
  average: z.number().nullable().optional(),
  rank: z.number().nullable().optional(),
  imageUrl: z.string().nullable(),
  minPlayMinutes: z.number().int().positive().nullable().optional(),
  maxPlayMinutes: z.number().int().positive().nullable().optional(),
});
export const bggSearchResponseSchema = z.object({ items: z.array(bggSearchItemSchema) });
export type BggSearchItem = z.infer<typeof bggSearchItemSchema>;
export type BggSearchResponse = z.infer<typeof bggSearchResponseSchema>;
export const bggThingResponseSchema = bggSearchItemSchema;
export type BggThingResponse = z.infer<typeof bggThingResponseSchema>;
