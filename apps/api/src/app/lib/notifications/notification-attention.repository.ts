/** biome-ignore-all lint/suspicious/noThenProperty: MongoDB $switch requires literal then data fields, not Promise methods. */
import type {
  NotificationAttentionCount,
  NotificationAttentionReference,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
  ReadNotificationAttentionInput,
} from "@board-game-organizer/schemas";
import {
  attentionKey,
  emptyAttentionSummary,
  notificationParticipationKinds,
} from "@board-game-organizer/shared";
import { type ClientSession, type Db, type Document, ObjectId } from "mongodb";
import { COLLECTIONS } from "../db";
import { availableEventExpression, managedEventExpression } from "../events/event-list-eligibility";
import { EventRecordsRepository } from "../events/event-records.repository";
import { GroupRecordsRepository } from "../groups/group-records.repository";
import { itemFacet, itemOwnerIds, ownerListTargets } from "./notification-item-pipeline";
import { notificationSupersessionPipeline } from "./notification-supersession";
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
  private routing(userId: string, now: string, moderator: boolean, sourceAt = now): Document[] {
    return [
      ...notificationSupersessionPipeline(sourceAt),
      { $match: { readAt: { $exists: false } } },
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
            ...new EventRecordsRepository(this.db, this.session).participationStages(userId),
            {
              $match: {
                $or: [
                  { groupId: { $ne: null } },
                  { adminUserId: userId },
                  { "myRegistration.0": { $exists: true } },
                  { "myDemonstration.0": { $exists: true } },
                ],
              },
            },
            {
              $lookup: {
                from: COLLECTIONS.EVENT_TABLES,
                localField: "id",
                foreignField: "eventId",
                let: { personalAccessOnly: "$personalAccessOnly", eventStatus: "$status" },
                pipeline: [
                  {
                    $match: {
                      removedAt: { $exists: false },
                      $expr: {
                        $or: [
                          { $ne: ["$$personalAccessOnly", true] },
                          {
                            $and: [
                              { $ne: [{ $ifNull: ["$confirmed", null] }, null] },
                              {
                                $or: [
                                  { $in: [userId, { $ifNull: ["$confirmed.playerIds", []] }] },
                                  { $eq: ["$demonstratorUserId", userId] },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  { $limit: 20 },
                  {
                    $project: {
                      _id: 0,
                      id: 1,
                      personal: {
                        $and: [
                          { $in: ["$$eventStatus", ["CONFIRMED", "TERMINATED"]] },
                          { $in: [userId, { $ifNull: ["$confirmed.playerIds", []] }] },
                        ],
                      },
                    },
                  },
                ],
                as: "attentionTables",
              },
            },
            {
              $project: {
                _id: 0,
                personalAccessOnly: 1,
                groupId: { $cond: ["$personalAccessOnly", null, "$groupId"] },
                tableIds: "$attentionTables.id",
                personalTableIds: {
                  $map: {
                    input: { $filter: { input: "$attentionTables", cond: "$$this.personal" } },
                    as: "table",
                    in: "$$table.id",
                  },
                },
                lists: {
                  $concatArrays: [
                    {
                      $cond: [
                        {
                          $or: [
                            "$personalAccessOnly",
                            managedEventExpression(userId),
                            { $gt: [{ $size: "$myRegistration" }, 0] },
                            { $gt: [{ $size: "$myDemonstration" }, 0] },
                          ],
                        },
                        [{ kind: "event-list", id: "mine" }],
                        {
                          $cond: [
                            availableEventExpression(userId, new Date(now)),
                            [{ kind: "event-list", id: "available" }],
                            [],
                          ],
                        },
                      ],
                    },
                    {
                      $cond: [
                        {
                          $and: [
                            { $ne: ["$personalAccessOnly", true] },
                            { $ne: [{ $ifNull: ["$groupId", null] }, null] },
                          ],
                        },
                        [{ kind: "event-list", id: "$groupId" }],
                        [],
                      ],
                    },
                  ],
                },
              },
            },
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
            {
              $project: {
                _id: 0,
                id: 1,
                lists: {
                  $cond: [
                    { $eq: [{ $size: "$readBan" }, 0] },
                    {
                      $concatArrays: [
                        {
                          $cond: [
                            {
                              $or: [
                                { $eq: ["$adminUserId", userId] },
                                { $gt: [{ $size: "$readMembership" }, 0] },
                              ],
                            },
                            [{ kind: "group-list", id: "$type" }],
                            [],
                          ],
                        },
                        {
                          $cond: [
                            {
                              $and: [
                                { $eq: ["$type", "PUBLIC"] },
                                { $ne: [{ $type: "$approved" }, "missing"] },
                              ],
                            },
                            [{ kind: "group-list", id: "search" }],
                            [],
                          ],
                        },
                      ],
                    },
                    [],
                  ],
                },
                memberReadable: {
                  $and: [
                    { $eq: [{ $size: "$readBan" }, 0] },
                    {
                      $or: [
                        { $eq: ["$adminUserId", userId] },
                        { $eq: [{ $arrayElemAt: ["$readMembership.status", 0] }, "ACCEPTED"] },
                      ],
                    },
                  ],
                },
              },
            },
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
                  {
                    $and: [
                      { $eq: ["$_kind", "group"] },
                      { $ne: ["$_groupId", null] },
                      {
                        $or: [
                          { $eq: [{ $arrayElemAt: ["$_group.memberReadable", 0] }, true] },
                          {
                            $not: [
                              {
                                $anyElementTrue: [
                                  {
                                    $map: {
                                      input: { $ifNull: ["$attentionItems", []] },
                                      as: "item",
                                      in: {
                                        $regexMatch: {
                                          input: "$$item.id",
                                          regex: '^\\[\\s*"group"\\s*,[^,]+,\\s*"members?"\\s*,',
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    $and: [
                      { $eq: ["$_kind", "event"] },
                      { $ne: ["$_eventId", null] },
                      {
                        $not: [
                          {
                            $and: [
                              { $eq: [{ $arrayElemAt: ["$_event.personalAccessOnly", 0] }, true] },
                              { $in: ["$kind", notificationParticipationKinds] },
                              { $eq: [{ $type: "$attentionItems" }, "missing"] },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    $and: [
                      { $eq: ["$_kind", "table"] },
                      { $ne: ["$_eventId", null] },
                      { $gt: [{ $size: "$_table" }, 0] },
                      {
                        $or: [
                          { $ne: [{ $arrayElemAt: ["$_event.personalAccessOnly", 0] }, true] },
                          {
                            $in: [
                              "$_idTarget",
                              { $ifNull: [{ $arrayElemAt: ["$_event.tableIds", 0] }, []] },
                            ],
                          },
                        ],
                      },
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
        $lookup: {
          from: COLLECTIONS.GROUP_MEMBERSHIPS,
          localField: "actorUserId",
          foreignField: "userId",
          let: { group: "$_groupId", notifiedAt: "$createdAt" },
          pipeline: [
            {
              $match: {
                status: "ACCEPTED",
                $expr: {
                  $and: [
                    { $eq: ["$groupId", "$$group"] },
                    {
                      $ne: [
                        {
                          $convert: {
                            input: "$updatedAt",
                            to: "date",
                            onError: null,
                            onNull: null,
                          },
                        },
                        null,
                      ],
                    },
                    {
                      $lte: [
                        {
                          $convert: {
                            input: "$updatedAt",
                            to: "date",
                            onError: null,
                            onNull: null,
                          },
                        },
                        "$$notifiedAt",
                      ],
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { version: 1 } },
          ],
          as: "_member",
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
                      {
                        $and: [
                          { $eq: ["$_kind", "group"] },
                          { $eq: [{ $arrayElemAt: ["$_group.memberReadable", 0] }, true] },
                          {
                            $in: [
                              "$kind",
                              ["group_membership_updated", "group_invitation_accepted"],
                            ],
                          },
                          { $gt: [{ $size: "$_member" }, 0] },
                          {
                            $regexMatch: {
                              input: { $ifNull: ["$actorUserId", ""] },
                              regex: "^[A-Za-z0-9_-]+$",
                            },
                          },
                        ],
                      },
                      [
                        {
                          id: {
                            $concat: [
                              '["group","',
                              "$_groupId",
                              '","member","',
                              "$actorUserId",
                              '"]',
                            ],
                          },
                          sectionId: { $concat: ['["group","', "$_groupId", '","members",null]'] },
                          revision: { $arrayElemAt: ["$_member.version", 0] },
                        },
                      ],
                      {
                        $cond: [
                          { $in: ["$kind", ["group_invitation", "table_invitation"]] },
                          [
                            {
                              id: {
                                $concat: [
                                  '["',
                                  "$_kind",
                                  '","',
                                  "$_idTarget",
                                  '","invitation",null]',
                                ],
                              },
                              tableIds: {
                                $cond: [{ $eq: ["$_kind", "table"] }, ["$_idTarget"], []],
                              },
                            },
                          ],
                          [],
                        ],
                      },
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
          _unscopedItems: "$_items",
          _items: {
            $cond: [
              { $eq: [{ $arrayElemAt: ["$_event.personalAccessOnly", 0] }, true] },
              {
                $filter: {
                  input: "$_items",
                  as: "item",
                  cond: {
                    $let: {
                      vars: { candidate: ["$$item"] },
                      in: {
                        $let: {
                          vars: {
                            tables: itemOwnerIds("$$candidate", "table"),
                            events: itemOwnerIds("$$candidate", "event"),
                            groups: itemOwnerIds("$$candidate", "group"),
                          },
                          in: {
                            $and: [
                              { $eq: [{ $size: "$$groups" }, 0] },
                              { $setIsSubset: ["$$events", ["$_eventId"]] },
                              {
                                $setIsSubset: [
                                  "$$tables",
                                  { $ifNull: [{ $arrayElemAt: ["$_event.tableIds", 0] }, []] },
                                ],
                              },
                              {
                                $gt: [{ $add: [{ $size: "$$events" }, { $size: "$$tables" }] }, 0],
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
              "$_items",
            ],
          },
        },
      },
      {
        $set: {
          _kind: {
            $cond: [
              {
                $and: [
                  { $eq: [{ $arrayElemAt: ["$_event.personalAccessOnly", 0] }, true] },
                  { $ne: [{ $type: "$attentionItems" }, "missing"] },
                  { $eq: [{ $size: "$_items" }, 0] },
                ],
              },
              null,
              "$_kind",
            ],
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
                      itemOwnerIds("$_items", "table"),
                      {
                        $cond: [{ $eq: ["$_kind", "table"] }, ["$_idTarget"], []],
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
          _ownerEvents: {
            $cond: [
              { $and: [{ $ne: ["$_kind", null] }, { $gt: [{ $size: "$_items" }, 0] }] },
              { $setIntersection: [itemOwnerIds("$_items", "event"), ["$_eventId"]] },
              { $cond: [{ $eq: ["$_kind", "event"] }, ["$_eventId"], []] },
            ],
          },
          _ownerGroups: {
            $cond: [
              { $and: [{ $ne: ["$_kind", null] }, { $gt: [{ $size: "$_items" }, 0] }] },
              { $setIntersection: [itemOwnerIds("$_items", "group"), ["$_groupId"]] },
              { $cond: [{ $eq: ["$_kind", "group"] }, ["$_groupId"], []] },
            ],
          },
        },
      },
      { $set: { _lists: ownerListTargets("$_ownerEvents", "$_ownerGroups") } },
    ];
  }
  /** Shared recipient/current-source authorization for bounded notification-domain projections. */
  async authorizedSource(
    userId: string,
    asOf: string,
    filter: Document = {},
    eligibilityAt = new Date().toISOString(),
  ) {
    const actor = await this.db
      .collection(COLLECTIONS.USERS)
      .findOne({ clerkId: userId }, this.opts);
    return [
      {
        $match: {
          recipientUserId: userId,
          readAt: { $exists: false },
          createdAt: { $lte: new Date(asOf) },
          ...filter,
        },
      },
      ...this.routing(userId, eligibilityAt, actor?.bgoRole === "ADMIN", asOf),
    ];
  }
  sourceMatches(target: NotificationAttentionTarget) {
    return this.matches(target);
  }
  private matches(target: NotificationAttentionTarget): Document {
    if (target.kind === "event-list" || target.kind === "group-list")
      return { _lists: { $elemMatch: target } };
    if (target.kind === "item")
      return {
        $or: [{ "_items.id": target.id }, { "_items.sectionId": target.id }],
        _kind: { $ne: null },
      };
    if (target.kind === "table") return { _tableIds: target.id };
    if (target.kind === "contacts") return { _section: target.id };
    if (target.kind === "event") return { _ownerEvents: target.id };
    if (target.kind === "group") return { _ownerGroups: target.id };
    return { _kind: target.kind, _idTarget: target.id };
  }
  async snapshot(
    userId: string,
    targets: readonly NotificationAttentionTarget[] = [],
    notificationIds: readonly string[] = [],
    asOf = new Date().toISOString(),
  ) {
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
            tables: sum({
              $gt: [
                {
                  $size: {
                    $setIntersection: [
                      "$_tableIds",
                      { $ifNull: [{ $arrayElemAt: ["$_event.personalTableIds", 0] }, []] },
                    ],
                  },
                },
                0,
              ],
            }),
            events: sum({ $gt: [{ $size: "$_ownerEvents" }, 0] }),
            groups: sum({ $gt: [{ $size: "$_ownerGroups" }, 0] }),
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
                itemIds: {
                  $setDifference: [{ $setUnion: ["$_items.id", "$_items.sectionId"] }, [null]],
                },
                lists: "$_lists",
                personalAccessOnly: { $arrayElemAt: ["$_event.personalAccessOnly", 0] },
                containers: {
                  $concatArrays: [
                    { $map: { input: "$_tableIds", as: "id", in: { kind: "table", id: "$$id" } } },
                    {
                      $map: { input: "$_ownerEvents", as: "id", in: { kind: "event", id: "$$id" } },
                    },
                    {
                      $map: { input: "$_ownerGroups", as: "id", in: { kind: "group", id: "$$id" } },
                    },
                  ],
                },
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
                      {
                        $not: [
                          {
                            $in: [
                              "$kind",
                              [
                                "group_membership_requested",
                                "group_review_requested",
                                "event_agreement_ready",
                                "event_proposal_created",
                              ],
                            ],
                          },
                        ],
                      },
                      { $eq: ["$_idTarget", target.id] },
                      { $eq: [{ $size: "$_items" }, 0] },
                      { $eq: [{ $type: "$attentionItems" }, "missing"] },
                    ],
                  },
            ),
            events: { $sum: 0 },
            requests: sum({ $eq: ["$_section", "requests"] }),
            connections: sum({ $eq: ["$_section", "connections"] }),
            eventId: { $first: "$_eventId" },
            groupId: { $first: "$_groupId" },
            tableIds: { $addToSet: "$_tableIds" },
            ...(target.kind === "event" || target.kind === "group"
              ? {
                  lists: {
                    $addToSet: {
                      $filter: {
                        input: "$_lists",
                        as: "scope",
                        cond: { $eq: ["$$scope.kind", `${target.kind}-list`] },
                      },
                    },
                  },
                }
              : {}),
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
            ...(row?.signal ? { signal: row.signal } : {}),
            events: 0,
            sections: { connections: 0, requests: 0, search: 0 },
            ...(row?.eventId ? { eventId: row.eventId } : {}),
            ...(row?.groupId ? { groupId: row.groupId } : {}),
            readEffect: {
              unread: row?.unread ?? 0,
              summary: {
                ...emptyAttentionSummary(),
                tables: row?.tables ?? 0,
                events: row?.events ?? 0,
                groups: row?.groups ?? 0,
              },
              targets: (result?.[`e${i}`] ?? []).map((value: Document) => ({
                target: value._id,
                count: value.count,
                direct: value._id.kind === "item" ? value.count : 0,
                events: 0,
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
          ...(row?.lists?.length
            ? {
                lists: [
                  ...new Map<string, NonNullable<NotificationAttentionReference["lists"]>[number]>(
                    row.lists
                      .flat()
                      .map((list: NonNullable<NotificationAttentionReference["lists"]>[number]) => [
                        attentionKey(list),
                        list,
                      ]),
                  ).values(),
                ],
              }
            : {}),
          ...(target.kind === "event" && row?.tableIds
            ? { tableIds: [...new Set<string>(row.tableIds.flat())] }
            : {}),
        };
      }),
    };
    const references = new Map<string, NotificationAttentionReference>();
    const personalNotificationIds = new Set<string>();
    for (const row of result?.notifications ?? []) {
      if (row.personalAccessOnly) personalNotificationIds.add(String(row._id));
      references.set(String(row._id), {
        target: { kind: row.kind, id: row.id },
        ...(row.eventId ? { eventId: row.eventId } : {}),
        ...(row.groupId ? { groupId: row.groupId } : {}),
        ...(row.section ? { section: row.section } : {}),
        ...(row.tableIds?.length ? { tableIds: row.tableIds } : {}),
        ...(row.itemIds?.length ? { itemIds: row.itemIds } : {}),
        containers: row.containers,
        ...(row.lists?.length ? { lists: row.lists } : {}),
      });
    }
    return { snapshot, references, personalNotificationIds };
  }
  /** Bounded IDs only: generic entry must never consume a derived historical member point. */
  private async readDirect(userId: string, target: NotificationAttentionTarget, filter: Document) {
    const actor = await this.db
      .collection(COLLECTIONS.USERS)
      .findOne({ clerkId: userId }, this.opts);
    let modifiedCount = 0;
    while (true) {
      const ids = await this.db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .aggregate<{ _id: ObjectId }>(
          [
            { $match: filter },
            ...this.routing(userId, new Date().toISOString(), actor?.bgoRole === "ADMIN"),
            {
              $match: {
                ...this.matches(target),
                attentionItems: { $exists: false },
                _items: { $size: 0 },
                kind: {
                  $nin: [
                    "group_membership_requested",
                    "group_review_requested",
                    "event_agreement_ready",
                    "event_proposal_created",
                  ],
                },
              },
            },
            { $limit: 100 },
            { $project: { _id: 1 } },
          ],
          this.opts,
        )
        .toArray();
      if (!ids.length) return { modifiedCount };
      const result = await this.db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .updateMany(
          { ...filter, _id: { $in: ids.map((row) => row._id) } },
          { $set: { readAt: new Date() } },
          this.opts,
        );
      modifiedCount += result.modifiedCount;
    }
  }
  async read(userId: string, input: ReadNotificationAttentionInput) {
    const { target } = input;
    const before = await this.snapshot(userId, [target]);
    const row = before.snapshot.targets[0];
    const affected: NotificationAttentionTarget[] = [target, ...(row.lists ?? [])];
    if (target.kind === "item")
      for (const effect of row.readEffect?.targets ?? [])
        if (!affected.some((value) => attentionKey(value) === attentionKey(effect.target)))
          affected.push(effect.target);
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
    const result = !row.direct
      ? { modifiedCount: 0 }
      : target.kind === "item"
        ? await new NotificationsRepository(this.db, this.session).acknowledgeItems(
            userId,
            [target.id],
            input.through,
          )
        : await this.readDirect(userId, target, filter);
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
