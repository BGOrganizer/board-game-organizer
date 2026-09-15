import type { ObjectId } from "mongodb";

export const NOTIFICATION_KINDS = [
  "friend_request",
  "friend_request_accepted",
  "match_invitation",
  "match_invitation_accepted",
  "match_invitation_declined",
  "match_updated",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type PushPlatform = "web" | "android" | "ios";
export type PushProvider = "fcm" | "apns";

/** Persisted notification inbox item. Push delivery is best-effort transport. */
export interface Notification {
  _id: ObjectId;
  recipientUserId: string;
  actorUserId: string;
  kind: NotificationKind;
  title: string;
  description: string;
  href: string;
  readAt?: Date;
  createdAt: Date;
}

/** One browser or native installation registered for remote push. */
export interface PushSubscription {
  _id: ObjectId;
  userId: string;
  token: string;
  platform: PushPlatform;
  provider: PushProvider;
  locale: "en" | "it";
  createdAt: Date;
  updatedAt: Date;
}

export const NOTIFICATION_INDEXES = [
  { key: { recipientUserId: 1, createdAt: -1 } },
  { key: { recipientUserId: 1, readAt: 1 } },
  { key: { actorUserId: 1 } },
] as const;

export const PUSH_SUBSCRIPTION_INDEXES = [
  { key: { token: 1 }, unique: true },
  { key: { userId: 1, updatedAt: -1 } },
] as const;
