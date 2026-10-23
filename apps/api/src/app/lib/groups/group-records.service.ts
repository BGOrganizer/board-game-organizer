import { randomUUID } from "node:crypto";
import {
  type BanGroupUserInput,
  type CommunityNotificationKind,
  type CreateGroupRecordInput,
  type DecideGroupMembershipInput,
  type DecideGroupReviewInput,
  type EditGroupRecordInput,
  type GroupMembership,
  type GroupPersonResponse,
  type GroupRecord,
  type GroupRecordResponse,
  groupRecordSchema,
} from "@board-game-organizer/schemas";
import {
  canReadGroup,
  groupBanIsActive,
  groupCapabilities,
  groupViewerRole,
  normalizeOrganizationName,
} from "@board-game-organizer/shared";
import { MongoServerError } from "mongodb";
import { CommunityError } from "../community.error";
import type { RelationshipRepository } from "../contacts/relationship.repository";
import { verifyCommunityLocation } from "../locations/community-location";
import { locationTimeZone } from "../locations/location-time-zone";
import type { NotificationsRepository } from "../notifications/notifications.repository";
import { requireBgoModerator } from "../organizations/community-role";
import type { UsersRepository } from "../users/users.repository";
import type { GroupAssetsRepository } from "./group-assets.repository";
import type { GroupLeaderboardRepository } from "./group-leaderboard.repository";
import type { GroupRecordPage, GroupRecordsRepository } from "./group-records.repository";

