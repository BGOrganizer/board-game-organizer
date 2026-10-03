import { randomUUID } from "node:crypto";
import type { Group, GroupInvitation, GroupInvitationStatus } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

type StoredGroup = Group & { membershipRevision?: number };

/** Group membership is held in invitations; the administrator is always a member. */
export class GroupsRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get groups() {
    return this.db.collection<StoredGroup>(COLLECTIONS.GROUPS);
  }
  private get invitations() {
    return this.db.collection<GroupInvitation>(COLLECTIONS.GROUP_INVITATIONS);
  }
  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  async create(adminUserId: string, name: string, isPublic: boolean): Promise<Group> {
    const now = new Date().toISOString();
    const group: Group = {
      id: randomUUID(),
      adminUserId,
      name,
      isPublic,
      createdAt: now,
      updatedAt: now,
    };
    await this.groups.insertOne(group, this.opts);
    return group;
  }

  findById(id: string) {
    return this.groups.findOne(
      { id },
      { projection: { _id: 0, membershipRevision: 0 }, ...this.opts },
    );
  }

  listForUser(adminUserId: string, invitedGroupIds: string[]) {
    return this.groups
      .find(
        {
          $or: [{ adminUserId }, { id: { $in: invitedGroupIds } }],
          archivedAt: { $exists: false },
        },
        { projection: { _id: 0, membershipRevision: 0 }, ...this.opts },
      )
      .sort({ createdAt: -1 })
      .toArray();
  }

  listInvitationsForGroups(groupIds: string[]) {
    return this.invitations
      .find({ groupId: { $in: groupIds } }, { projection: { _id: 0 }, ...this.opts })
      .toArray();
  }

  listInvitations(groupId: string) {
    return this.invitations
      .find({ groupId }, { projection: { _id: 0 }, ...this.opts })
      .sort({ createdAt: 1 })
      .toArray();
  }

  listInvitationsForUser(inviteeUserId: string) {
    return this.invitations
      .find(
        { inviteeUserId, status: { $in: ["PENDING", "ACCEPTED"] } },
        { projection: { _id: 0 }, ...this.opts },
      )
      .toArray();
  }

  findInvitation(id: string) {
    return this.invitations.findOne({ id }, { projection: { _id: 0 }, ...this.opts });
  }

  findMembership(groupId: string, userId: string) {
    return this.invitations.findOne(
      { groupId, inviteeUserId: userId, status: "ACCEPTED" },
      { projection: { _id: 0 }, ...this.opts },
    );
  }

  async listAcceptedMembers(groupId: string, userIds: string[]) {
    if (!userIds.length) return [];
    return this.invitations
      .find(
        { groupId, inviteeUserId: { $in: userIds }, status: "ACCEPTED" },
        { projection: { inviteeUserId: 1, _id: 0 }, ...this.opts },
      )
      .toArray();
  }

  /** All membership mutations and match confirmation write this document first. */
  serializeMembershipChange(id: string) {
    return this.groups.updateOne(
      { id, archivedAt: { $exists: false } },
      { $inc: { membershipRevision: 1 } },
      this.opts,
    );
  }

  update(id: string, adminUserId: string, name: string, isPublic: boolean) {
    return this.groups.findOneAndUpdate(
      { id, adminUserId, archivedAt: { $exists: false } },
      { $set: { name, isPublic, updatedAt: new Date().toISOString() } },
      { returnDocument: "after", projection: { _id: 0, membershipRevision: 0 }, ...this.opts },
    );
  }

  archive(id: string, adminUserId: string) {
    const now = new Date().toISOString();
    return this.groups.updateOne(
      { id, adminUserId, archivedAt: { $exists: false } },
      { $set: { archivedAt: now, updatedAt: now } },
      this.opts,
    );
  }

  async invite(groupId: string, inviterUserId: string, inviteeUserId: string) {
    const now = new Date().toISOString();
    const invitation: GroupInvitation = {
      id: randomUUID(),
      groupId,
      inviterUserId,
      inviteeUserId,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };
    await this.invitations.insertOne(invitation, this.opts);
    return invitation;
  }

  respond(
    id: string,
    inviteeUserId: string,
    status: Extract<GroupInvitationStatus, "ACCEPTED" | "DECLINED">,
  ) {
    const now = new Date().toISOString();
    return this.invitations.findOneAndUpdate(
      { id, inviteeUserId, status: "PENDING" },
      { $set: { status, respondedAt: now, updatedAt: now } },
      { returnDocument: "after", ...this.opts },
    );
  }

  removeById(id: string, groupId: string) {
    return this.invitations.deleteOne({ id, groupId }, this.opts);
  }

  remove(groupId: string, inviteeUserId: string) {
    return this.invitations.deleteOne({ groupId, inviteeUserId }, this.opts);
  }
}
