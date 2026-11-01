/** biome-ignore-all lint/suspicious/noThenProperty: MongoDB $switch requires literal then data fields, not Promise methods. */
import type {
  NotificationAttentionCount,
  NotificationAttentionReference,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
  ReadNotificationAttentionInput,
} from "@board-game-organizer/schemas";
import { attentionKey, emptyAttentionSummary } from "@board-game-organizer/shared";
import { type ClientSession, type Db, type Document, ObjectId } from "mongodb";
import { COLLECTIONS } from "../db";
import { EventRecordsRepository } from "../events/event-records.repository";
import { GroupRecordsRepository } from "../groups/group-records.repository";
import { itemFacet, remainingItemTableIds } from "./notification-item-pipeline";
import { NotificationsRepository } from "./notifications.repository";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const social = ["friend_request", "friend_request_accepted", "follow"];
const eventKinds = { $regex: "^(event_|table_)" };
const groupKinds = { $regex: "^group_" };
const pathMatch = (regex: string) => ({
  $regexFind: { input: { $ifNull: ["$href", ""] }, regex, options: "i" },
});
const capture = (field: string, index: number) => ({ $arrayElemAt: [`$${field}.captures`, index] });

/** Own notification metadata only. Aggregation stays at source; responses contain at most 50 targets. */
export class NotificationAttentionRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}
  private get opts() {
    return this.session ? { session: this.session } : {};
  }
  private routing(userId: string, now: string, moderator: boolean): Document[] {
    return [
      {
        $set: {
          _tablePath: pathMatch(`^/events/(${uuid})/tables/(${uuid})$`),
          _eventPath: pathMatch(`^/events/(${uuid})$`),
          _groupPath: pathMatch(`^/(?:groups|moderation)/(${uuid})$`),
        },
      },
      {
        $set: {
          _kind: {
            $switch: {
              branches: [
                { case: { $in: ["$kind", social] }, then: "contact" },
                {
                  case: {
                    $and: [
                      { $regexMatch: { input: "$kind", regex: "^(event_|table_)" } },
                      { $ne: ["$_tablePath", null] },
                    ],
                  },
                  then: "table",
                },
                {
                  case: {
                    $and: [
                      { $regexMatch: { input: "$kind", regex: "^(event_|table_)" } },
                      { $ne: ["$_eventPath", null] },
                    ],
                  },
                  then: "event",
                },
                {
                  case: {
                    $and: [
                      { $regexMatch: { input: "$kind", regex: "^group_" } },
                      { $ne: ["$_groupPath", null] },
                    ],
                  },
                  then: "group",
                },
              ],
              default: null,
            },
          },
          _eventId: { $ifNull: [capture("_tablePath", 0), capture("_eventPath", 0)] },
          _groupId: capture("_groupPath", 0),
          _section: {
            $cond: [
              { $eq: ["$kind", "friend_request"] },
              "requests",
              {
                $cond: [
                  { $in: ["$kind", ["follow", "friend_request_accepted"]] },
                  "connections",
                  null,
                ],
              },
            ],
          },
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.EVENTS,
          localField: "_eventId",
          foreignField: "id",
          pipeline: [
            { $match: { status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } } },
            ...new EventRecordsRepository(this.db, this.session).visibleGroups(userId, now),
            {
              $lookup: {
                from: COLLECTIONS.TABLE_REGISTRATIONS,
                localField: "id",
                foreignField: "eventId",
                pipeline: [
                  { $match: { userId, status: { $in: ["PENDING", "ACCEPTED"] } } },
                  { $limit: 1 },
                ],
                as: "attentionRegistration",
              },
            },
            {
              $match: {
                $or: [
                  { groupId: { $ne: null } },
                  { adminUserId: userId },
                  { "attentionRegistration.0": { $exists: true } },
                ],
              },
            },
            {
              $lookup: {
                from: COLLECTIONS.EVENT_TABLES,
                localField: "id",
                foreignField: "eventId",
                pipeline: [
                  { $match: { removedAt: { $exists: false } } },
                  { $limit: 20 },
                  { $project: { _id: 0, id: 1 } },
                ],
                as: "attentionTables",
              },
            },
            { $project: { _id: 0, groupId: 1, tableIds: "$attentionTables.id" } },
          ],
          as: "_event",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.EVENT_TABLES,
          let: { table: capture("_tablePath", 1), event: "$_eventId" },
          pipeline: [
            {
              $match: {
                removedAt: { $exists: false },
                $expr: { $and: [{ $eq: ["$id", "$$table"] }, { $eq: ["$eventId", "$$event"] }] },
              },
            },
            { $limit: 1 },
            { $project: { _id: 0, id: 1 } },
          ],
          as: "_table",
        },
      },
      { $set: { _groupId: { $ifNull: ["$_groupId", { $arrayElemAt: ["$_event.groupId", 0] }] } } },
      {
        $lookup: {
          from: COLLECTIONS.GROUPS,
          localField: "_groupId",
          foreignField: "id",
          pipeline: [
            ...new GroupRecordsRepository(this.db, this.session).readableStages(
              userId,
              now,
              moderator,
            ),
            { $project: { _id: 0, id: 1 } },
          ],
          as: "_group",
        },
      },
      {
        $set: {
          _eventId: { $cond: [{ $gt: [{ $size: "$_event" }, 0] }, "$_eventId", null] },
          _groupId: { $ifNull: [{ $arrayElemAt: ["$_group.id", 0] }, null] },
          _idTarget: {
            $switch: {
              branches: [
                { case: { $eq: ["$_kind", "contact"] }, then: "$actorUserId" },
                { case: { $eq: ["$_kind", "table"] }, then: capture("_tablePath", 1) },
                { case: { $eq: ["$_kind", "event"] }, then: capture("_eventPath", 0) },
                { case: { $eq: ["$_kind", "group"] }, then: capture("_groupPath", 0) },
              ],
              default: null,
            },
          },
        },
      },
      {
        $set: {
          _kind: {
            $cond: [
              {
                $or: [
                  { $eq: ["$_kind", "contact"] },
                  { $and: [{ $eq: ["$_kind", "group"] }, { $ne: ["$_groupId", null] }] },
                  { $and: [{ $eq: ["$_kind", "event"] }, { $ne: ["$_eventId", null] }] },
                  {
                    $and: [
                      { $eq: ["$_kind", "table"] },
                      { $ne: ["$_eventId", null] },
                      { $gt: [{ $size: "$_table" }, 0] },
                    ],
                  },
                ],
              },
              "$_kind",
              null,
            ],
          },
        },
      },
      {
        $set: {
          _items: {
            $filter: {
              input: {
                $ifNull: [
                  "$attentionItems",
                  {
                    $cond: [
                      { $in: ["$kind", ["group_invitation", "table_invitation"]] },
                      [
                        {
                          id: {
                            $concat: ['["', "$_kind", '","', "$_idTarget", '","invitation",null]'],
                          },
                          tableIds: { $cond: [{ $eq: ["$_kind", "table"] }, ["$_idTarget"], []] },
                        },
                      ],
                      [],
                    ],
                  },
                ],
              },
              as: "item",
              cond: {
                $and: [
                  { $eq: [{ $ifNull: ["$$item.readAt", null] }, null] },
                  { $lte: [{ $ifNull: ["$$item.changedAt", "$createdAt"] }, new Date(now)] },
                ],
              },
            },
          },
        },
      },
      {
        $set: {
          _tableIds: {
            $cond: [
              { $eq: ["$_kind", null] },
              [],
              {
                $setIntersection: [
                  {
                    $cond: [
                      { $gt: [{ $size: "$_items" }, 0] },
                      remainingItemTableIds,
                      {
                        $cond: [
                          { $eq: ["$_kind", "table"] },
                          ["$_idTarget"],
                          { $ifNull: [{ $arrayElemAt: ["$_event.tableIds", 0] }, []] },
                        ],
                      },
                    ],
                  },
                  { $ifNull: [{ $arrayElemAt: ["$_event.tableIds", 0] }, []] },
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          _eventId: { $cond: [{ $in: ["$_kind", ["event", "table"]] }, "$_eventId", null] },
          _groupId: {
            $cond: [{ $in: ["$_kind", ["group", "event", "table"]] }, "$_groupId", null],
          },
        },
      },
    ];
  }
  private matches(target: NotificationAttentionTarget): Document {
    if (target.kind === "item")
      return {
        $or: [{ "_items.id": target.id }, { "_items.sectionId": target.id }],
        _kind: { $ne: null },
      };
    if (target.kind === "table") return { _tableIds: target.id };
    if (target.kind === "contacts") return { _section: target.id };
    if (target.kind === "event") return { _eventId: target.id };
    if (target.kind === "group") return { _groupId: target.id };
    return { _kind: target.kind, _idTarget: target.id };
  }
  async snapshot(
    userId: string,
    targets: readonly NotificationAttentionTarget[] = [],
    notificationIds: readonly string[] = [],
  ) {
    const asOf = new Date().toISOString();
    const actor = await this.db
      .collection(COLLECTIONS.USERS)
      .findOne({ clerkId: userId }, { ...this.opts, projection: { _id: 0, bgoRole: 1 } });
    const sum = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });
    const facet: Document = {
      summary: [
        {
          $group: {
            _id: null,
            inbox: { $sum: 1 },
            tables: sum({ $gt: [{ $size: "$_tableIds" }, 0] }),
            events: sum({ $ne: ["$_eventId", null] }),
            groups: sum({ $ne: ["$_groupId", null] }),
            contacts: sum({ $eq: ["$_kind", "contact"] }),
            requests: sum({ $eq: ["$_section", "requests"] }),
            connections: sum({ $eq: ["$_section", "connections"] }),
          },
        },
      ],
      notifications: notificationIds.length
        ? [
            {
              $match: {
                _id: { $in: notificationIds.map((id) => new ObjectId(id)) },
                _kind: { $ne: null },
              },
            },
            {
              $project: {
                _id: 1,
                kind: "$_kind",
                id: "$_idTarget",
                eventId: "$_eventId",
                groupId: "$_groupId",
                section: "$_section",
                tableIds: "$_tableIds",
              },
            },
          ]
        : [{ $match: { _id: { $in: [] } } }],
    };
    targets.forEach((target, i) => {
      if (target.kind === "item") {
        const item = itemFacet(target.id);
        facet[`t${i}`] = item.total;
        facet[`e${i}`] = item.effects;
        return;
      }
      facet[`t${i}`] = [
        { $match: this.matches(target) },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            direct: sum(
              target.kind === "contacts"
                ? { $eq: ["$_section", target.id] }
                : {
                    $and: [
                      { $eq: ["$_kind", target.kind] },
                      { $eq: ["$_idTarget", target.id] },
                      { $eq: [{ $size: "$_items" }, 0] },
                      { $eq: [{ $type: "$attentionItems" }, "missing"] },
                    ],
                  },
            ),
            events: sum({ $ne: ["$_eventId", null] }),
            requests: sum({ $eq: ["$_section", "requests"] }),
            connections: sum({ $eq: ["$_section", "connections"] }),
            eventId: { $first: "$_eventId" },
            groupId: { $first: "$_groupId" },
            tableIds: { $addToSet: "$_tableIds" },
          },
        },
      ];
    });
    const [result] = await this.db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .aggregate<Document>(
        [
          {
            $match: {
              recipientUserId: userId,
              readAt: { $exists: false },
              createdAt: { $lte: new Date(asOf) },
            },
          },
          ...this.routing(userId, asOf, actor?.bgoRole === "ADMIN"),
          { $facet: facet },
        ],
        this.opts,
      )
      .toArray();
    const summary = result?.summary?.[0];
    const snapshot: NotificationAttentionSnapshot = {
      asOf,
      unreadCount: summary?.inbox ?? 0,
      summary: summary
        ? {
            tables: summary.tables,
            events: summary.events,
            groups: summary.groups,
            contacts: summary.contacts,
            sections: { connections: summary.connections, requests: summary.requests, search: 0 },
          }
        : emptyAttentionSummary(),
      targets: targets.map((target, i): NotificationAttentionCount => {
        const entry = result?.[`t${i}`]?.[0];
        if (target.kind === "item") {
          const row = entry;
          return {
            target,
            count: row?.count ?? 0,
            direct: row?.count ?? 0,
            events: 0,
            sections: { connections: 0, requests: 0, search: 0 },
            ...(row?.eventId ? { eventId: row.eventId } : {}),
            ...(row?.groupId ? { groupId: row.groupId } : {}),
            readEffect: {
              unread: row?.unread ?? 0,
              summary: {
                ...emptyAttentionSummary(),
                tables: row?.tables ?? 0,
                events: row?.eventId ? row.unread : 0,
                groups: row?.groupId ? row.unread : 0,
              },
              targets: (result?.[`e${i}`] ?? []).map((value: Document) => ({
                target: value._id,
                count: value.count,
                direct: value._id.kind === "item" ? value.count : 0,
                events: value._id.kind === "group" && row?.eventId ? value.count : 0,
              })),
            },
          };
        }
        const row = entry;
        return {
          target,
          count: row?.count ?? 0,
          direct: row?.direct ?? 0,
          events: row?.events ?? 0,
          sections: { connections: row?.connections ?? 0, requests: row?.requests ?? 0, search: 0 },
          ...(row?.eventId ? { eventId: row.eventId } : {}),
          ...(row?.groupId ? { groupId: row.groupId } : {}),
          ...(target.kind === "event" && row?.tableIds
            ? { tableIds: [...new Set<string>(row.tableIds.flat())] }
            : {}),
        };
      }),
    };
    const references = new Map<string, NotificationAttentionReference>();
    for (const row of result?.notifications ?? [])
      references.set(String(row._id), {
        target: { kind: row.kind, id: row.id },
        ...(row.eventId ? { eventId: row.eventId } : {}),
        ...(row.groupId ? { groupId: row.groupId } : {}),
        ...(row.section ? { section: row.section } : {}),
        ...(row.tableIds?.length ? { tableIds: row.tableIds } : {}),
      });
    return { snapshot, references };
  }
  async read(userId: string, input: ReadNotificationAttentionInput) {
    const { target } = input;
    const before = await this.snapshot(userId, [target]);
    const row = before.snapshot.targets[0];
    const affected = [target];
    if (target.kind === "table" && row.eventId) affected.push({ kind: "event", id: row.eventId });
    if ((target.kind === "table" || target.kind === "event") && row.groupId)
      affected.push({ kind: "group", id: row.groupId });
    const filter: Document = {
      recipientUserId: userId,
      readAt: { $exists: false },
      createdAt: { $lte: new Date(Math.min(Date.parse(input.through), Date.now())) },
    };
    if (target.kind === "contacts")
      filter.kind =
        target.id === "requests"
          ? "friend_request"
          : target.id === "connections"
            ? { $in: ["follow", "friend_request_accepted"] }
            : { $in: [] };
    else if (target.kind === "group")
      Object.assign(filter, {
        kind: groupKinds,
        href: { $in: [`/groups/${target.id}`, `/moderation/${target.id}`] },
      });
    else if (target.kind === "event")
      Object.assign(filter, { kind: eventKinds, href: `/events/${target.id}` });
    else if (target.kind === "table")
      Object.assign(filter, {
        kind: eventKinds,
        href: { $regex: `^/events/${uuid}/tables/${target.id}$`, $options: "i" },
      });
    else if (target.kind !== "item") throw new Error("Invalid read target");
    // Resource entry reads must not consume structured item attention or pending invitations.
    const result =
      target.kind === "item"
        ? await new NotificationsRepository(this.db, this.session).acknowledgeItems(
            userId,
            [target.id],
            input.through,
          )
        : await this.db.collection(COLLECTIONS.NOTIFICATIONS).updateMany(
            {
              ...filter,
              attentionItems: { $exists: false },
              ...(target.kind === "contacts"
                ? {}
                : {
                    $and: [
                      { kind: filter.kind },
                      { kind: { $nin: ["table_invitation", "group_invitation"] } },
                    ],
                  }),
            },
            { $set: { readAt: new Date() } },
            this.opts,
          );
    return {
      updated: result.modifiedCount,
      snapshot: (
        await this.snapshot(userId, [
          ...new Map(affected.map((value) => [attentionKey(value), value])).values(),
        ])
      ).snapshot,
    };
  }
}
