import type {
  CreateGroupInput,
  Group,
  GroupInvitation,
  GroupResponse,
  User,
} from "@board-game-organizer/schemas";
import type { GroupsRepository } from "@/app/lib/groups.repository";
import type { RelationshipRepository } from "@/app/lib/relationship.repository";
import type { UsersRepository } from "@/app/lib/users.repository";

export class GroupError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class GroupService {
  constructor(
    private groups: GroupsRepository,
    private users: UsersRepository,
    private relationships: RelationshipRepository,
  ) {}

  private async requireGroup(groupId: string): Promise<Group> {
    const group = await this.groups.findById(groupId);
    if (!group || group.archivedAt) throw new GroupError(404, "Group not found");
    return group;
  }

  private response(
    group: Group,
    invitations: GroupInvitation[],
    viewerId: string,
    users: User[],
  ): GroupResponse {
    const canSeeMembers =
      group.adminUserId === viewerId ||
      invitations.some(
        (invitation) => invitation.inviteeUserId === viewerId && invitation.status === "ACCEPTED",
      );
    return {
      id: group.id,
      adminUserId: group.adminUserId,
      name: group.name,
      isPublic: group.isPublic,
      memberCount: 1 + invitations.filter((invitation) => invitation.status === "ACCEPTED").length,
      invitations: invitations
        .filter(
          (invitation) =>
            group.adminUserId === viewerId ||
            (canSeeMembers && invitation.status === "ACCEPTED") ||
            invitation.inviteeUserId === viewerId,
        )
        .map(({ id, groupId, inviteeUserId, status, createdAt, updatedAt }) => ({
          id,
          groupId,
          inviteeUserId,
          status,
          createdAt,
          updatedAt,
        })),
      memberProfiles: canSeeMembers
        ? users
            .filter(
              (user) =>
                user.clerkId === group.adminUserId ||
                invitations.some(
                  (invitation) =>
                    invitation.inviteeUserId === user.clerkId && invitation.status === "ACCEPTED",
                ),
            )
            .map((user) => ({
              id: user.clerkId,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl ?? null,
            }))
        : [],
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  private async responseForGroup(group: Group, invitations: GroupInvitation[], viewerId: string) {
    const userIds = [
      group.adminUserId,
      ...invitations
        .filter((invitation) => invitation.status === "ACCEPTED")
        .map((invitation) => invitation.inviteeUserId),
    ];
    return this.response(group, invitations, viewerId, await this.users.findByIds(userIds));
  }

  private async assertFriend(adminUserId: string, inviteeUserId: string) {
    if (adminUserId === inviteeUserId) throw new GroupError(400, "Admin is already a member");
    if (!(await this.users.findById(inviteeUserId))) throw new GroupError(404, "User not found");
    if (await this.relationships.isBlocked(adminUserId, inviteeUserId))
      throw new GroupError(404, "User not found");
    if (!(await this.relationships.isFriend(adminUserId, inviteeUserId)))
      throw new GroupError(400, "Only friends can be invited to a group");
  }

  async create(userId: string, input: CreateGroupInput) {
    for (const invitedUserId of input.invitedUserIds)
      await this.assertFriend(userId, invitedUserId);
    const group = await this.groups.create(userId, input.name, input.isPublic);
    for (const invitedUserId of input.invitedUserIds)
      await this.groups.invite(group.id, userId, invitedUserId);
    return this.responseForGroup(group, await this.groups.listInvitations(group.id), userId);
  }

  async list(userId: string) {
    const invitations = await this.groups.listInvitationsForUser(userId);
    const groups = await this.groups.listForUser(
      userId,
      invitations.map((i) => i.groupId),
    );
    const allInvitations = await this.groups.listInvitationsForGroups(
      groups.map((group) => group.id),
    );
    const profiles = await this.users.findByIds([
      ...new Set([
        ...groups.map((group) => group.adminUserId),
        ...allInvitations
          .filter((invitation) => invitation.status === "ACCEPTED")
          .map((invitation) => invitation.inviteeUserId),
      ]),
    ]);
    return groups.map((group) =>
      this.response(
        group,
        allInvitations.filter((invitation) => invitation.groupId === group.id),
        userId,
        profiles,
      ),
    );
  }

  async detail(userId: string, groupId: string) {
    const group = await this.requireGroup(groupId);
    const invitations = await this.groups.listInvitations(groupId);
    if (
      group.adminUserId !== userId &&
      !invitations.some(
        (i) => i.inviteeUserId === userId && (i.status === "PENDING" || i.status === "ACCEPTED"),
      )
    ) {
      throw new GroupError(404, "Group not found");
    }
    return this.responseForGroup(group, invitations, userId);
  }

  async update(userId: string, groupId: string, input: CreateGroupInput) {
    if ((await this.groups.serializeMembershipChange(groupId)).matchedCount === 0) {
      throw new GroupError(404, "Group not found");
    }
    const group = await this.requireGroup(groupId);
    if (group.adminUserId !== userId) throw new GroupError(403, "Only group admin can edit group");
    const existing = await this.groups.listInvitations(groupId);
    const selected = new Set(input.invitedUserIds);
    for (const id of input.invitedUserIds) {
      if (
        !existing.some(
          (invitation) => invitation.inviteeUserId === id && invitation.status !== "DECLINED",
        )
      ) {
        await this.assertFriend(userId, id);
      }
    }
    for (const invitation of existing) {
      if (!selected.has(invitation.inviteeUserId) || invitation.status === "DECLINED") {
        await this.groups.remove(groupId, invitation.inviteeUserId);
      }
    }
    for (const id of input.invitedUserIds) {
      if (
        !existing.some(
          (invitation) => invitation.inviteeUserId === id && invitation.status !== "DECLINED",
        )
      ) {
        await this.groups.invite(groupId, userId, id);
      }
    }
    const updated = await this.groups.update(groupId, userId, input.name, input.isPublic);
    if (!updated) throw new GroupError(409, "Group changed concurrently");
    return this.responseForGroup(updated, await this.groups.listInvitations(groupId), userId);
  }

  async archive(userId: string, groupId: string) {
    const group = await this.requireGroup(groupId);
    if (group.adminUserId !== userId)
      throw new GroupError(403, "Only group admin can delete group");
    if ((await this.groups.archive(groupId, userId)).matchedCount === 0)
      throw new GroupError(409, "Group changed concurrently");
  }

  async respond(userId: string, invitationId: string, decision: "accept" | "decline") {
    const invitation = await this.groups.findInvitation(invitationId);
    if (!invitation || invitation.inviteeUserId !== userId || invitation.status !== "PENDING")
      throw new GroupError(404, "Invitation not found");
    if ((await this.groups.serializeMembershipChange(invitation.groupId)).matchedCount === 0)
      throw new GroupError(404, "Group not found");
    const updated = await this.groups.respond(
      invitationId,
      userId,
      decision === "accept" ? "ACCEPTED" : "DECLINED",
    );
    if (!updated) throw new GroupError(409, "Invitation changed concurrently");
    return this.detail(userId, invitation.groupId).catch((error: unknown) => {
      // Declining hides the invitation immediately from the caller's group list.
      if (decision === "decline" && error instanceof GroupError && error.status === 404)
        return null;
      throw error;
    });
  }

  async leave(userId: string, groupId: string) {
    if ((await this.groups.serializeMembershipChange(groupId)).matchedCount === 0)
      throw new GroupError(404, "Group not found");
    const group = await this.requireGroup(groupId);
    if (group.adminUserId === userId) throw new GroupError(403, "Admin cannot leave their group");
    if ((await this.groups.remove(groupId, userId)).deletedCount === 0)
      throw new GroupError(404, "Membership not found");
  }

  /** Call in the same transaction as a match mutation. Never authorize with a stale UI selection. */
  async requireMembers(groupId: string, userIds: string[], lock = false) {
    if (lock && (await this.groups.serializeMembershipChange(groupId)).matchedCount === 0)
      throw new GroupError(409, "Group no longer available");
    const group = await this.requireGroup(groupId);
    const accepted = new Set(
      (await this.groups.listAcceptedMembers(groupId, userIds)).map(
        (invitation) => invitation.inviteeUserId,
      ),
    );
    if (userIds.some((userId) => userId !== group.adminUserId && !accepted.has(userId)))
      throw new GroupError(409, "Every participant must be an accepted group member");
  }
}
