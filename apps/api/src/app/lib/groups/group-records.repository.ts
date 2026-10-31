import type {
  GroupBan,
  GroupMembership,
  GroupRecord,
  GroupRecordListRole,
  User,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../db";
import { EventRecordsRepository } from "../events/event-records.repository";

export interface GroupRecordPage {
  limit: number;
  cursor?: string;
  query?: string;
  roles?: readonly GroupRecordListRole[];
}
export class GroupRecordsRepository {
  private groups;
  private memberships;
  private bans;
  private events;
  private opts;
  constructor(
    private db: Db,
    session?: ClientSession,
  ) {
    this.groups = db.collection<GroupRecord & { transactionLock?: number }>(COLLECTIONS.GROUPS);
    this.memberships = db.collection<GroupMembership>(COLLECTIONS.GROUP_MEMBERSHIPS);
    this.bans = db.collection<GroupBan>(COLLECTIONS.GROUP_BANS);
    this.events = db.collection(COLLECTIONS.EVENTS);
    this.opts = session ? { session } : {};
  }
  find(id: string) {
    return this.groups.findOne(
      { id, type: { $in: ["PRIVATE", "PUBLIC"] } },
      { ...this.opts, projection: { _id: 0, transactionLock: 0 } },
    );
  }
  lock(id: string) {
    return this.groups.findOneAndUpdate(
      { id, type: { $in: ["PRIVATE", "PUBLIC"] } },
      { $inc: { transactionLock: 1 } },
      { ...this.opts, returnDocument: "after", projection: { _id: 0, transactionLock: 0 } },
    );
  }
  async invitationCandidates(groupId: string, actor: string, page: GroupRecordPage) {
    const now = new Date().toISOString();
    const query = page.query?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.db
      .collection(COLLECTIONS.FRIEND_REQUESTS)
      .aggregate<User>(
        [
          { $match: { fromUserId: actor, status: "accepted" } },
          { $group: { _id: "$toUserId" } },
          {
            $lookup: {
              from: COLLECTIONS.FRIEND_REQUESTS,
              let: { target: "$_id" },
              pipeline: [
                {
                  $match: {
                    toUserId: actor,
                    status: "accepted",
                    $expr: { $eq: ["$fromUserId", "$$target"] },
                  },
                },
                { $limit: 1 },
              ],
              as: "reverse",
            },
          },
          { $match: { "reverse.0": { $exists: true } } },
          {
            $lookup: {
              from: COLLECTIONS.USERS,
              localField: "_id",
              foreignField: "clerkId",
              as: "profile",
            },
          },
          { $unwind: "$profile" },
          { $replaceWith: "$profile" },
          {
            $match: {
              clerkId: { $ne: actor, ...(page.cursor ? { $gt: page.cursor } : {}) },
              ...(query
                ? {
                    $or: ["name", "email", "username"].map((field) => ({
                      [field]: { $regex: query, $options: "i" },
                    })),
                  }
                : {}),
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.GROUP_MEMBERSHIPS,
              localField: "clerkId",
              foreignField: "userId",
              pipeline: [
                { $match: { groupId, status: { $in: ["PENDING", "ACCEPTED"] } } },
                { $limit: 1 },
              ],
              as: "membership",
            },
          },
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
          {
            $lookup: {
              from: COLLECTIONS.GROUP_BANS,
              localField: "clerkId",
              foreignField: "userId",
              pipeline: [
                {
                  $match: {
                    groupId,
                    revokedAt: { $exists: false },
                    $or: [{ until: null }, { until: { $gt: now } }],
                  },
                },
                { $limit: 1 },
              ],
              as: "ban",
            },
          },
          {
            $match: {
              "membership.0": { $exists: false },
              "block.0": { $exists: false },
              "ban.0": { $exists: false },
            },
          },
          { $sort: { clerkId: 1 } },
          { $limit: page.limit + 1 },
          {
            $project: {
              _id: 0,
              clerkId: 1,
              name: 1,
              email: 1,
              username: 1,
              avatarUrl: 1,
              presence: 1,
            },
          },
        ],
        this.opts,
      )
      .toArray();
  }
  async create(group: GroupRecord) {
    await this.groups.insertOne({ ...group }, this.opts);
    return group;
  }
  async save(group: GroupRecord) {
    await this.groups.replaceOne(
      { id: group.id, type: { $in: ["PRIVATE", "PUBLIC"] } },
      group,
      this.opts,
    );
    return group;
  }
  /** Caller holds the Group lock in the same transaction as every dependent deletion. */
  async remove(groupId: string) {
    const events = await this.events
      .find(
        { groupId, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
        { ...this.opts, projection: { _id: 0, id: 1 } },
      )
      .toArray();
    // ponytail: one atomic transaction; use a separately designed deletion job if group size exceeds MongoDB transaction limits.
    const records = new EventRecordsRepository(this.db, this.opts.session);
    for (const { id: eventId } of events) await records.remove(eventId as string);
    await this.memberships.deleteMany({ groupId }, this.opts);
    await this.bans.deleteMany({ groupId }, this.opts);
    await this.db.collection(COLLECTIONS.GROUP_ASSETS).deleteMany({ groupId }, this.opts);
    // GLOBAL skill snapshots are personal data shared with other Groups, not Group-owned history.
    await this.db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .deleteMany({ scope: "GROUP", groupId }, this.opts);
    await this.db
      .collection(COLLECTIONS.RATING_EVENTS)
      .deleteMany({ scope: "GROUP", groupId, tableId: { $exists: true } }, this.opts);
    await this.db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .deleteMany({ href: { $regex: `^/(?:groups|moderation)/${groupId}(?:[/?#]|$)` } }, this.opts);
    await this.groups.deleteOne({ id: groupId, type: { $in: ["PRIVATE", "PUBLIC"] } }, this.opts);
    return { id: groupId, eventIds: events.map((event) => event.id as string) };
  }
  membership(groupId: string, userId: string) {
    return this.memberships.findOne({ groupId, userId }, { ...this.opts, projection: { _id: 0 } });
  }
  async saveMembership(row: GroupMembership) {
    await this.memberships.replaceOne({ groupId: row.groupId, userId: row.userId }, row, {
      ...this.opts,
      upsert: true,
    });
    return row;
  }
  ban(groupId: string, userId: string) {
    return this.bans.findOne({ groupId, userId }, { ...this.opts, projection: { _id: 0 } });
  }
  async saveBan(row: GroupBan) {
    await this.bans.replaceOne({ groupId: row.groupId, userId: row.userId }, row, {
      ...this.opts,
      upsert: true,
    });
    return row;
  }
  countMembers(groupId: string) {
    return this.memberships.countDocuments({ groupId, status: "ACCEPTED" }, this.opts);
  }
  countEvents(groupId: string) {
    return this.events.countDocuments(
      { groupId, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
      this.opts,
    );
  }
  private peopleSearch(query?: string) {
    if (!query) return [];
    const $regex = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [
      {
        $lookup: {
          from: COLLECTIONS.USERS,
          localField: "userId",
          foreignField: "clerkId",
          as: "searchProfile",
        },
      },
      {
        $match: {
          $or: ["name", "username", "email"].map((field) => ({
            [`searchProfile.${field}`]: { $regex, $options: "i" },
          })),
        },
      },
    ];
  }
  members(groupId: string, status: "ACCEPTED" | "PENDING", page: GroupRecordPage) {
    const filter: Filter<GroupMembership> = { groupId, status };
    if (page.cursor && page.cursor !== "owner") {
      const [createdAt, id] = page.cursor.split("|");
      filter.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }];
    }
    return this.memberships
      .aggregate<GroupMembership>(
        [
          { $match: filter },
          ...this.peopleSearch(page.query),
          { $sort: { createdAt: -1, id: -1 } },
          { $limit: page.limit + 1 },
          { $project: { _id: 0, searchProfile: 0 } },
        ],
        this.opts,
      )
      .toArray();
  }
  activeBans(groupId: string, now: string, page: GroupRecordPage) {
    const filter: Filter<GroupBan> = {
      groupId,
      revokedAt: { $exists: false },
      $and: [{ $or: [{ until: null }, { until: { $gt: now } }] }],
    };
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      filter.$and?.push({
        $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }],
      });
    }
    return this.bans
      .aggregate<GroupBan>(
        [
          { $match: filter },
          ...this.peopleSearch(page.query),
          { $sort: { createdAt: -1, id: -1 } },
          { $limit: page.limit + 1 },
          { $project: { _id: 0, searchProfile: 0 } },
        ],
        this.opts,
      )
      .toArray();
  }
  async list(
    userId: string,
    scope: "mine" | "public" | "moderation",
    page: GroupRecordPage,
    now: string,
  ) {
    const pipeline: Record<string, unknown>[] = [
      { $match: { type: { $in: ["PRIVATE", "PUBLIC"] } } },
    ];
    if (scope === "public")
      pipeline.push({ $match: { type: "PUBLIC", approved: { $exists: true } } });
    if (scope === "moderation")
      pipeline.push({ $match: { type: "PUBLIC", reviewStatus: "PENDING" } });
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      pipeline.push({
        $match: { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] },
      });
    }
    if (page.query) {
      const $regex = page.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pipeline.push({
        $match:
          scope === "public"
            ? { "approved.name": { $regex, $options: "i" } }
            : {
                $or: [
                  { "approved.name": { $regex, $options: "i" } },
                  { "proposal.name": { $regex, $options: "i" } },
                ],
              },
      });
    }
    pipeline.push({
      $lookup: {
        from: COLLECTIONS.GROUP_MEMBERSHIPS,
        let: { group: "$id" },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ["$groupId", "$$group"] }, { $eq: ["$userId", userId] }] },
            },
          },
          { $project: { _id: 0 } },
        ],
        as: "viewerRows",
      },
    });
    if (scope === "mine")
      pipeline.push({
        $match: {
          $or: (page.roles ?? ["admin", "invited", "accepted"]).length
            ? (page.roles ?? ["admin", "invited", "accepted"]).map((role) =>
                role === "admin"
                  ? { adminUserId: userId }
                  : {
                      viewerRows: {
                        $elemMatch:
                          role === "accepted"
                            ? { status: "ACCEPTED" }
                            : { status: "PENDING", kind: "INVITATION" },
                      },
                    },
              )
            : [{ id: { $in: [] } }],
        },
      });
    if (scope !== "moderation")
      pipeline.push(
        {
          $lookup: {
            from: COLLECTIONS.GROUP_BANS,
            let: { group: "$id" },
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
            as: "viewerBans",
          },
        },
        { $match: { "viewerBans.0": { $exists: false } } },
      );
    pipeline.push(
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: page.limit + 1 },
      { $project: { _id: 0, transactionLock: 0, viewerRows: 0, viewerBans: 0 } },
    );
    return this.groups.aggregate<GroupRecord>(pipeline, this.opts).toArray();
  }
}
