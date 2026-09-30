import type {
  Notification,
  NotificationDto,
  NotificationKind,
  NotificationListResponse,
  User,
} from "@board-game-organizer/schemas";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

export type NotificationEvent =
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

export function notificationCopy(
  kind: NotificationKind,
  locale: "en" | "it",
  actorName: string,
  matchName?: string,
): { title: string; description: string; href: string } {
  if (locale === "it") {
    switch (kind) {
      case "friend_request":
        return {
          title: "Nuova richiesta di amicizia",
          description: `${actorName} ti ha inviato una richiesta di amicizia.`,
          href: "/contacts",
        };
      case "friend_request_accepted":
        return {
          title: "Richiesta di amicizia accettata",
          description: `${actorName} ha accettato la tua richiesta di amicizia.`,
          href: "/contacts",
        };
      case "group_invitation":
        return {
          title: "Nuovo invito a un gruppo",
          description: `${actorName} ti ha invitato al gruppo “${matchName}”.`,
          href: "/groups",
        };
      case "group_invitation_accepted":
        return {
          title: "Invito al gruppo accettato",
          description: `${actorName} ha accettato l'invito al gruppo “${matchName}”.`,
          href: "/groups",
        };
      case "match_invitation":
        return {
          title: "Nuovo invito a una partita",
          description: `${actorName} ti ha invitato alla partita “${matchName}”.`,
          href: "/matches",
        };
      case "match_invitation_accepted":
        return {
          title: "Invito alla partita accettato",
          description: `${actorName} ha accettato l'invito alla partita “${matchName}”.`,
          href: "/matches",
        };
      case "match_invitation_declined":
        return {
          title: "Invito alla partita rifiutato",
          description: `${actorName} ha rifiutato l'invito alla partita “${matchName}”.`,
          href: "/matches",
        };
      case "match_created":
        return {
          title: "Partita confermata",
          description: `La partita “${matchName}” è stata confermata.`,
          href: "/matches",
        };
      case "match_replanning":
        return {
          title: "Partita di nuovo in pianificazione",
          description: `La partita “${matchName}” è tornata in pianificazione.`,
          href: "/matches",
        };
      case "match_terminated":
        return {
          title: "Partita terminata",
          description: `La partita “${matchName}” è terminata.`,
          href: "/matches",
        };
      case "match_updated":
        return {
          title: "Partita aggiornata",
          description: `La partita “${matchName}” è stata aggiornata.`,
          href: "/matches",
        };
    }
  }

  switch (kind) {
    case "friend_request":
      return {
        title: "New friend request",
        description: `${actorName} sent you a friend request.`,
        href: "/contacts",
      };
    case "friend_request_accepted":
      return {
        title: "Friend request accepted",
        description: `${actorName} accepted your friend request.`,
        href: "/contacts",
      };
    case "group_invitation":
      return {
        title: "New group invitation",
        description: `${actorName} invited you to the group “${matchName}”.`,
        href: "/groups",
      };
    case "group_invitation_accepted":
      return {
        title: "Group invitation accepted",
        description: `${actorName} accepted the invitation to the group “${matchName}”.`,
        href: "/groups",
      };
    case "match_invitation":
      return {
        title: "New match invitation",
        description: `${actorName} invited you to “${matchName}”.`,
        href: "/matches",
      };
    case "match_invitation_accepted":
      return {
        title: "Match invitation accepted",
        description: `${actorName} accepted the invitation to “${matchName}”.`,
        href: "/matches",
      };
    case "match_invitation_declined":
      return {
        title: "Match invitation declined",
        description: `${actorName} declined the invitation to “${matchName}”.`,
        href: "/matches",
      };
    case "match_created":
      return {
        title: "Match confirmed",
        description: `“${matchName}” was confirmed.`,
        href: "/matches",
      };
    case "match_replanning":
      return {
        title: "Match back in planning",
        description: `“${matchName}” is back in planning.`,
        href: "/matches",
      };
    case "match_terminated":
      return {
        title: "Match finished",
        description: `“${matchName}” has finished.`,
        href: "/matches",
      };
    case "match_updated":
      return {
        title: "Match updated",
        description: `“${matchName}” was updated.`,
        href: "/matches",
      };
  }
}

function toDto(notification: Notification): NotificationDto {
  return {
    id: notification._id.toHexString(),
    kind: notification.kind,
    title: notification.title,
    description: notification.description,
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
      return [
        {
          recipientUserId: event.recipientUserId,
          actorUserId: event.actorUserId,
          kind: event.kind,
          ...notificationCopy(
            event.kind,
            recipient.preferredLanguage,
            actor.name,
            "matchName" in event
              ? event.matchName
              : "groupName" in event
                ? event.groupName
                : undefined,
          ),
          ...("matchId" in event
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
      notifications: notifications.map(toDto),
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
