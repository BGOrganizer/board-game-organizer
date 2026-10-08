import { z } from "zod";
import { targetUserIdSchema } from "../dto/common";
import { matchLocationSchema } from "./matches";

export const eventModel = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  adminUserId: targetUserIdSchema,
  name: z.string().trim().min(5).max(120),
  timeZone: z.string().min(1).max(100),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  bookingClosesAt: z.iso.datetime({ offset: true }),
  location: matchLocationSchema,
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
  version: z.number().int().positive(),
  closedAt: z.iso.datetime({ offset: true }).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Event = z.infer<typeof eventModel>;

export const eventTableModel = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  minPlayers: z.number().int().min(2),
  maxPlayers: z.number().int().min(2),
  gameId: z.number().int().positive(),
  demonstratorUserId: targetUserIdSchema.optional(),
  openSkill: z.boolean(),
  status: z.enum(["PLANNING", "CREATED", "TERMINATED", "CANCELLED"]),
  matchId: z.uuid().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type EventTable = z.infer<typeof eventTableModel>;

export const eventBookingModel = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  tableId: z.uuid(),
  userId: targetUserIdSchema,
  kind: z.enum(["INVITATION", "REQUEST"]),
  status: z.enum(["PENDING", "CONFIRMED", "DECLINED", "CANCELLED"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type EventBooking = z.infer<typeof eventBookingModel>;

/** Transactional delivery record. A retry must use the same id and event revision. */
export const eventDeadlineDeliveryModel = z.object({
  id: z.string().min(1),
  eventId: z.uuid(),
  version: z.number().int().positive(),
  bookingClosesAt: z.iso.datetime({ offset: true }),
  deliveredAt: z.iso.datetime({ offset: true }).optional(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type EventDeadlineDelivery = z.infer<typeof eventDeadlineDeliveryModel>;

export const EVENT_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { organizationId: 1, status: 1, startsAt: 1, id: 1 } },
  { key: { status: 1, bookingClosesAt: 1, closedAt: 1 } },
] as const;
export const EVENT_TABLE_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { eventId: 1, createdAt: 1, id: 1 } },
  { key: { matchId: 1 }, unique: true, partialFilterExpression: { matchId: { $exists: true } } },
] as const;
export const EVENT_BOOKING_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { tableId: 1, userId: 1 }, unique: true },
  { key: { eventId: 1, userId: 1, status: 1 } },
  { key: { tableId: 1, status: 1, createdAt: 1, id: 1 } },
] as const;
export const EVENT_DEADLINE_DELIVERY_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { deliveredAt: 1, createdAt: 1 } },
] as const;
