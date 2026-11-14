import { z } from "zod";
import { notificationItemIdSchema } from "../notificationItems";
import {
  notificationAttentionCountSchema,
  notificationAttentionSnapshotSchema,
} from "./notificationAttention";

export const notificationChangesScopeSchema = z
  .object({
    kind: z.enum(["group", "event", "table"]),
    id: z.uuid(),
    tab: z.enum(["details", "members", "tables", "participants", "all", "none"]),
  })
  .strict();
export type NotificationChangesScope = z.infer<typeof notificationChangesScopeSchema>;
export const notificationChangeMessageCodes = [
  "date",
  "dates",
  "location",
  "locations",
  "game",
  "games",
  "table_settings",
  "tables",
  "group_info",
  "member_update",
  "participation",
  "event_state",
  "event_agreement_ready",
  "event_agreement_blocked",
  "event_confirmed",
  "event_replanning",
  "event_terminated",
  "event_cancelled",
  "invitation",
  "proposal",
  "review",
  "information",
] as const;
export const notificationChangeReferenceSchema = z
  .object({
    notificationId: z.string().regex(/^[a-f\d]{24}$/),
    itemId: notificationItemIdSchema.optional(),
    revision: z.number().int().nonnegative().optional(),
    effectiveAt: z.iso.datetime({ precision: 3 }),
  })
  .strict();
export type NotificationChangeReference = z.infer<typeof notificationChangeReferenceSchema>;
export const notificationChangeRowSchema = notificationChangeReferenceSchema
  .extend({
    messageCode: z.enum(notificationChangeMessageCodes),
    title: z.string(),
    description: z.string(),
    currentLabel: z.string().max(512).optional(),
    requiresResponse: z.boolean(),
    readReference: notificationChangeReferenceSchema,
  })
  .strict();
export type NotificationChangeRow = z.infer<typeof notificationChangeRowSchema>;
export const notificationChangesCursorSchema = z
  .object({
    asOf: z.iso.datetime({ precision: 3 }),
    notificationId: z.string().regex(/^[a-f\d]{24}$/),
    itemId: z.string().max(1000),
    effectiveAt: z.iso.datetime({ precision: 3 }),
  })
  .strict();
export const notificationChangesQuerySchema = notificationChangesScopeSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(50).default(8),
    locale: z.enum(["en", "it"]).optional(),
    cursor: z
      .string()
      .max(5000)
      .transform((value, ctx) => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid cursor" });
          return z.NEVER;
        }
      })
      .pipe(notificationChangesCursorSchema)
      .optional(),
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();
export type NotificationChangesQuery = z.infer<typeof notificationChangesQuerySchema>;
export const notificationChangesPageSchema = z
  .object({
    asOf: z.iso.datetime({ precision: 3 }),
    changes: z.array(notificationChangeRowSchema).max(50),
    nextCursor: z.string().nullable(),
    tabCounts: z
      .object({
        details: z.number().int().nonnegative(),
        members: z.number().int().nonnegative(),
        tables: z.number().int().nonnegative(),
        participants: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type NotificationChangesPage = z.infer<typeof notificationChangesPageSchema>;
export const readNotificationChangesSchema = z
  .object({
    scope: notificationChangesScopeSchema,
    through: z.iso.datetime({ precision: 3 }),
    references: z
      .array(notificationChangeReferenceSchema)
      .max(50)
      .refine(
        (rows) =>
          new Set(rows.map((row) => `${row.notificationId}:${row.itemId ?? ""}`)).size ===
          rows.length,
        "Duplicate references",
      ),
  })
  .strict();
export type ReadNotificationChangesInput = z.infer<typeof readNotificationChangesSchema>;
export const notificationChangesReceiptSchema = z
  .object({
    updated: z.number().int().nonnegative(),
    snapshot: notificationAttentionSnapshotSchema.extend({
      targets: z.array(notificationAttentionCountSchema).max(128),
    }),
    readReferences: z.array(notificationChangeReferenceSchema).max(50),
    tabCounts: notificationChangesPageSchema.shape.tabCounts,
    /** One transaction-wide union delta; never sum per-point read effects. */
    effects: notificationAttentionCountSchema.shape.readEffect.unwrap().extend({
      tabCounts: notificationChangesPageSchema.shape.tabCounts,
    }),
  })
  .strict();
export type NotificationChangesReceipt = z.infer<typeof notificationChangesReceiptSchema>;
