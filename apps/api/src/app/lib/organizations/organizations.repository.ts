import {
  type Event,
  type Organization,
  type OrganizationListRole,
  type OrganizationMembership,
  organizationListRoles,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db, Filter } from "mongodb";
import { COLLECTIONS } from "../db";
import { organizationRoleFilter } from "./organization-list-filter";

export type CommunityPage = { limit: number; cursor?: string; query?: string };
export type OrganizationListRow = Organization & {
  viewerMembership?: OrganizationMembership;
  memberCount: number;
};

export class OrganizationsRepository {
  private organizations;
  private memberships;
  private events;
  private opts;

  constructor(db: Db, session?: ClientSession) {
    this.organizations = db.collection<Organization & { transactionLock?: number }>(
      COLLECTIONS.ORGANIZATIONS,
    );
    this.memberships = db.collection<OrganizationMembership>(COLLECTIONS.ORGANIZATION_MEMBERSHIPS);
    this.events = db.collection<Event>(COLLECTIONS.EVENTS);
    this.opts = session ? { session } : {};
  }

  find(id: string) {
    return this.organizations.findOne(
      { id },
      { ...this.opts, projection: { _id: 0, transactionLock: 0 } },
    );
  }

  /** Membership changes and event booking/closure always take this lock first. */
  lock(id: string) {
    return this.organizations.findOneAndUpdate(
      { id },
      { $inc: { transactionLock: 1 } },
      {
        ...this.opts,
        returnDocument: "after",
        projection: { _id: 0, transactionLock: 0 },
      },
    );
  }

  async create(organization: Organization) {
    await this.organizations.insertOne(organization, this.opts);
    return organization;
  }

  async save(organization: Organization) {
    await this.organizations.replaceOne({ id: organization.id }, organization, this.opts);
    return organization;
  }

  async list(
    userId: string,
    scope: "mine" | "public" | "moderation",
    page: CommunityPage,
    roles: readonly OrganizationListRole[] = organizationListRoles,
  ) {
    const pipeline: Record<string, unknown>[] = [];
    if (scope === "moderation")
      pipeline.push({ $match: { reviewStatus: "PENDING", proposal: { $exists: true } } });
    else
      pipeline.push({
        $match: { $or: [{ approved: { $exists: true } }, { adminUserId: userId }] },
      });
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      pipeline.push({
        $match: { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] },
      });
    }
    if (page.query) {
      const name = { $regex: page.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      pipeline.push({
        $match:
          scope === "public"
            ? { "approved.name": name }
            : {
                $or: [
                  { "approved.name": name },
                  {
                    ...(scope === "moderation" ? {} : { adminUserId: userId }),
                    "proposal.name": name,
                  },
                ],
              },
      });
    }
    pipeline.push(
      { $sort: { createdAt: -1, id: -1 } },
      {
        $lookup: {
          from: COLLECTIONS.ORGANIZATION_MEMBERSHIPS,
          localField: "id",
          foreignField: "organizationId",
          pipeline: [{ $match: { userId } }, { $project: { _id: 0 } }],
          as: "viewerMembershipRows",
        },
      },
    );
    if (scope === "mine") pipeline.push({ $match: organizationRoleFilter(userId, roles) });
    if (scope === "public")
      pipeline.push({
        $match: {
          approved: { $exists: true },
          "viewerMembershipRows.status": { $ne: "EXCLUDED" },
        },
      });
    pipeline.push(
      { $limit: page.limit + 1 },
      {
        $lookup: {
          from: COLLECTIONS.ORGANIZATION_MEMBERSHIPS,
          localField: "id",
          foreignField: "organizationId",
          pipeline: [{ $match: { status: "ACCEPTED" } }, { $count: "count" }],
          as: "memberCounts",
        },
      },
      {
        $addFields: {
          viewerMembership: { $arrayElemAt: ["$viewerMembershipRows", 0] },
          memberCount: {
            $add: [1, { $ifNull: [{ $arrayElemAt: ["$memberCounts.count", 0] }, 0] }],
          },
        },
      },
      { $project: { _id: 0, transactionLock: 0, viewerMembershipRows: 0, memberCounts: 0 } },
    );
    return this.organizations.aggregate<OrganizationListRow>(pipeline, this.opts).toArray();
  }

  findMembership(organizationId: string, userId: string) {
    return this.memberships.findOne(
      { organizationId, userId },
      { ...this.opts, projection: { _id: 0 } },
    );
  }

  async saveMembership(membership: OrganizationMembership) {
    await this.memberships.replaceOne(
      { organizationId: membership.organizationId, userId: membership.userId },
      membership,
      { ...this.opts, upsert: true },
    );
    return membership;
  }

  countMembers(organizationId: string) {
    return this.memberships.countDocuments({ organizationId, status: "ACCEPTED" }, this.opts);
  }

  countPublishedEvents(organizationId: string) {
    return this.events.countDocuments({ organizationId, status: "PUBLISHED" }, this.opts);
  }

  listMemberships(
    organizationId: string,
    statuses: OrganizationMembership["status"][],
    page: CommunityPage,
  ) {
    const filter: Filter<OrganizationMembership> = { organizationId, status: { $in: statuses } };
    if (page.cursor) {
      const [createdAt, id] = page.cursor.split("|");
      filter.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }];
    }
    return this.memberships
      .find(filter, { ...this.opts, projection: { _id: 0 } })
      .sort({ createdAt: -1, id: -1 })
      .limit(page.limit + 1)
      .toArray();
  }
}
