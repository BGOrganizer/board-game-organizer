import { z } from "zod";

export const eventListSections = ["mine", "available"] as const;
export type EventListSection = (typeof eventListSections)[number];
export const tableListSections = ["mine", "waiting"] as const;
export type TableListSection = (typeof tableListSections)[number];

export const eventPeriods = ["future", "past"] as const;
export type EventPeriod = (typeof eventPeriods)[number];
export const eventPeriodsSchema = z
  .string()
  .max(50)
  .default(eventPeriods.join(","))
  .transform((value) => (value === "" ? [] : value.split(",")))
  .pipe(z.array(z.enum(eventPeriods)).max(2));
