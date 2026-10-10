import type {
  Event,
  EventBooking,
  EventDeadlineDelivery,
  EventPeriod,
  EventTable,
  Match,
  MatchInvitation,
} from "@board-game-organizer/schemas";
import { eventPeriods } from "@board-game-organizer/schemas";
import type { ClientSession, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../db";
import type { CommunityPage } from "../organizations/organizations.repository";
import { eventPeriodFilter } from "./event-list-filter";

export class EventsRepository {
  private events;
  private tables;
  private bookings;
  private deliveries;
  private matches;
  private invitations;
  private opts;
  constructor(db: Db, session?: ClientSession) {
    this.events = db.collection<Event & { transactionLock?: number }>(COLLECTIONS.EVENTS);
    this.tables = db.collection<EventTable>(COLLECTIONS.EVENT_TABLES);
    this.bookings = db.collection<EventBooking>(COLLECTIONS.EVENT_BOOKINGS);
    this.deliveries = db.collection<EventDeadlineDelivery>(COLLECTIONS.EVENT_DEADLINE_DELIVERIES);
    this.matches = db.collection<Match>(COLLECTIONS.MATCHES);
    this.invitations = db.collection<MatchInvitation>(COLLECTIONS.MATCH_INVITATIONS);
    this.opts = session ? { session } : {};
  }
  find(id: string) {
    return this.events.findOne(
      { id },
      { ...this.opts, projection: { _id: 0, transactionLock: 0 } },
    );
  }
  lock(id: string) {
    return this.events.findOneAndUpdate(
      { id },
      { $inc: { transactionLock: 1 } },
      { ...this.opts, returnDocument: "after", projection: { _id: 0, transactionLock: 0 } },
    );
  }
  async save(event: Event) {
    await this.events.replaceOne({ id: event.id }, event, { ...this.opts, upsert: true });
    return event;
  }
  async saveTable(table: EventTable) {
    await this.tables.replaceOne({ id: table.id, eventId: table.eventId }, table, {
      ...this.opts,
      upsert: true,
    });
    return table;
  }
  findTable(id: string) {
    return this.tables.findOne({ id }, { ...this.opts, projection: { _id: 0 } });
  }
  allTables(eventId: string) {
    return this.tables
      .find({ eventId, status: { $ne: "CANCELLED" } }, { ...this.opts, projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
  }
  tablesByIds(ids: string[]) {
    return this.tables
      .find({ id: { $in: ids } }, { ...this.opts, projection: { _id: 0 } })
      .toArray();
  }
  listTables(eventId: string, page: CommunityPage) {
    const filter: Filter<EventTable> = {
      eventId,
      status: { $ne: "CANCELLED" },
      ...(page.query
        ? { name: { $regex: page.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
        : {}),
    };
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      filter.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }];
    }
    return this.tables
      .find(filter, { ...this.opts, projection: { _id: 0 } })
      .sort({ createdAt: -1, id: -1 })
      .limit(page.limit + 1)
      .toArray();
  }
  countTables(eventId: string) {
    return this.tables.countDocuments({ eventId, status: { $ne: "CANCELLED" } }, this.opts);
  }
  async countConfirmedParticipants(eventId: string) {
    const rows = await this.bookings
      .aggregate<{ count: number }>(
        [
          { $match: { eventId, status: "CONFIRMED" } },
          {
            $lookup: {
              from: COLLECTIONS.EVENT_TABLES,
              localField: "tableId",
              foreignField: "id",
              pipeline: [{ $match: { eventId, status: { $ne: "CANCELLED" } } }],
              as: "activeTables",
            },
          },
          { $match: { "activeTables.0": { $exists: true } } },
          { $group: { _id: "$userId" } },
          { $count: "count" },
        ],
        this.opts,
      )
      .toArray();
    return rows[0]?.count ?? 0;
  }
  findBooking(id: string) {
    return this.bookings.findOne({ id }, { ...this.opts, projection: { _id: 0 } });
  }
  bookingForUser(tableId: string, userId: string) {
    return this.bookings.findOne({ tableId, userId }, { ...this.opts, projection: { _id: 0 } });
  }
  tableBookings(tableId: string) {
    return this.bookings
      .find({ tableId }, { ...this.opts, projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
  }
  userBookings(eventId: string, userId: string) {
    return this.bookings
      .find(
        { eventId, userId, status: { $in: ["PENDING", "CONFIRMED"] } },
        { ...this.opts, projection: { _id: 0 } },
      )
      .toArray();
  }
  async saveBooking(booking: EventBooking) {
    await this.bookings.replaceOne({ tableId: booking.tableId, userId: booking.userId }, booking, {
      ...this.opts,
      upsert: true,
    });
    return booking;
  }
  cancelBookings(tableId: string, userId?: string) {
    return this.bookings.updateMany(
      { tableId, ...(userId ? { userId } : {}), status: { $in: ["PENDING", "CONFIRMED"] } },
      { $set: { status: "CANCELLED", updatedAt: new Date().toISOString() } },
      this.opts,
    );
  }
  cancelPending(tableId: string) {
    return this.bookings.updateMany(
      { tableId, status: "PENDING" },
      { $set: { status: "CANCELLED", updatedAt: new Date().toISOString() } },
      this.opts,
    );
  }
  markTerminated(tableId: string) {
    return this.tables.updateOne(
      { id: tableId, status: "CREATED" },
      { $set: { status: "TERMINATED", updatedAt: new Date().toISOString() } },
      this.opts,
    );
  }
  listBookings(tableId: string, page: CommunityPage, viewerId?: string) {
    const filter: Filter<EventBooking> = {
      tableId,
      status: { $in: ["PENDING", "CONFIRMED"] },
      ...(viewerId ? { $and: [{ $or: [{ status: "CONFIRMED" }, { userId: viewerId }] }] } : {}),
    };
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      filter.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }];
    }
    return this.bookings
      .find(filter, { ...this.opts, projection: { _id: 0 } })
      .sort({ createdAt: -1, id: -1 })
      .limit(page.limit + 1)
      .toArray();
  }
  liveOrganizationEvents(organizationId: string) {
    return this.events
      .find(
        {
          organizationId,
          status: "PUBLISHED",
          closedAt: { $exists: false },
          bookingClosesAt: { $gt: new Date().toISOString() },
        },
        this.opts,
      )
      .sort({ id: 1 })
      .toArray();
  }
  async saveMatch(match: Match) {
    await this.matches.replaceOne({ id: match.id }, match, { ...this.opts, upsert: true });
  }
  findMatch(id: string) {
    return this.matches.findOne({ id }, this.opts);
  }
  async resetMatchPlayers(matchId: string, userId?: string) {
    await this.invitations.deleteMany(
      { matchId, ...(userId ? { inviteeUserId: userId } : {}) },
      this.opts,
    );
  }
  async syncMatchPlayer(invitation: MatchInvitation) {
    await this.invitations.replaceOne(
      { matchId: invitation.matchId, inviteeUserId: invitation.inviteeUserId },
      invitation,
      { ...this.opts, upsert: true },
    );
  }
  async cancelMatch(matchId: string) {
    await this.resetMatchPlayers(matchId);
    await this.matches.deleteOne({ id: matchId, status: "PLANNING" }, this.opts);
  }
  async schedule(event: Event) {
    const delivery: EventDeadlineDelivery = {
      id: `${event.id}/${event.version}`,
      eventId: event.id,
      version: event.version,
      bookingClosesAt: event.bookingClosesAt,
      createdAt: new Date().toISOString(),
    };
    await this.deliveries.updateOne(
      { id: delivery.id },
      { $setOnInsert: delivery },
      { ...this.opts, upsert: true },
    );
  }
  dueEvents() {
    return this.events
      .find(
        {
          status: "PUBLISHED",
          closedAt: { $exists: false },
          bookingClosesAt: { $lte: new Date().toISOString() },
        },
        { ...this.opts, projection: { _id: 0 } },
      )
      .sort({ bookingClosesAt: 1 })
      .limit(50)
      .toArray();
  }
  pendingDeliveries() {
    return this.deliveries
      .find({ deliveredAt: { $exists: false } }, { ...this.opts, projection: { _id: 0 } })
      .sort({ createdAt: 1 })
      .limit(50)
      .toArray();
  }
  delivered(ids: string[]) {
    return this.deliveries.updateMany(
      { id: { $in: ids } },
      { $set: { deliveredAt: new Date().toISOString() } },
      this.opts,
    );
  }
  list(
    userId: string,
    page: CommunityPage,
    organizationId?: string,
    periods: readonly EventPeriod[] = eventPeriods,
  ) {
    const pipeline: Record<string, unknown>[] = [
      { $match: { status: { $ne: "CANCELLED" }, ...(organizationId ? { organizationId } : {}) } },
      { $match: eventPeriodFilter(periods) },
    ];
    if (!organizationId)
      pipeline.push(
        {
          $lookup: {
            from: COLLECTIONS.EVENT_BOOKINGS,
            localField: "id",
            foreignField: "eventId",
            pipeline: [
              { $match: { userId, status: { $in: ["PENDING", "CONFIRMED"] } } },
              { $limit: 1 },
            ],
            as: "viewerBookings",
          },
        },
        {
          $lookup: {
            from: COLLECTIONS.EVENT_TABLES,
            localField: "id",
            foreignField: "eventId",
            pipeline: [
              { $match: { demonstratorUserId: userId, status: { $ne: "CANCELLED" } } },
              { $limit: 1 },
            ],
            as: "viewerDemonstrations",
          },
        },
      );
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      pipeline.push({
        $match: { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] },
      });
    }
    if (page.query)
      pipeline.push({
        $match: {
          name: { $regex: page.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
        },
      });
    pipeline.push(
      { $sort: { createdAt: -1, id: -1 } },
      {
        $lookup: {
          from: COLLECTIONS.ORGANIZATIONS,
          localField: "organizationId",
          foreignField: "id",
          as: "organization",
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.ORGANIZATION_MEMBERSHIPS,
          localField: "organizationId",
          foreignField: "organizationId",
          pipeline: [{ $match: { userId } }],
          as: "membership",
        },
      },
      {
        $match: {
          $and: [
            { $or: [{ adminUserId: userId }, { status: "PUBLISHED" }] },
            ...(organizationId
              ? []
              : [
                  {
                    $or: [
                      { adminUserId: userId },
                      { "viewerBookings.0": { $exists: true } },
                      { "viewerDemonstrations.0": { $exists: true } },
                    ],
                  },
                ]),
            { "membership.status": { $ne: "EXCLUDED" } },
          ],
        },
      },
      { $limit: page.limit + 1 },
      {
        $project: {
          _id: 0,
          transactionLock: 0,
          organization: 0,
          membership: 0,
          viewerBookings: 0,
          viewerDemonstrations: 0,
        },
      },
    );
    return this.events.aggregate<Event>(pipeline, this.opts).toArray();
  }
}
