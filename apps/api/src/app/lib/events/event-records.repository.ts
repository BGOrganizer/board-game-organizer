import type {
  EventListStatus,
  EventProposal,
  EventRecord,
  EventVoter,
  GroupRecord,
  TableRecord,
  TableRegistration,
  User,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../db";
import { ProfileActivitiesRepository } from "../profile/profile-activities.repository";
import { eventPeriodStages } from "./event-periods";

export interface EventRecordPage {
  limit: number;
  cursor?: string;
  query?: string;
  periods?: readonly ("past" | "future")[];
  statuses?: readonly EventListStatus[];
  section?: "mine" | "available" | "waiting";
}
export class EventRecordsRepository {
  private events;
  private tables;
  private registrations;
  private votes;
  private opts;
  constructor(
    private db: Db,
    session?: ClientSession,
  ) {
    this.events = db.collection<EventRecord & { transactionLock?: number }>(COLLECTIONS.EVENTS);
    this.tables = db.collection<TableRecord>(COLLECTIONS.EVENT_TABLES);
    this.registrations = db.collection<TableRegistration>(COLLECTIONS.TABLE_REGISTRATIONS);
    this.votes = db.collection<EventVoter>(COLLECTIONS.EVENT_VOTES);
    this.opts = session ? { session } : {};
  }
  find(id: string) {
    return this.events.findOne(
      { id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
      { ...this.opts, projection: { _id: 0, transactionLock: 0 } },
    );
  }
  lock(id: string) {
    return this.events.findOneAndUpdate(
      { id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
      { $inc: { transactionLock: 1 } },
      { ...this.opts, returnDocument: "after", projection: { _id: 0, transactionLock: 0 } },
    );
  }
  async create(event: EventRecord) {
    await this.events.insertOne({ ...event }, this.opts);
    return event;
  }
  async save(event: EventRecord) {
    const previous = event.status === "TERMINATED" ? await this.find(event.id) : null;
    await this.events.replaceOne(
      { id: event.id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
      event,
      this.opts,
    );
    if (event.status === "TERMINATED" && previous?.status === "CONFIRMED")
      await new ProfileActivitiesRepository(this.db, this.opts.session).finalized(
        event,
        await this.allTables(event.id),
      );
    return event;
  }
  /** Caller holds the Event (and Group when present) lock in this transaction. */
  async remove(id: string) {
    await this.db.collection(COLLECTIONS.PROFILE_ACTIVITIES).deleteMany({ eventId: id }, this.opts);
    for (const collection of [
      COLLECTIONS.TABLE_REGISTRATIONS,
      COLLECTIONS.EVENT_VOTES,
      COLLECTIONS.EVENT_PROPOSALS,
      COLLECTIONS.EVENT_TABLES,
    ])
      await this.db.collection(collection).deleteMany({ eventId: id }, this.opts);
    await this.db
      .collection(COLLECTIONS.RATING_EVENTS)
      .deleteMany({ eventId: id, tableId: { $exists: true } }, this.opts);
    await this.db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .deleteMany({ href: { $regex: `^/events/${id}(?:[/?#]|$)` } }, this.opts);
    await this.events.deleteOne(
      { id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
      this.opts,
    );
  }
  storedTable(id: string) {
    return this.tables.findOne({ id }, { ...this.opts, projection: { _id: 0 } });
  }
  table(id: string) {
    return this.tables.findOne(
      { id, removedAt: { $exists: false } },
      { ...this.opts, projection: { _id: 0 } },
    );
  }
  allTables(eventId: string) {
    return this.tables
      .find({ eventId, removedAt: { $exists: false } }, { ...this.opts, projection: { _id: 0 } })
      .sort({ order: 1 })
      .toArray();
  }
  async saveTable(table: TableRecord) {
    await this.tables.replaceOne({ id: table.id }, table, { ...this.opts, upsert: true });
    return table;
  }
  async removeTable(id: string, at: string) {
    await this.tables.updateOne(
      { id, results: { $exists: false } },
      { $set: { removedAt: at, updatedAt: at } },
      this.opts,
    );
    await this.registrations.updateMany(
      { tableId: id, status: { $in: ["PENDING", "ACCEPTED"] } },
      { $set: { status: "CANCELLED", updatedAt: at }, $inc: { version: 1 } },
      this.opts,
    );
  }
  /** Filter occupied users before the cursor/limit; queue position does not change active status. */
  invitationCandidates(
    group: GroupRecord | null,
    actor: string,
    tableId: string,
    page: EventRecordPage,
  ) {
    const query = page.query?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const now = new Date().toISOString();
    return this.db
      .collection<User>(COLLECTIONS.USERS)
      .aggregate<User>(
        [
          {
            $match: {
              clerkId: { $ne: actor, ...(page.cursor ? { $gt: page.cursor } : {}) },
              ...(query
                ? {
                    $or: ["name", "username", "email"].map((field) => ({
                      [field]: { $regex: query, $options: "i" },
                    })),
                  }
                : {}),
            },
          },
          { $sort: { clerkId: 1 } },
          ...(group
            ? [
                {
                  $lookup: {
                    from: COLLECTIONS.GROUP_MEMBERSHIPS,
                    localField: "clerkId",
                    foreignField: "userId",
                    pipeline: [
                      { $match: { groupId: group.id, status: "ACCEPTED" } },
                      { $limit: 1 },
                    ],
                    as: "membership",
                  },
                },
                {
                  $match: {
                    $or: [{ clerkId: group.adminUserId }, { "membership.0": { $exists: true } }],
                  },
                },
                {
                  $lookup: {
                    from: COLLECTIONS.GROUP_BANS,
                    localField: "clerkId",
                    foreignField: "userId",
                    pipeline: [
                      {
                        $match: {
                          groupId: group.id,
                          revokedAt: { $exists: false },
                          $or: [{ until: null }, { until: { $gt: now } }],
                        },
                      },
                      { $limit: 1 },
                    ],
                    as: "ban",
                  },
                },
                { $match: { "ban.0": { $exists: false } } },
              ]
            : [
                {
                  $lookup: {
                    from: COLLECTIONS.FRIEND_REQUESTS,
                    localField: "clerkId",
                    foreignField: "toUserId",
                    pipeline: [
                      { $match: { fromUserId: actor, status: "accepted" } },
                      { $limit: 1 },
                    ],
                    as: "forward",
                  },
                },
                {
                  $lookup: {
                    from: COLLECTIONS.FRIEND_REQUESTS,
                    localField: "clerkId",
                    foreignField: "fromUserId",
                    pipeline: [{ $match: { toUserId: actor, status: "accepted" } }, { $limit: 1 }],
                    as: "reverse",
                  },
                },
                { $match: { "forward.0": { $exists: true }, "reverse.0": { $exists: true } } },
                {
                  $lookup: {
                    from: COLLECTIONS.BLOCKS,
                    let: { target: "$clerkId" },
                    pipeline: [
                      {
                        $match: {
                          $expr: {
                            $or: [
                              {
                                $and: [
                                  { $eq: ["$fromUserId", actor] },
                                  { $eq: ["$toUserId", "$$target"] },
                                ],
                              },
                              {
                                $and: [
                                  { $eq: ["$toUserId", actor] },
                                  { $eq: ["$fromUserId", "$$target"] },
                                ],
                              },
                            ],
                          },
                        },
                      },
                      { $limit: 1 },
                    ],
                    as: "block",
                  },
                },
                { $match: { "block.0": { $exists: false } } },
              ]),
          {
            $lookup: {
              from: COLLECTIONS.TABLE_REGISTRATIONS,
              localField: "clerkId",
              foreignField: "userId",
              pipeline: [
                { $match: { tableId, status: { $in: ["PENDING", "ACCEPTED"] } } },
                { $limit: 1 },
              ],
              as: "registration",
            },
          },
          { $match: { "registration.0": { $exists: false } } },
          { $limit: page.limit + 1 },
          {
            $project: {
              _id: 0,
              clerkId: 1,
              name: 1,
              username: 1,
              email: 1,
              avatarUrl: 1,
              presence: 1,
            },
          },
        ],
        this.opts,
      )
      .toArray();
  }
  /** Deduplicate authorized attendance, pending invitations and demonstration BEFORE paging. */
  participants(
    event: EventRecord,
    page: Pick<EventRecordPage, "limit" | "cursor">,
    pendingViewerId?: string,
  ) {
    return this.tables
      .aggregate<{ userId: string; tableIds: string[] }>(
        [
          { $match: { eventId: event.id, removedAt: { $exists: false } } },
          {
            $lookup: {
              from: COLLECTIONS.TABLE_REGISTRATIONS,
              localField: "id",
              foreignField: "tableId",
              pipeline: [
                {
                  $match: {
                    eventId: event.id,
                    $or: [
                      { status: "ACCEPTED" },
                      ...(event.status === "TERMINATED"
                        ? []
                        : [
                            {
                              status: "PENDING",
                              kind: "INVITATION",
                              ...(pendingViewerId ? { userId: pendingViewerId } : {}),
                            },
                          ]),
                    ],
                  },
                },
                { $project: { _id: 0, userId: 1 } },
              ],
              as: "accepted",
            },
          },
          {
            $project: {
              tableId: "$id",
              users: {
                $setUnion: [
                  "$accepted.userId",
                  {
                    $cond: [
                      {
                        $and: [
                          { $eq: [{ $type: "$demonstratorUserId" }, "string"] },
                          event.status === "PLANNING"
                            ? true
                            : { $ne: [{ $type: "$confirmed" }, "missing"] },
                        ],
                      },
                      ["$demonstratorUserId"],
                      [],
                    ],
                  },
                  event.status === "PLANNING"
                    ? []
                    : { $cond: [{ $isArray: "$confirmed.playerIds" }, "$confirmed.playerIds", []] },
                ],
              },
            },
          },
          { $unwind: "$users" },
          { $match: { users: { $type: "string", $ne: "" } } },
          { $group: { _id: "$users", tableIds: { $addToSet: "$tableId" } } },
          ...(page.cursor ? [{ $match: { _id: { $gt: page.cursor } } }] : []),
          { $sort: { _id: 1 } },
          { $limit: page.limit + 1 },
          { $project: { _id: 0, userId: "$_id", tableIds: 1 } },
        ],
        this.opts,
      )
      .toArray();
  }
  proposal(id: string) {
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .findOne({ id }, { ...this.opts, projection: { _id: 0 } });
  }
  proposalRequest(eventId: string, userId: string, clientRequestId: string) {
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .findOne({ eventId, userId, clientRequestId }, { ...this.opts, projection: { _id: 0 } });
  }
  duplicateProposal(eventId: string, userId: string, payloadKey: string) {
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .findOne(
        { eventId, userId, payloadKey, status: "PENDING" },
        { ...this.opts, projection: { _id: 0 } },
      );
  }
  gameProposals(eventId: string, tableId: string, gameId: number) {
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .find(
        { eventId, "payload.kind": "game", "payload.tableId": tableId, "payload.gameId": gameId },
        { ...this.opts, projection: { _id: 0 } },
      )
      .toArray();
  }
  choiceProposals(eventId: string, payloadKey: string) {
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .find({ eventId, payloadKey }, { ...this.opts, projection: { _id: 0 } })
      .toArray();
  }
  proposalBatch(eventId: string, reviewBatchId: string) {
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .find({ eventId, reviewBatchId }, { ...this.opts, projection: { _id: 0 } })
      .toArray();
  }
  ownProposedGames(eventId: string, tableId: string, userId: string) {
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .distinct(
        "payload.gameId",
        { eventId, userId, "payload.kind": "game", "payload.tableId": tableId },
        this.opts,
      )
      .then((ids) => ids.filter((id): id is number => typeof id === "number"));
  }
  gameProposalPage(eventId: string, tableId: string, page: { limit: number; cursor?: string }) {
    return this.proposalReviewPage(eventId, "game", { ...page, tableId });
  }
  proposalReviewPage(
    eventId: string,
    kind: "date" | "location" | "game",
    page: { limit: number; cursor?: string; tableId?: string },
  ) {
    const [at, id] = page.cursor?.split("|") ?? [];
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .aggregate<{ representative: EventProposal; members: EventProposal[] }>(
        [
          {
            $match: {
              eventId,
              "payload.kind": kind,
              ...(page.tableId ? { "payload.tableId": page.tableId } : {}),
            },
          },
          {
            $set: {
              pendingOrder: {
                $cond: [
                  { $eq: ["$status", "PENDING"] },
                  2,
                  { $cond: [{ $eq: ["$status", "ACCEPTED"] }, 1, 0] },
                ],
              },
            },
          },
          { $sort: { pendingOrder: -1, createdAt: -1, id: -1 } },
          { $unset: ["pendingOrder", "_id"] },
          {
            $group: {
              _id: kind === "game" ? "$payload.gameId" : "$payloadKey",
              representative: { $first: "$$ROOT" },
              members: { $push: "$$ROOT" },
            },
          },
          ...(at
            ? [
                {
                  $match: {
                    $or: [
                      { "representative.createdAt": { $lt: at } },
                      { "representative.createdAt": at, "representative.id": { $lt: id } },
                    ],
                  },
                },
              ]
            : []),
          { $sort: { "representative.createdAt": -1, "representative.id": -1 } },
          { $limit: page.limit + 1 },
        ],
        this.opts,
      )
      .toArray();
  }
  async saveProposal(row: EventProposal) {
    await this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .replaceOne({ id: row.id }, row, { ...this.opts, upsert: true });
    return row;
  }
  proposals(
    eventId: string,
    userId: string | null,
    page: {
      limit: number;
      cursor?: string;
      kind: "date" | "location" | "game";
      tableId?: string;
      clientRequestId?: string;
    },
  ) {
    const [at, id] = page.cursor?.split("|") ?? [];
    return this.db
      .collection<EventProposal>(COLLECTIONS.EVENT_PROPOSALS)
      .find(
        {
          eventId,
          "payload.kind": page.kind,
          ...(userId !== null ? { userId } : {}),
          ...(page.tableId ? { "payload.tableId": page.tableId } : {}),
          ...(page.clientRequestId ? { clientRequestId: page.clientRequestId } : {}),
          ...(at ? { $or: [{ createdAt: { $lt: at } }, { createdAt: at, id: { $lt: id } }] } : {}),
        },
        { ...this.opts, projection: { _id: 0 } },
      )
      .sort({ createdAt: -1, id: -1 })
      .limit(page.limit + 1)
      .toArray();
  }
  allRegistrations(eventId: string) {
    return this.registrations
      .find(
        { eventId, status: { $in: ["PENDING", "ACCEPTED"] } },
        { ...this.opts, projection: { _id: 0 } },
      )
      .sort({ priorityAt: 1, sequence: 1 })
      .toArray();
  }
  acceptedTableUsers(tableId: string) {
    return this.registrations.distinct("userId", { tableId, status: "ACCEPTED" }, this.opts);
  }
  userRegistrations(eventId: string, userId: string) {
    return this.registrations
      .find(
        { eventId, userId, status: { $in: ["PENDING", "ACCEPTED"] } },
        { ...this.opts, projection: { _id: 0 } },
      )
      .toArray();
  }
  registration(id: string) {
    return this.registrations.findOne({ id }, { ...this.opts, projection: { _id: 0 } });
  }
  userRegistration(tableId: string, userId: string) {
    return this.registrations.findOne(
      { tableId, userId },
      { ...this.opts, projection: { _id: 0 } },
    );
  }
  async saveRegistration(row: TableRegistration) {
    const previous =
      row.status === "ACCEPTED" ? await this.userRegistration(row.tableId, row.userId) : null;
    await this.registrations.replaceOne({ tableId: row.tableId, userId: row.userId }, row, {
      ...this.opts,
      upsert: true,
    });
    if (row.status === "ACCEPTED" && previous?.status !== "ACCEPTED") {
      const activities = new ProfileActivitiesRepository(this.db, this.opts.session);
      await activities.record({
        source: `registration:${row.id}:${row.version}`,
        userId: row.userId,
        kind: "table_join",
        occurredAt: row.updatedAt,
        eventId: row.eventId,
        tableId: row.tableId,
      });
      await activities.record({
        source: `event:${row.eventId}`,
        userId: row.userId,
        kind: "event_join",
        occurredAt: row.updatedAt,
        eventId: row.eventId,
      });
    }
    return row;
  }
  async cancelUser(eventId: string, userId: string, at: string) {
    await this.registrations.updateMany(
      { eventId, userId, status: { $in: ["PENDING", "ACCEPTED"] } },
      { $set: { status: "CANCELLED", updatedAt: at }, $inc: { version: 1 } },
      this.opts,
    );
  }
  async cancelPending(eventId: string, at: string) {
    await this.registrations.updateMany(
      { eventId, status: "PENDING" },
      { $set: { status: "CANCELLED", updatedAt: at }, $inc: { version: 1 } },
      this.opts,
    );
  }
  allVotes(eventId: string) {
    return this.votes.find({ eventId }, { ...this.opts, projection: { _id: 0 } }).toArray();
  }
  voter(eventId: string, userId: string) {
    return this.votes.findOne({ eventId, userId }, { ...this.opts, projection: { _id: 0 } });
  }
  async retainChoiceVotes(eventId: string, dateIds: string[], locationIds: string[]) {
    const retain = (field: string, ids: string[]) => ({
      $arrayToObject: {
        $filter: {
          input: { $objectToArray: { $ifNull: [`$${field}`, {}] } },
          as: "vote",
          cond: { $in: ["$$vote.k", ids] },
        },
      },
    });
    await this.votes.updateMany(
      { eventId },
      [
        {
          $set: {
            dateVotes: retain("dateVotes", dateIds),
            locationVotes: retain("locationVotes", locationIds),
          },
        },
      ],
      this.opts,
    );
  }
  async retainGameVotes(tableId: string, ids: number[]) {
    await this.registrations.updateMany(
      { tableId },
      [
        {
          $set: {
            gameVotes: {
              $arrayToObject: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ["$gameVotes", {}] } },
                  as: "vote",
                  cond: { $in: ["$$vote.k", ids.map(String)] },
                },
              },
            },
          },
        },
      ],
      this.opts,
    );
  }
  async saveVoter(row: EventVoter) {
    await this.votes.replaceOne({ eventId: row.eventId, userId: row.userId }, row, {
      ...this.opts,
      upsert: true,
    });
    return row;
  }
  groupEvents(groupId: string) {
    return this.events
      .find(
        { groupId, status: { $in: ["PLANNING", "CONFIRMED"] } },
        { ...this.opts, projection: { _id: 0, transactionLock: 0 } },
      )
      .sort({ id: 1 })
      .toArray();
  }
  async counts(event: EventRecord, tables: readonly TableRecord[]) {
    if (event.status !== "PLANNING") {
      const included = tables.filter((table) => table.confirmed);
      return {
        tableCount: included.length,
        participantCount: new Set(included.flatMap((table) => table.confirmed?.playerIds ?? []))
          .size,
      };
    }
    const rows = await this.registrations
      .aggregate<{ count: number }>(
        [
          {
            $match: {
              eventId: event.id,
              tableId: { $in: tables.map((table) => table.id) },
              status: "ACCEPTED",
            },
          },
          { $group: { _id: "$userId" } },
          { $count: "count" },
        ],
        this.opts,
      )
      .toArray();
    return { tableCount: tables.length, participantCount: rows[0]?.count ?? 0 };
  }
  /** Shared Event visibility; downstream joins must preserve personalAccessOnly scope. */
  visibleGroups(userId: string, now: string, eventPrefix = "") {
    return [
      {
        $lookup: {
          from: COLLECTIONS.GROUPS,
          localField: "groupId",
          foreignField: "id",
          as: "parentGroup",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.GROUP_MEMBERSHIPS,
          let: { group: "$groupId" },
          pipeline: [
            { $match: { userId, status: "ACCEPTED", $expr: { $eq: ["$groupId", "$$group"] } } },
          ],
          as: "groupMembership",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.GROUP_BANS,
          let: { group: "$groupId" },
          pipeline: [
            {
              $match: {
                userId,
                revokedAt: { $exists: false },
                $or: [{ until: null }, { until: { $gt: now } }],
                $expr: { $eq: ["$groupId", "$$group"] },
              },
            },
          ],
          as: "groupBan",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.GROUP_BANS,
          let: {
            group: "$groupId",
            confirmedAt: `$${eventPrefix}confirmed.at`,
            publicEvent: {
              $and: [
                { $eq: [{ $arrayElemAt: ["$parentGroup.type", 0] }, "PUBLIC"] },
                { $ne: [{ $ifNull: [`$${eventPrefix}visibility`, null] }, "PRIVATE"] },
              ],
            },
          },
          pipeline: [
            {
              $match: {
                userId,
                $expr: {
                  $and: [
                    { $eq: ["$groupId", "$$group"] },
                    {
                      $let: {
                        vars: {
                          frozenAt: {
                            $convert: {
                              input: "$$confirmedAt",
                              to: "date",
                              onError: null,
                              onNull: null,
                            },
                          },
                          through: {
                            $convert: {
                              input: {
                                $cond: ["$$publicEvent", "$createdAt", "$memberAccessThrough"],
                              },
                              to: "date",
                              onError: null,
                              onNull: null,
                            },
                          },
                        },
                        in: {
                          $and: [
                            { $ne: ["$$frozenAt", null] },
                            { $ne: ["$$through", null] },
                            { $lte: ["$$frozenAt", "$$through"] },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 0, id: 1 } },
          ],
          as: "preservedBan",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.TABLE_REGISTRATIONS,
          let: { event: `$${eventPrefix}id` },
          pipeline: [
            { $match: { userId, status: "ACCEPTED", $expr: { $eq: ["$eventId", "$$event"] } } },
            {
              $lookup: {
                from: COLLECTIONS.EVENT_TABLES,
                localField: "tableId",
                foreignField: "id",
                pipeline: [{ $match: { removedAt: { $exists: false } } }],
                as: "liveTable",
              },
            },
            { $match: { "liveTable.0": { $exists: true } } },
            { $limit: 1 },
            { $project: { _id: 0, id: 1 } },
          ],
          as: "publicRegistration",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.EVENT_TABLES,
          let: { event: `$${eventPrefix}id`, status: `$${eventPrefix}status` },
          pipeline: [
            {
              $match: {
                removedAt: { $exists: false },
                confirmed: { $exists: true },
                $or: [{ "confirmed.playerIds": userId }, { demonstratorUserId: userId }],
                $expr: {
                  $and: [
                    { $eq: ["$eventId", "$$event"] },
                    { $in: ["$$status", ["CONFIRMED", "TERMINATED"]] },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 0, id: 1 } },
          ],
          as: "personalFrozenTable",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.BLOCKS,
          let: { admin: `$${eventPrefix}adminUserId` },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$fromUserId", userId] }, { $eq: ["$toUserId", "$$admin"] }] },
                    { $and: [{ $eq: ["$toUserId", userId] }, { $eq: ["$fromUserId", "$$admin"] }] },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 0, fromUserId: 1 } },
          ],
          as: "publicEventBlock",
        },
      },
      {
        $set: {
          personalAccessOnly: {
            $and: [
              { $gt: [{ $size: "$preservedBan" }, 0] },
              { $gt: [{ $size: "$personalFrozenTable" }, 0] },
              {
                $or: [
                  { $gt: [{ $size: "$groupBan" }, 0] },
                  {
                    $and: [
                      { $ne: [{ $arrayElemAt: ["$parentGroup.adminUserId", 0] }, userId] },
                      { $eq: [{ $size: "$groupMembership" }, 0] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $match: {
          $or: [
            { groupId: null, "publicEventBlock.0": { $exists: false } },
            {
              $and: [
                { personalAccessOnly: true },
                { "parentGroup.0.approved": { $exists: true } },
                { "publicEventBlock.0": { $exists: false } },
                ...(eventPrefix
                  ? [{ $or: [{ "confirmed.playerIds": userId }, { demonstratorUserId: userId }] }]
                  : []),
              ],
            },
            {
              $and: [
                { personalAccessOnly: false },
                { "groupBan.0": { $exists: false } },
                { "parentGroup.0.approved": { $exists: true } },
                {
                  $or: [
                    { "parentGroup.adminUserId": userId },
                    { "groupMembership.0": { $exists: true } },
                    {
                      $and: [
                        { "parentGroup.type": "PUBLIC" },
                        { [`${eventPrefix}visibility`]: { $ne: "PRIVATE" } },
                        { "publicRegistration.0": { $exists: true } },
                        { "publicEventBlock.0": { $exists: false } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ];
  }
  /** Canonical main-list participation; reused by source-scoped notification tab counts. */
  participationStages(userId: string): Record<string, unknown>[] {
    return [
      {
        $lookup: {
          from: COLLECTIONS.TABLE_REGISTRATIONS,
          localField: "id",
          foreignField: "eventId",
          pipeline: [
            { $match: { userId, status: { $in: ["PENDING", "ACCEPTED"] } } },
            {
              $lookup: {
                from: COLLECTIONS.EVENT_TABLES,
                localField: "tableId",
                foreignField: "id",
                pipeline: [{ $match: { removedAt: { $exists: false } } }],
                as: "activeTable",
              },
            },
            { $match: { "activeTable.0": { $exists: true } } },
            { $limit: 1 },
          ],
          as: "myRegistration",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.EVENT_TABLES,
          localField: "id",
          foreignField: "eventId",
          let: { eventStatus: "$status" },
          pipeline: [
            {
              $match: {
                demonstratorUserId: userId,
                removedAt: { $exists: false },
                $expr: {
                  $or: [
                    { $eq: ["$$eventStatus", "PLANNING"] },
                    { $ne: [{ $ifNull: ["$confirmed", null] }, null] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "myDemonstration",
        },
      },
    ];
  }
  async list(userId: string, page: EventRecordPage, groupId?: string) {
    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          status: { $in: page.statuses ?? ["PLANNING", "CONFIRMED", "TERMINATED"] },
          ...(groupId ? { groupId } : {}),
        },
      },
      ...this.visibleGroups(userId, new Date().toISOString()),
      ...eventPeriodStages(page.periods, Date.now()),
    ];
    if (!groupId) {
      pipeline.push(...this.participationStages(userId), {
        $match:
          page.section === "available"
            ? {
                "myRegistration.0": { $exists: false },
                "myDemonstration.0": { $exists: false },
                "personalFrozenTable.0": { $exists: false },
                $or: [{ groupId: { $ne: null } }, { adminUserId: userId }],
              }
            : {
                $or: [
                  { "myRegistration.0": { $exists: true } },
                  { "myDemonstration.0": { $exists: true } },
                  { "personalFrozenTable.0": { $exists: true } },
                ],
              },
      });
    }
    if (page.query)
      pipeline.push({
        $match: {
          name: { $regex: page.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
        },
      });
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      pipeline.push({
        $match: { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] },
      });
    }
    pipeline.push(
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: page.limit + 1 },
      {
        $project: {
          _id: 0,
          transactionLock: 0,
          parentGroup: 0,
          groupMembership: 0,
          groupBan: 0,
          preservedBan: 0,
          publicRegistration: 0,
          publicEventBlock: 0,
          personalFrozenTable: 0,
          personalAccessOnly: 0,
          myRegistration: 0,
          myDemonstration: 0,
        },
      },
    );
    return this.events.aggregate<EventRecord>(pipeline, this.opts).toArray();
  }
  async personalTables(userId: string, page: EventRecordPage) {
    const pipeline: Record<string, unknown>[] = [
      { $match: { removedAt: { $exists: false } } },
      {
        $lookup: {
          from: COLLECTIONS.EVENTS,
          localField: "eventId",
          foreignField: "id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      {
        $match: {
          "event.status": { $in: page.statuses ?? ["PLANNING", "CONFIRMED", "TERMINATED"] },
          $or: [{ "event.status": "PLANNING" }, { "confirmed.gameId": { $exists: true } }],
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.TABLE_REGISTRATIONS,
          localField: "id",
          foreignField: "tableId",
          pipeline: [{ $match: { userId, status: { $in: ["PENDING", "ACCEPTED"] } } }],
          as: "ownRows",
        },
      },
      {
        // Prune known nonmembers of this section before the candidate page. Accepted queue/seat
        // distinctions still use the shared exact agreement projection in the service.
        $match:
          page.section === "waiting"
            ? {
                "ownRows.0": { $exists: true },
                demonstratorUserId: { $ne: userId },
                $nor: [{ "event.status": { $ne: "PLANNING" }, "confirmed.playerIds": userId }],
              }
            : {
                $or: [
                  page.section === "mine"
                    ? { ownRows: { $elemMatch: { status: "ACCEPTED" } } }
                    : { "ownRows.0": { $exists: true } },
                  { demonstratorUserId: userId },
                  { "event.status": { $ne: "PLANNING" }, "confirmed.playerIds": userId },
                ],
              },
      },
      { $set: { originalTable: "$$ROOT", groupId: "$event.groupId" } },
      ...this.visibleGroups(userId, new Date().toISOString(), "event."),
      ...eventPeriodStages(page.periods, Date.now(), "event."),
    ];
    if (page.query)
      pipeline.push({
        $match: {
          name: { $regex: page.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
        },
      });
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      pipeline.push({
        $match: { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] },
      });
    }
    pipeline.push(
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: page.limit + 1 },
      { $replaceWith: "$originalTable" },
      { $project: { _id: 0, event: 0, ownRows: 0 } },
    );
    return this.tables.aggregate<TableRecord>(pipeline, this.opts).toArray();
  }
  registrationsPage(
    tableId: string,
    status: "PENDING" | "ACCEPTED",
    page: EventRecordPage,
    userIds?: readonly string[],
  ) {
    const filter: Filter<TableRegistration> = {
      tableId,
      status,
      ...(userIds ? { userId: { $in: [...userIds] } } : {}),
    };
    if (page.cursor) {
      const [priorityAt, rawSequence, id] = page.cursor.split("|");
      const sequence = Number(rawSequence);
      filter.$or = [
        { priorityAt: { $gt: priorityAt } },
        { priorityAt, sequence: { $gt: sequence } },
        { priorityAt, sequence, id: { $gt: id } },
      ];
    }
    return this.registrations
      .find(filter, { ...this.opts, projection: { _id: 0 } })
      .sort({ priorityAt: 1, sequence: 1, id: 1 })
      .limit(page.limit + 1)
      .toArray();
  }
}
