import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";

export const contactNotificationSections = ["connections", "requests", "search"] as const;
export type ContactNotificationSection = (typeof contactNotificationSections)[number];
export const notificationAttentionTargetSchema = z.discriminatedUnion("kind", [
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
    target: notificationAttentionTargetSchema.refine((target) => target.kind !== "contact"),
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
  })
  .strict();
export type NotificationAttentionReference = z.infer<typeof notificationAttentionReferenceSchema>;
export const notificationAttentionCountSchema = notificationAttentionReferenceSchema
  .extend({
    count,
    direct: count,
    events: count,
    sections: z.object({ connections: count, requests: count, search: count }).strict(),
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
