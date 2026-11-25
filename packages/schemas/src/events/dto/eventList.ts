import { z } from "zod";
import type { RecordListOrder } from "../../common/dto/common";
import { eventStateSchema } from "../models/eventRecord";

export const eventListSections = ["mine", "available", "terminated"] as const;
export type EventListSection = (typeof eventListSections)[number];
export const terminatedEventFilterRoles = ["admin", "moderator", "participant"] as const;
export const scheduledEventFilterRoles = [...terminatedEventFilterRoles, "pending"] as const;
export type EventListFilterRole = (typeof scheduledEventFilterRoles)[number];
export const eventListDefaultOrder = {
  mine: { sort: "date", direction: "asc" },
  available: { sort: "date", direction: "asc" },
  terminated: { sort: "date", direction: "desc" },
} as const satisfies Record<EventListSection, RecordListOrder>;
export const tableListSections = ["mine", "waiting"] as const;
export type TableListSection = (typeof tableListSections)[number];

export const eventListStatuses = ["CONFIRMED", "PLANNING", "TERMINATED"] as const;
export type EventListStatus = (typeof eventListStatuses)[number];
export const eventListStatusesSchema = z
  .string()
  .max(100)
  .transform((value) => (value === "" ? [] : value.split(",")))
  .pipe(z.array(eventStateSchema).max(3))
  .transform((values) => eventListStatuses.filter((status) => values.includes(status)));

export const eventPeriods = ["future", "past"] as const;
export type EventPeriod = (typeof eventPeriods)[number];
export const eventPeriodsSchema = z
  .string()
  .max(50)
  .default(eventPeriods.join(","))
  .transform((value) => (value === "" ? [] : value.split(",")))
  .pipe(z.array(z.enum(eventPeriods)).max(2));
