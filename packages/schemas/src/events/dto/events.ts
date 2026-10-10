import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";
import { eventModel, eventTableModel } from "../models/events";

export const MAX_EVENT_TABLES = 20;

export const eventTableInputSchema = eventTableModel
  .omit({
    eventId: true,
    status: true,
    matchId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({ id: z.uuid().optional() })
  .strict()
  .superRefine((table, ctx) => {
    if (Date.parse(table.endsAt) <= Date.parse(table.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Table must end after its start" });
    }
    if (table.maxPlayers < table.minPlayers) {
      ctx.addIssue({
        code: "custom",
        path: ["maxPlayers"],
        message: "Maximum must not be below minimum",
      });
    }
  });
export type EventTableInput = z.infer<typeof eventTableInputSchema>;

export const saveEventSchema = eventModel
  .omit({
    id: true,
    organizationId: true,
    adminUserId: true,
    version: true,
    closedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    status: z.enum(["DRAFT", "PUBLISHED"]),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Invalid time zone"),
    tables: z.array(eventTableInputSchema).max(MAX_EVENT_TABLES),
  })
  .strict()
  .superRefine((event, ctx) => {
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      try {
        const day = new Intl.DateTimeFormat("en-CA", {
          timeZone: event.timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        if (day.format(new Date(start)) !== day.format(new Date(end)))
          ctx.addIssue({
            code: "custom",
            path: ["endsAt"],
            message: "Event must start and end on the same local day",
          });
      } catch {
        // Invalid zone is reported by the timeZone field refinement.
      }
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Event must end after its start" });
    }
    if (Date.parse(event.bookingClosesAt) >= start) {
      ctx.addIssue({
        code: "custom",
        path: ["bookingClosesAt"],
        message: "Booking must close before event starts",
      });
    }
    if (event.status === "PUBLISHED" && event.tables.length === 0 && !("version" in event)) {
      ctx.addIssue({
        code: "custom",
        path: ["tables"],
        message: "Published event requires a table",
      });
    }
    const ids = new Set<string>();
    for (const [index, table] of event.tables.entries()) {
      if (Date.parse(table.startsAt) <= start || Date.parse(table.endsAt) >= end) {
        ctx.addIssue({
          code: "custom",
          path: ["tables", index],
          message: "Table must be contained in event",
        });
      }
      if (table.id) {
        if (ids.has(table.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["tables", index, "id"],
            message: "Table ids must be unique",
          });
        }
        ids.add(table.id);
      }
    }
  });
export type SaveEventInput = z.infer<typeof saveEventSchema>;
/** Partial table edits: unlisted tables are retained, never silently deleted. */
export const updateEventSchema = saveEventSchema
  .safeExtend({
    version: z.number().int().positive(),
    removedTableIds: z
      .array(z.uuid())
      .refine((ids) => new Set(ids).size === ids.length)
      .default([]),
  })
  .superRefine((input, ctx) => {
    if (input.tables.some((table) => table.id && input.removedTableIds.includes(table.id))) {
      ctx.addIssue({
        code: "custom",
        path: ["removedTableIds"],
        message: "A table cannot be edited and removed together",
      });
    }
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export const inviteEventPlayerSchema = z.object({ userId: targetUserIdSchema }).strict();
export const eventBookingActionSchema = z
  .object({
    action: z.enum(["accept", "decline", "approve", "reject", "cancel", "remove"]),
  })
  .strict();
export type EventBookingAction = z.infer<typeof eventBookingActionSchema>;
