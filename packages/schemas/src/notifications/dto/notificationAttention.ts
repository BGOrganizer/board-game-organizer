import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";
import { notificationItemIdSchema } from "../notificationItems";

export const contactNotificationSections = ["connections", "requests", "search"] as const;
export type ContactNotificationSection = (typeof contactNotificationSections)[number];
export const notificationListTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("event-list"),
      id: z.union([z.enum(["mine", "available"]), z.uuid()]),
    })
    .strict(),
  z.object({ kind: z.literal("group-list"), id: z.enum(["PRIVATE", "PUBLIC", "search"]) }).strict(),
]);
export const notificationAttentionTargetSchema = z.discriminatedUnion("kind", [
  ...notificationListTargetSchema.options,
  z.object({ kind: z.literal("item"), id: notificationItemIdSchema }).strict(),
  z.object({ kind: z.literal("table"), id: z.uuid() }).strict(),
  z.object({ kind: z.literal("event"), id: z.uuid() }).strict(),
  z.object({ kind: z.literal("group"), id: z.uuid() }).strict(),
  z.object({ kind: z.literal("contact"), id: targetUserIdSchema }).strict(),
  z.object({ kind: z.literal("contacts"), id: z.enum(contactNotificationSections) }).strict(),
]);
export type NotificationAttentionTarget = z.infer<typeof notificationAttentionTargetSchema>;
export const notificationAttentionQuerySchema = z
  .object({
    targets: z
      .string()
      .max(16_000)
      .transform((value, context) => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          context.addIssue({ code: "custom", message: "Invalid targets" });
          return z.NEVER;
        }
      })
      .pipe(
        z
          .array(notificationAttentionTargetSchema)
          .max(50)
          .refine(
            (targets) =>
              new Set(targets.map((target) => `${target.kind}:${target.id}`)).size ===
              targets.length,
            "Duplicate targets",
          ),
      )
      .default([]),
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();
export const readNotificationAttentionSchema = z
  .object({
    target: notificationAttentionTargetSchema.refine(
      (target) => !["contact", "event-list", "group-list"].includes(target.kind),
    ),
    through: z.iso.datetime({ precision: 3 }),
  })
  .strict();
export type ReadNotificationAttentionInput = z.infer<typeof readNotificationAttentionSchema>;
const count = z.number().int().nonnegative();
export const notificationAttentionSummarySchema = z
  .object({
    tables: count,
    events: count,
    groups: count,
    contacts: count,
    sections: z.object({ connections: count, requests: count, search: count }).strict(),
  })
  .strict();
export type NotificationAttentionSummary = z.infer<typeof notificationAttentionSummarySchema>;
export const notificationAttentionReferenceSchema = z
  .object({
    target: notificationAttentionTargetSchema,
    eventId: z.uuid().optional(),
    groupId: z.uuid().optional(),
    section: z.enum(contactNotificationSections).optional(),
    tableIds: z.array(z.uuid()).max(20).optional(),
    /** Source-authorized entities owning the unread points, never their ancestry. */
    containers: z
      .array(
        notificationAttentionTargetSchema.refine((target) =>
          ["group", "event", "table"].includes(target.kind),
        ),
      )
      .max(22)
      .optional(),
    /** Authorized tab categories, separate from actual entity ownership; never bulk-read targets. */
    lists: z.array(notificationListTargetSchema).max(4).optional(),
    itemIds: z.array(notificationItemIdSchema).max(1000).optional(),
  })
  .strict();
export type NotificationAttentionReference = z.infer<typeof notificationAttentionReferenceSchema>;
export const notificationAttentionCountSchema = notificationAttentionReferenceSchema
  .extend({
    count,
    direct: count,
    /** Newest matching unread change identity; stable across refetches, not fetch time. */
    signal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[a-f\d]{24}$/)
      .optional(),
    events: count,
    sections: z.object({ connections: count, requests: count, search: count }).strict(),
    readEffect: z
      .object({
        unread: count,
        summary: notificationAttentionSummarySchema,
        targets: z
          .array(
            z
              .object({
                target: notificationAttentionTargetSchema,
                count,
                direct: count,
                events: count,
              })
              .strict(),
          )
          .max(128),
      })
      .strict()
      .optional(),
  })
  .strict();
export type NotificationAttentionCount = z.infer<typeof notificationAttentionCountSchema>;
export const notificationAttentionSnapshotSchema = z
  .object({
    asOf: z.iso.datetime({ precision: 3 }),
    unreadCount: count,
    summary: notificationAttentionSummarySchema,
    targets: z.array(notificationAttentionCountSchema).max(50),
  })
  .strict();
export type NotificationAttentionSnapshot = z.infer<typeof notificationAttentionSnapshotSchema>;
export const notificationAttentionReceiptSchema = z
  .object({
    updated: count,
    snapshot: notificationAttentionSnapshotSchema,
  })
  .strict();
export type NotificationAttentionReceipt = z.infer<typeof notificationAttentionReceiptSchema>;