export class GroupRecordsService {
  constructor(
    private groups: GroupRecordsRepository,
    private assets: GroupAssetsRepository,
    private users: UsersRepository,
    private relationships: RelationshipRepository,
    private notifications: NotificationsRepository,
    private departure: (groupId: string, userId: string, reason: "BAN" | "LEFT") => Promise<void>,
    private assertBanAllowed: (groupId: string, userId: string) => Promise<void>,
    private leaderboards: GroupLeaderboardRepository,
  ) {}
  private async required(id: string, lock = false) {
    const group = lock ? await this.groups.lock(id) : await this.groups.find(id);
    if (!group || (group.type !== "PRIVATE" && group.type !== "PUBLIC"))
      throw new CommunityError(404, "GROUP_NOT_FOUND");
    return group;
  }
  private admin(group: GroupRecord, userId: string) {
    if (group.adminUserId !== userId) throw new CommunityError(403, "GROUP_ADMIN_REQUIRED");
  }
  private async noBan(groupId: string, userId: string) {
    if (groupBanIsActive(await this.groups.ban(groupId, userId), Date.now()))
      throw new CommunityError(403, "GROUP_BANNED");
  }
  private async notify(
    kind: CommunityNotificationKind,
    group: GroupRecord,
    actor: string,
    recipients: string[],
  ) {
    await this.notifications.notifyMany(
      [...new Set(recipients)].map((recipientUserId) => ({
        kind,
        actorUserId: actor,
        recipientUserId,
        resourceName: group.proposal?.name ?? group.approved?.name ?? "",
        resourceHref:
          kind === "group_review_requested" ? `/moderation/${group.id}` : `/groups/${group.id}`,
      })),
    );
  }
  private async response(
    group: GroupRecord,
    userId: string,
    moderator = false,
  ): Promise<GroupRecordResponse> {
    const membership = await this.groups.membership(group.id, userId);
    const ban = await this.groups.ban(group.id, userId);
    if (!canReadGroup(group, userId, membership, ban, Date.now(), moderator))
      throw new CommunityError(404, "GROUP_NOT_FOUND");
    const owner = group.adminUserId === userId;
    const located = { ...group };
    const readableRevisions =
      owner || moderator ? (["approved", "proposal"] as const) : (["approved"] as const);
    for (const key of readableRevisions) {
      const revision = group[key];
      if (revision?.location)
        located[key] = {
          ...revision,
          location: { ...revision.location, timeZone: locationTimeZone(revision.location) },
        };
    }
    const revision = owner || moderator ? (located.proposal ?? located.approved) : located.approved;
    if (!revision) throw new CommunityError(404, "GROUP_NOT_FOUND");
    const capabilities = groupCapabilities(group, userId, membership, ban, Date.now());
    const asset = revision.logoAssetId ? await this.assets.find(revision.logoAssetId) : null;
    const { proposal, reviewStatus, rejectionReason, reservedNames, ...safe } = located;
    return {
      ...safe,
      ...(owner || moderator
        ? { proposal, reviewStatus, rejectionReason, reservedNames }
        : { reservedNames: [] }),
      ...capabilities,
      name: revision.name,
      ...(revision.logoAssetId ? { logoAssetId: revision.logoAssetId } : {}),
      ...(revision.location ? { location: revision.location } : {}),
      logo: asset?.thumbnailBase64 ? `data:image/webp;base64,${asset.thumbnailBase64}` : null,
      role: groupViewerRole(group, userId, membership),
      myMembership: membership,
      memberCount: 1 + (await this.groups.countMembers(group.id)),
      eventCount: capabilities.canViewEvents ? await this.groups.countEvents(group.id) : null,
    };
  }
  async rankings(
    userId: string,
    id: string,
    page: { gameId?: number; cursor: number; limit: number; query?: string },
  ) {
    const group = await this.detail(userId, id);
    if (!group.canViewRankings) throw new CommunityError(403, "GROUP_MEMBER_REQUIRED");
    if (!page.gameId) {
      const games = await this.leaderboards.games(id, page.cursor, page.limit, page.query);
      return { games: games.games, players: [], nextCursor: games.nextCursor };
    }
    const { rows, nextCursor } = await this.leaderboards.players(
      id,
      page.gameId,
      page.cursor,
      page.limit,
    );
    return {
      games: [],
      players: rows.map((row) => ({
        userId: row._id,
        name: row.name,
        username: row.username,
        avatarUrl: row.avatarUrl,
        gamesPlayed: row.gamesPlayed,
        gamesWon: row.gamesWon,
        nd: row.nd,
        rating: row.rating ? 500 + row.rating.conservativeScore : null,
        provisional: row.rating ? row.rating.gamesPlayed < 5 : false,
        left: row.left,
      })),
      nextCursor,
    };
  }
  async detail(userId: string, id: string) {
    return this.response(await this.required(id), userId);
  }
  async moderationDetail(userId: string, id: string) {
    await requireBgoModerator(userId);
    const group = await this.required(id);
    if (group.type !== "PUBLIC") throw new CommunityError(404, "GROUP_NOT_FOUND");
    return this.response(group, userId, true);
  }
  async list(userId: string, scope: "mine" | "public" | "moderation", page: GroupRecordPage) {
    if (scope === "moderation") await requireBgoModerator(userId);
    const rows = await this.groups.list(userId, scope, page, new Date().toISOString());
    const items: GroupRecordResponse[] = [];
    for (const row of rows.slice(0, page.limit))
      items.push(await this.response(row, userId, scope === "moderation"));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  private async releaseLogos(previous: GroupRecord | undefined, next: GroupRecord) {
    const retained = new Set([next.approved?.logoAssetId, next.proposal?.logoAssetId]);
    for (const id of new Set([previous?.approved?.logoAssetId, previous?.proposal?.logoAssetId])) {
      if (id && !retained.has(id)) await this.assets.expireUnused(id, next.id);
    }
  }
  async save(userId: string, input: CreateGroupRecordInput | EditGroupRecordInput, id?: string) {
    const current = id ? await this.required(id, true) : undefined;
    if (current) {
      this.admin(current, userId);
      if (!("version" in input) || input.version !== current.version)
        throw new CommunityError(409, "GROUP_CHANGED");
    }
    const type = current?.type ?? ("type" in input ? input.type : undefined);
    if (!type) throw new CommunityError(400, "INVALID_GROUP_TYPE");
    const invites = "invitedUserIds" in input ? input.invitedUserIds : [];
    if (type === "PUBLIC" && (invites.length || !input.logoAssetId || !input.location))
      throw new CommunityError(400, "PUBLIC_GROUP_REQUIRES_LOGO_VENUE");
    for (const target of invites) await this.friend(userId, target);
    const groupId = current?.id ?? randomUUID();
    const location = input.location
      ? await verifyCommunityLocation(
          input.location,
          [current?.approved?.location, current?.proposal?.location].filter(
            (value) => value !== undefined,
          ),
        )
      : undefined;
    if (input.logoAssetId && !(await this.assets.claim(input.logoAssetId, userId, groupId)))
      throw new CommunityError(400, "INVALID_LOGO");
    const revision = {
      name: input.name,
      ...(input.logoAssetId ? { logoAssetId: input.logoAssetId } : {}),
      ...(location ? { location } : {}),
    };
    const at = new Date().toISOString();
    const next = groupRecordSchema.parse({
      id: groupId,
      adminUserId: userId,
      type,
      ...(type === "PRIVATE"
        ? { approved: revision }
        : {
            ...(current?.approved ? { approved: current.approved } : {}),
            proposal: revision,
            reviewStatus: "PENDING",
          }),
      reservedNames:
        type === "PUBLIC"
          ? [
              ...new Set([
                normalizeOrganizationName(revision.name),
                ...(current?.approved ? [normalizeOrganizationName(current.approved.name)] : []),
              ]),
            ]
          : [],
      version: (current?.version ?? 0) + 1,
      createdAt: current?.createdAt ?? at,
      updatedAt: at,
    });
    try {
      if (current) await this.groups.save(next);
      else await this.groups.create(next);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        throw new CommunityError(409, "GROUP_NAME_TAKEN");
      throw error;
    }
    await this.releaseLogos(current, next);
    if (type === "PUBLIC")
      await this.notify("group_review_requested", next, userId, await this.users.moderatorIds());
    else for (const target of invites) await this.pending(next, userId, target, "INVITATION");
    return this.response(next, userId);
  }
  async review(userId: string, id: string, input: DecideGroupReviewInput) {
    await requireBgoModerator(userId);
    const current = await this.required(id, true);
    if (
      current.type !== "PUBLIC" ||
      !current.proposal ||
      current.reviewStatus !== "PENDING" ||
      current.version !== input.version
    )
      throw new CommunityError(409, "GROUP_CHANGED");
    const at = new Date().toISOString();
    const { proposal, reviewStatus: _reviewStatus, rejectionReason: _reason, ...base } = current;
    const next: GroupRecord =
      input.decision === "approve"
        ? {
            ...base,
            approved: proposal,
            reservedNames: [normalizeOrganizationName(proposal.name)],
            version: current.version + 1,
            updatedAt: at,
          }
        : {
            ...current,
            reviewStatus: "REJECTED",
            rejectionReason: input.reason,
            version: current.version + 1,
            updatedAt: at,
          };
    await this.groups.save(next);
    await this.releaseLogos(current, next);
    await this.notify("group_reviewed", next, userId, [next.adminUserId]);
    return this.response(next, userId, true);
  }
  private async friend(actor: string, target: string) {
    if (actor === target) throw new CommunityError(409, "ALREADY_GROUP_MEMBER");
    if (!(await this.users.findById(target))) throw new CommunityError(404, "USER_NOT_FOUND");
    if (
      !(await this.relationships.isFriend(actor, target)) ||
      (await this.relationships.isBlocked(actor, target))
    )
      throw new CommunityError(403, "CONFIRMED_FRIEND_REQUIRED");
  }
  async invite(userId: string, id: string, target: string) {
    const group = await this.required(id, true);
    this.admin(group, userId);
    if (!group.approved) throw new CommunityError(409, "GROUP_NOT_APPROVED");
    await this.friend(userId, target);
    return this.pending(group, userId, target, "INVITATION");
  }
  async request(userId: string, id: string) {
    const group = await this.required(id, true);
    if (group.type !== "PUBLIC" || !group.approved)
      throw new CommunityError(404, "GROUP_NOT_FOUND");
    return this.pending(group, userId, userId, "REQUEST");
  }
  private async pending(
    group: GroupRecord,
    actor: string,
    target: string,
    kind: GroupMembership["kind"],
  ) {
    if (target === group.adminUserId) throw new CommunityError(409, "ALREADY_GROUP_MEMBER");
    await this.noBan(group.id, target);
    const current = await this.groups.membership(group.id, target);
    if (current?.status === "PENDING" || current?.status === "ACCEPTED")
      throw new CommunityError(409, "MEMBERSHIP_ALREADY_ACTIVE");
    const at = new Date().toISOString();
    const row: GroupMembership = {
      id: current?.id ?? randomUUID(),
      groupId: group.id,
      userId: target,
      kind,
      status: "PENDING",
      version: (current?.version ?? 0) + 1,
      createdAt: at,
      updatedAt: at,
    };
    await this.groups.saveMembership(row);
    if (kind === "INVITATION")
      await this.notifications.notifyMany([
        {
          kind: "group_invitation",
          groupName: group.approved?.name ?? "",
          groupId: group.id,
          actorUserId: actor,
          recipientUserId: target,
        },
      ]);
    else await this.notify("group_membership_requested", group, actor, [group.adminUserId]);
    return row;
  }
  async membershipAction(
    userId: string,
    id: string,
    target: string,
    input: DecideGroupMembershipInput,
  ) {
    const group = await this.required(id, true);
    if (target === group.adminUserId) throw new CommunityError(403, "GROUP_ADMIN_CANNOT_LEAVE");
    await this.noBan(id, target);
    const current = await this.groups.membership(id, target);
    if (!current) throw new CommunityError(404, "MEMBERSHIP_NOT_FOUND");
    if (current.version !== input.version) throw new CommunityError(409, "MEMBERSHIP_CHANGED");
    const own = userId === target,
      admin = userId === group.adminUserId;
    let status: GroupMembership["status"];
    if (input.action === "accept" || input.action === "decline") {
      if (!own || current.kind !== "INVITATION")
        throw new CommunityError(403, "INVITATION_RECIPIENT_REQUIRED");
      if (current.status !== "PENDING") throw new CommunityError(409, "MEMBERSHIP_CHANGED");
      status = input.action === "accept" ? "ACCEPTED" : "DECLINED";
    } else if (input.action === "approve" || input.action === "reject") {
      if (!admin || current.kind !== "REQUEST")
        throw new CommunityError(403, "GROUP_ADMIN_REQUIRED");
      if (current.status !== "PENDING") throw new CommunityError(409, "MEMBERSHIP_CHANGED");
      status = input.action === "approve" ? "ACCEPTED" : "DECLINED";
    } else if (input.action === "cancel") {
      if (
        !own ||
        (current.status !== "ACCEPTED" &&
          !(current.status === "PENDING" && current.kind === "REQUEST"))
      )
        throw new CommunityError(403, "MEMBERSHIP_ACTION_FORBIDDEN");
      status = "LEFT";
    } else {
      if (!admin) throw new CommunityError(403, "GROUP_ADMIN_REQUIRED");
      if (current.status !== "PENDING" && current.status !== "ACCEPTED")
        throw new CommunityError(409, "MEMBERSHIP_CHANGED");
      status = "LEFT";
    }
    const next = {
      ...current,
      status,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.groups.saveMembership(next);
    if (status === "LEFT") await this.departure(id, target, "LEFT");
    await this.notify("group_membership_updated", group, userId, [
      own ? group.adminUserId : target,
    ]);
    return next;
  }
  async ban(userId: string, id: string, input: BanGroupUserInput) {
    const group = await this.required(id, true);
    this.admin(group, userId);
    if (input.userId === userId) throw new CommunityError(403, "GROUP_ADMIN_CANNOT_LEAVE");
    if (!(await this.users.findById(input.userId))) throw new CommunityError(404, "USER_NOT_FOUND");
    if (input.until !== null && Date.parse(input.until) <= Date.now())
      throw new CommunityError(400, "BAN_EXPIRY_MUST_BE_FUTURE");
    await this.assertBanAllowed(id, input.userId);
    const at = new Date().toISOString();
    const row = {
      id: randomUUID(),
      groupId: id,
      userId: input.userId,
      adminUserId: userId,
      until: input.until === null ? null : new Date(input.until).toISOString(),
      createdAt: at,
      updatedAt: at,
    };
    await this.groups.saveBan(row);
    const membership = await this.groups.membership(id, input.userId);
    if (membership)
      await this.groups.saveMembership({
        ...membership,
        status: "LEFT",
        version: membership.version + 1,
        updatedAt: at,
      });
    await this.departure(id, input.userId, "BAN");
    await this.notify("group_banned", group, userId, [input.userId]);
    return row;
  }
  async revoke(userId: string, id: string, target: string) {
    const group = await this.required(id, true);
    this.admin(group, userId);
    const ban = await this.groups.ban(id, target);
    if (!ban || ban.revokedAt) throw new CommunityError(404, "BAN_NOT_FOUND");
    const next = {
      ...ban,
      revokedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.groups.saveBan(next);
    await this.notify("group_ban_revoked", group, userId, [target]);
    return next;
  }
  async members(
    userId: string,
    id: string,
    mode: "accepted" | "pending" | "banned",
    page: GroupRecordPage,
  ) {
    const group = await this.required(id);
    const membership = await this.groups.membership(id, userId),
      ban = await this.groups.ban(id, userId);
    if (!canReadGroup(group, userId, membership, ban, Date.now()))
      throw new CommunityError(404, "GROUP_NOT_FOUND");
    const capabilities = groupCapabilities(group, userId, membership, ban, Date.now());
    const admin = group.adminUserId === userId;
    if (!capabilities.canViewMembers || (mode !== "accepted" && !admin))
      throw new CommunityError(403, "GROUP_MEMBER_REQUIRED");
    let firstOwner = mode === "accepted" && !page.cursor;
    if (firstOwner && page.query) {
      const owner = await this.users.findById(group.adminUserId);
      const query = page.query.toLowerCase();
      firstOwner = [owner?.name, owner?.username, owner?.email].some((value) =>
        value?.toLowerCase().includes(query),
      );
    }
    const take = page.limit - Number(firstOwner);
    const rows =
      mode === "banned"
        ? await this.groups.activeBans(id, new Date().toISOString(), page)
        : await this.groups.members(id, mode === "pending" ? "PENDING" : "ACCEPTED", {
            ...page,
            limit: Math.max(1, take),
          });
    const selected = rows.slice(0, take);
    const ids = [...selected.map((row) => row.userId), ...(firstOwner ? [group.adminUserId] : [])];
    const profiles = await this.users.findByIds(ids);
    const social = capabilities.canSocialInteract
      ? await this.relationships.memberStates(userId, ids)
      : new Map();
    const item = (target: string, row: (typeof selected)[number] | null): GroupPersonResponse => {
      const profile = profiles.find((entry) => entry.clerkId === target);
      return {
        userId: target,
        name: profile?.name ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        isAdmin: target === group.adminUserId,
        membership: row && "kind" in row ? row : null,
        ban: row && "until" in row ? row : null,
        ...(capabilities.canSocialInteract ? { social: social.get(target) } : {}),
      };
    };
    const items = selected.map((row) => item(row.userId, row));
    if (firstOwner) items.unshift(item(group.adminUserId, null));
    const last = selected.at(-1);
    return {
      items,
      nextCursor: rows.length > take ? (last ? `${last.createdAt}|${last.id}` : "owner") : null,
    };
  }
}
