import { z } from "zod";

export const eventPeriods = ["future", "past"] as const;
export type EventPeriod = (typeof eventPeriods)[number];
export const eventPeriodsSchema = z
  .string()
  .max(50)
  .default(eventPeriods.join(","))
  .transform((value) => (value === "" ? [] : value.split(",")))
  .pipe(z.array(z.enum(eventPeriods)).max(2));
