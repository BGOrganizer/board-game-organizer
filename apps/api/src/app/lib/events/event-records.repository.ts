import type {
  EventRecord,
  EventVoter,
  TableRecord,
  TableRegistration,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../db";
import { eventPeriodStages } from "./event-periods";

export interface EventRecordPage {
  limit: number;
  cursor?: string;
  query?: string;
  periods?: readonly ("past" | "future")[];
}
export class EventRecordsRepository {
  private events;
  private tables;
  private registrations;
  private votes;
  private opts;
  constructor(db: Db, session?: ClientSession) {
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
    await this.events.replaceOne(
      { id: event.id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
      event,
      this.opts,
    );
    return event;
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
  allRegistrations(eventId: string) {
    return this.registrations
      .find(
        { eventId, status: { $in: ["PENDING", "ACCEPTED"] } },
        { ...this.opts, projection: { _id: 0 } },
      )
      .sort({ priorityAt: 1, sequence: 1 })
      .toArray();
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
    await this.registrations.replaceOne({ tableId: row.tableId, userId: row.userId }, row, {
      ...this.opts,
      upsert: true,
    });
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
  private visibleGroups(userId: string, now: string) {
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
        $match: {
          $or: [
            { groupId: null },
            {
              $and: [
                { "groupBan.0": { $exists: false } },
                { "parentGroup.0.approved": { $exists: true } },
                {
                  $or: [
                    { "parentGroup.adminUserId": userId },
                    { "groupMembership.0": { $exists: true } },
                  ],
                },
              ],
            },
          ],
        },
      },
    ];
  }
  async list(userId: string, page: EventRecordPage, groupId?: string) {
    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] },
          ...(groupId ? { groupId } : {}),
        },
      },
      ...this.visibleGroups(userId, new Date().toISOString()),
      ...eventPeriodStages(page.periods, Date.now()),
    ];
    if (!groupId) {
      pipeline.push(
        {
          $lookup: {
            from: COLLECTIONS.TABLE_REGISTRATIONS,
            localField: "id",
            foreignField: "eventId",
            pipeline: [{ $match: { userId, status: "ACCEPTED" } }, { $limit: 1 }],
            as: "myRegistration",
          },
        },
        {
          $lookup: {
            from: COLLECTIONS.EVENT_TABLES,
            localField: "id",
            foreignField: "eventId",
            pipeline: [
              { $match: { demonstratorUserId: userId, removedAt: { $exists: false } } },
              { $limit: 1 },
            ],
            as: "myDemonstration",
          },
        },
        {
          $match: {
            $or: [
              { adminUserId: userId },
              { "myRegistration.0": { $exists: true } },
              { "myDemonstration.0": { $exists: true } },
            ],
          },
        },
      );
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
      { $match: { "event.status": { $in: ["PLANNING", "CONFIRMED"] } } },
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
        $match: {
          $or: [
            { ownRows: { $elemMatch: { status: "PENDING", kind: "INVITATION" } } },
            {
              $and: [
                { "event.status": "CONFIRMED" },
                { confirmed: { $exists: true } },
                {
                  $or: [
                    { "event.adminUserId": userId },
                    { "confirmed.playerIds": userId },
                    { demonstratorUserId: userId },
                  ],
                },
              ],
            },
          ],
        },
      },
      { $set: { originalTable: "$$ROOT", groupId: "$event.groupId" } },
      ...this.visibleGroups(userId, new Date().toISOString()),
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
  registrationsPage(tableId: string, status: "PENDING" | "ACCEPTED", page: EventRecordPage) {
    const filter: Filter<TableRegistration> = { tableId, status };
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
