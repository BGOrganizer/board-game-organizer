import type {
  CommunityNotificationKind,
  Notification,
  NotificationDto,
  NotificationListResponse,
  User,
} from "@board-game-organizer/schemas";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";
import { localizedNotificationText, notificationCopy } from "./notification-copy";

export type NotificationEvent =
  | {
      kind: CommunityNotificationKind;
      recipientUserId: string;
      actorUserId: string;
      resourceName: string;
      resourceHref: string;
    }
  | {
      kind: "friend_request" | "friend_request_accepted";
      recipientUserId: string;
      actorUserId: string;
    }
  | {
      kind: "group_invitation" | "group_invitation_accepted";
      recipientUserId: string;
      actorUserId: string;
      groupName: string;
      groupId: string;
    }
  | {
      kind:
        | "match_invitation"
        | "match_invitation_accepted"
        | "match_invitation_declined"
        | "match_updated"
        | "match_created"
        | "match_replanning"
        | "match_terminated";
      recipientUserId: string;
      actorUserId: string;
      matchName: string;
      matchId: string;
    };

export { notificationCopy } from "./notification-copy";

function toDto(notification: Notification, locale?: "en" | "it"): NotificationDto {
  return {
    id: notification._id.toHexString(),
    kind: notification.kind,
    ...localizedNotificationText(notification, locale),
    href: notification.href,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export class NotificationsRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
    private createdIds?: ObjectId[],
  ) {}

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  async notify(event: NotificationEvent) {
    return (await this.notifyMany([event]))[0] ?? null;
  }

  async notifyMany(events: NotificationEvent[]) {
    if (events.length === 0) return [];
    const userIds = [
      ...new Set(events.flatMap((event) => [event.recipientUserId, event.actorUserId])),
    ];
    const users = await this.db
      .collection<User>(COLLECTIONS.USERS)
      .find({ clerkId: { $in: userIds } }, this.opts)
      .toArray();
    const usersById = new Map(users.map((user) => [user.clerkId, user]));
    const createdAt = new Date();
    const rows = events.flatMap((event) => {
      const recipient = usersById.get(event.recipientUserId);
      const actor = usersById.get(event.actorUserId);
      if (!recipient || !actor) return [];
      const actorName = "resourceName" in event ? (actor.username ?? actor.name) : actor.name;
      const resourceName =
        "resourceName" in event
          ? event.resourceName
          : "matchName" in event
            ? event.matchName
            : "groupName" in event
              ? event.groupName
              : undefined;
      return [
        {
          recipientUserId: event.recipientUserId,
          actorUserId: event.actorUserId,
          kind: event.kind,
          copy: { actorName, ...(resourceName === undefined ? {} : { resourceName }) },
          ...notificationCopy(event.kind, recipient.preferredLanguage, actorName, resourceName),
          ...("resourceHref" in event
            ? { href: event.resourceHref }
            : "matchId" in event
              ? { href: `/matches/${event.matchId}` }
              : "groupId" in event
                ? { href: `/groups/${event.groupId}` }
                : {}),
          createdAt,
        } as Notification,
      ];
    });
    if (rows.length === 0) return [];
    const result = await this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .insertMany(rows, this.opts);
    const insertedIds = Object.values(result.insertedIds);
    this.createdIds?.push(...insertedIds);
    return insertedIds;
  }

  async list(
    recipientUserId: string,
    limit: number,
    cursor?: string,
    locale?: "en" | "it",
  ): Promise<NotificationListResponse> {
    let cursorFilter = {};
    if (cursor) {
      const cursorId = new ObjectId(cursor);
      const cursorRow = await this.db
        .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
        .findOne({ _id: cursorId, recipientUserId }, this.opts);
      if (!cursorRow) return { notifications: [], unreadCount: 0, nextCursor: null };
      cursorFilter = {
        $or: [
          { createdAt: { $lt: cursorRow.createdAt } },
          { createdAt: cursorRow.createdAt, _id: { $lt: cursorId } },
        ],
      };
    }

    const rows = await this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .find({ recipientUserId, ...cursorFilter }, this.opts)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    const unreadCount = await this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .countDocuments({ recipientUserId, readAt: { $exists: false } }, this.opts);
    const hasMore = rows.length > limit;
    const notifications = rows.slice(0, limit);
    return {
      notifications: notifications.map((row) => toDto(row, locale)),
      unreadCount,
      nextCursor: hasMore ? (notifications.at(-1)?._id.toHexString() ?? null) : null,
    };
  }

  markRead(recipientUserId: string, notificationId: string) {
    return this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .updateOne(
        { _id: new ObjectId(notificationId), recipientUserId, readAt: { $exists: false } },
        { $set: { readAt: new Date() } },
        this.opts,
      );
  }

  markAllRead(recipientUserId: string) {
    return this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .updateMany(
        { recipientUserId, readAt: { $exists: false } },
        { $set: { readAt: new Date() } },
        this.opts,
      );
  }

  deleteOne(recipientUserId: string, notificationId: string) {
    return this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .deleteOne({ _id: new ObjectId(notificationId), recipientUserId }, this.opts);
  }

  async deleteForUser(userId: string) {
    await this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .deleteMany({ $or: [{ recipientUserId: userId }, { actorUserId: userId }] }, this.opts);
    await this.db.collection(COLLECTIONS.PUSH_SUBSCRIPTIONS).deleteMany({ userId }, this.opts);
  }
}
