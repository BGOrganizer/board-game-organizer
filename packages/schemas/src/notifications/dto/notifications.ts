import { z } from "zod";
import type { NOTIFICATION_KINDS } from "../models/notifications";

export const notificationIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const notificationListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(5),
    cursor: notificationIdSchema.optional(),
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export const pushSubscriptionSchema = z
  .object({
    token: z.string().trim().min(16).max(4096),
    platform: z.enum(["web", "android", "ios"]),
    locale: z.enum(["en", "it"]),
  })
  .strict();

export const removePushSubscriptionSchema = z
  .object({ token: z.string().trim().min(16).max(4096) })
  .strict();

export interface NotificationDto {
  id: string;
  kind: (typeof NOTIFICATION_KINDS)[number];
  title: string;
  description: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: NotificationDto[];
  unreadCount: number;
  nextCursor: string | null;
}

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
