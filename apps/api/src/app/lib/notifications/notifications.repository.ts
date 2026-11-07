import type {
  CommunityNotificationKind,
  Notification,
  NotificationDto,
  NotificationItem,
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
      attentionItems?: NotificationItem[];
    }
  | {
      kind: "friend_request" | "friend_request_accepted" | "follow";
      recipientUserId: string;
      actorUserId: string;
    }
  | {
      kind: "group_invitation" | "group_invitation_accepted";
      recipientUserId: string;
      actorUserId: string;
      groupName: string;
      groupId: string;
      attentionItems?: NotificationItem[];
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
    ...(notification.attentionItems
      ? {
          attentionItems: notification.attentionItems.map((item) => ({
            id: item.id,
            revision: item.revision,
            ...(item.sectionId ? { sectionId: item.sectionId } : {}),
            ...(item.changedAt ? { changedAt: item.changedAt.toISOString() } : {}),
            readAt: (notification.readAt ?? item.readAt)?.toISOString() ?? null,
          })),
        }
      : {}),
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
          ...("attentionItems" in event && event.attentionItems?.length
            ? {
                attentionItems: event.attentionItems.map((item) => ({
                  ...item,
                  changedAt: createdAt,
                })),
              }
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

  async retargetItems(replacements: readonly { from: string; to: NotificationItem }[]) {
    if (!replacements.length) return;
    await this.db.collection<Notification>(COLLECTIONS.NOTIFICATIONS).updateMany(
      {
        readAt: { $exists: false },
        "attentionItems.id": { $in: replacements.map((row) => row.from) },
      },
      [
        {
          $set: {
            attentionItems: {
              $map: {
                input: "$attentionItems",
                as: "item",
                in: {
                  $let: {
                    vars: {
                      replacement: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: { $literal: replacements },
                              as: "value",
                              cond: { $eq: ["$$value.from", "$$item.id"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      $cond: [
                        { $ne: [{ $ifNull: ["$$replacement", null] }, null] },
                        {
                          $mergeObjects: ["$$item", "$$replacement.to", { changedAt: new Date() }],
                        },
                        "$$item",
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ],
      this.opts,
    );
  }

  /** Called in the same transaction as a successful vote/decision; never acknowledges later arrivals. */
  async acknowledgeItems(recipientUserId: string, itemIds: readonly string[], through: string) {
    const cutoff = new Date(Math.min(Date.parse(through), Date.now()));
    let legacyRead = 0;
    const members: Record<string, unknown>[] = [];
    for (const id of itemIds) {
      const [resource, groupId, field, userId] = JSON.parse(id) as string[];
      if (resource === "group" && field === "members") {
        // ponytail: stream historical notices; aggregate eligible IDs if bulk section reads become hot.
        const cursor = this.db
          .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
          .find(
            {
              recipientUserId,
              kind: { $in: ["group_membership_updated", "group_invitation_accepted"] },
              href: `/groups/${groupId}`,
              actorUserId: { $regex: "^[A-Za-z0-9_-]+$" },
              attentionItems: { $exists: false },
              readAt: { $exists: false },
              createdAt: { $lte: cutoff },
            },
            this.opts,
          )
          .project({ _id: 1, actorUserId: 1, createdAt: 1 });
        for await (const note of cursor) {
          const membership = await this.db
            .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
            .findOne({ groupId, userId: note.actorUserId, status: "ACCEPTED" }, this.opts);
          if (
            !membership?.updatedAt ||
            !Number.isFinite(Date.parse(membership.updatedAt)) ||
            new Date(membership.updatedAt) > note.createdAt
          )
            continue;
          const result = await this.db
            .collection(COLLECTIONS.NOTIFICATIONS)
            .updateOne(
              { _id: note._id, recipientUserId, readAt: { $exists: false } },
              { $set: { readAt: new Date() } },
              this.opts,
            );
          legacyRead += result.modifiedCount;
        }
      }
      if (resource !== "group" || field !== "member") continue;
      const membership = await this.db
        .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
        .findOne({ groupId, userId, status: "ACCEPTED" }, this.opts);
      if (!membership?.updatedAt || !Number.isFinite(Date.parse(membership.updatedAt))) continue;
      members.push({
        kind: { $in: ["group_membership_updated", "group_invitation_accepted"] },
        href: `/groups/${groupId}`,
        actorUserId: userId,
        attentionItems: { $exists: false },
        createdAt: { $gte: new Date(membership.updatedAt) },
      });
    }
    const invitations = itemIds.flatMap((id) => {
      const [resource, scope, field] = JSON.parse(id) as [string, string, string];
      if (field !== "invitation") return [];
      return [
        {
          kind:
            resource === "group" ? ("group_invitation" as const) : ("table_invitation" as const),
          href:
            resource === "group"
              ? `/groups/${scope}`
              : { $regex: `^/events/[0-9a-f-]{36}/tables/${scope}$`, $options: "i" },
          attentionItems: { $exists: false as const },
        },
      ];
    });
    const result = await this.db.collection<Notification>(COLLECTIONS.NOTIFICATIONS).updateMany(
      {
        recipientUserId,
        readAt: { $exists: false },
        createdAt: { $lte: cutoff },
        $or: [
          {
            attentionItems: {
              $elemMatch: {
                $or: [{ id: { $in: [...itemIds] } }, { sectionId: { $in: [...itemIds] } }],
                readAt: { $exists: false },
              },
            },
          },
          ...invitations,
          ...members,
        ],
      },
      [
        {
          $set: {
            attentionItems: {
              $map: {
                input: { $ifNull: ["$attentionItems", []] },
                as: "item",
                in: {
                  $cond: [
                    {
                      $and: [
                        {
                          $or: [
                            { $in: ["$$item.id", [...itemIds]] },
                            { $in: [{ $ifNull: ["$$item.sectionId", null] }, [...itemIds]] },
                          ],
                        },
                        {
                          $lte: [{ $ifNull: ["$$item.changedAt", "$createdAt"] }, cutoff],
                        },
                      ],
                    },
                    { $mergeObjects: ["$$item", { readAt: "$$NOW" }] },
                    "$$item",
                  ],
                },
              },
            },
          },
        },
        {
          $set: {
            readAt: {
              $cond: [
                {
                  $allElementsTrue: {
                    $map: {
                      input: "$attentionItems",
                      as: "item",
                      in: { $ne: [{ $ifNull: ["$$item.readAt", null] }, null] },
                    },
                  },
                },
                "$$NOW",
                "$$REMOVE",
              ],
            },
          },
        },
      ],
      this.opts,
    );
    return { ...result, modifiedCount: result.modifiedCount + legacyRead };
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

  deleteAll(recipientUserId: string) {
    return this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .deleteMany({ recipientUserId }, this.opts);
  }

  async deleteForUser(userId: string) {
    await this.db
      .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
      .deleteMany({ $or: [{ recipientUserId: userId }, { actorUserId: userId }] }, this.opts);
    await this.db.collection(COLLECTIONS.PUSH_SUBSCRIPTIONS).deleteMany({ userId }, this.opts);
  }
}
