import { randomUUID } from "node:crypto";
import type {
  CommunityNotificationKind,
  Organization,
  OrganizationListRole,
  OrganizationMemberResponse,
  OrganizationMembership,
  OrganizationMembershipAction,
  OrganizationResponse,
  ReviewOrganizationInput,
  SaveOrganizationInput,
  UpdateOrganizationInput,
} from "@board-game-organizer/schemas";
import { normalizeOrganizationName } from "@board-game-organizer/shared";
import { MongoServerError } from "mongodb";
import { CommunityError } from "../community.error";
import type { RelationshipRepository } from "../contacts/relationship.repository";
import { verifyCommunityLocation } from "../locations/community-location";
import type { NotificationsRepository } from "../notifications/notifications.repository";
import type { UsersRepository } from "../users/users.repository";
import { requireBgoModerator } from "./community-role";
import type { OrganizationAssetsRepository } from "./organization-assets.repository";
import type { CommunityPage, OrganizationsRepository } from "./organizations.repository";

export class OrganizationsService {
  constructor(
    private organizations: OrganizationsRepository,
    private assets: OrganizationAssetsRepository,
    private users: UsersRepository,
    private relationships: RelationshipRepository,
    private notifications: NotificationsRepository,
    private departure: (organizationId: string, userId: string) => Promise<void>,
  ) {}

  private async required(id: string, lock = false) {
    const organization = lock
      ? await this.organizations.lock(id)
      : await this.organizations.find(id);
    if (!organization) throw new CommunityError(404, "ORGANIZATION_NOT_FOUND");
    return organization;
  }
  private admin(organization: Organization, userId: string) {
    if (organization.adminUserId !== userId)
      throw new CommunityError(403, "ORGANIZATION_ADMIN_REQUIRED");
  }
  private async notify(
    kind: CommunityNotificationKind,
    organization: Organization,
    actorUserId: string,
    recipients: string[],
  ) {
    await this.notifications.notifyMany(
      [...new Set(recipients)].map((recipientUserId) => ({
        kind,
        actorUserId,
        recipientUserId,
        resourceName:
          kind === "organization_review_requested" || kind === "organization_reviewed"
            ? (organization.proposal?.name ?? organization.approved?.name ?? "")
            : (organization.approved?.name ?? ""),
        resourceHref:
          kind === "organization_review_requested"
            ? "/moderation"
            : `/organizations/${organization.id}`,
      })),
    );
  }
  private async response(
    organization: Organization,
    userId: string,
    moderator = false,
  ): Promise<OrganizationResponse> {
    const owner = organization.adminUserId === userId;
    if (!organization.approved && !owner && !moderator)
      throw new CommunityError(404, "ORGANIZATION_NOT_FOUND");
    const revision =
      owner || moderator ? (organization.proposal ?? organization.approved) : organization.approved;
    if (!revision) throw new CommunityError(404, "ORGANIZATION_NOT_FOUND");
    const membership = await this.organizations.findMembership(organization.id, userId);
    if (membership?.status === "EXCLUDED" && !moderator)
      throw new CommunityError(403, "ORGANIZATION_EXCLUDED");
    const asset = await this.assets.find(revision.logoAssetId);
    const role: OrganizationResponse["role"] = owner
      ? "admin"
      : membership?.status === "ACCEPTED"
        ? "accepted"
        : membership?.status === "EXCLUDED"
          ? "excluded"
          : membership?.status === "PENDING"
            ? membership.kind === "REQUEST"
              ? "requested"
              : "invited"
            : "none";
    return {
      id: organization.id,
      adminUserId: organization.adminUserId,
      name: revision.name,
      location: revision.location,
      logoAssetId: revision.logoAssetId,
      logo: `data:image/webp;base64,${asset?.thumbnailBase64 ?? ""}`,
      status: owner || moderator ? organization.status : "CREATED",
      memberCount: 1 + (await this.organizations.countMembers(organization.id)),
      role,
      myMembership: membership,
      approved: organization.approved,
      version: organization.version,
      ...(owner || moderator
        ? {
            proposal: organization.proposal,
            reviewStatus: organization.reviewStatus,
            rejectionReason: organization.rejectionReason,
          }
        : {}),
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }
  async detail(userId: string, id: string) {
    return this.response(await this.required(id), userId);
  }
  async moderationDetail(userId: string, id: string) {
    await requireBgoModerator(userId);
    return this.response(await this.required(id), userId, true);
  }
  async list(
    userId: string,
    scope: "mine" | "public" | "moderation",
    page: CommunityPage,
    roles?: readonly OrganizationListRole[],
  ) {
    if (scope === "moderation") await requireBgoModerator(userId);
    const rows = await this.organizations.list(userId, scope, page, roles);
    const items: OrganizationResponse[] = [];
    for (const row of rows.slice(0, page.limit))
      items.push(await this.response(row, userId, scope === "moderation"));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  private async releasePreviousLogos(previous: Organization | undefined, next: Organization) {
    const retained = new Set([next.approved?.logoAssetId, next.proposal?.logoAssetId]);
    for (const id of new Set([previous?.approved?.logoAssetId, previous?.proposal?.logoAssetId])) {
      if (id && !retained.has(id)) await this.assets.expireUnused(id, next.id);
    }
  }

  async save(userId: string, input: SaveOrganizationInput | UpdateOrganizationInput, id?: string) {
    const current = id ? await this.required(id, true) : undefined;
    if (current) {
      this.admin(current, userId);
      if (!("version" in input) || input.version !== current.version)
        throw new CommunityError(409, "ORGANIZATION_CHANGED");
    }
    const organizationId = current?.id ?? randomUUID();
    const location = await verifyCommunityLocation(
      input.location,
      [current?.approved?.location, current?.proposal?.location].filter(
        (value) => value !== undefined,
      ),
    );
    if (!(await this.assets.claim(input.logoAssetId, userId, organizationId)))
      throw new CommunityError(400, "INVALID_LOGO");
    const proposal = { name: input.name, logoAssetId: input.logoAssetId, location };
    const next: Organization = {
      id: organizationId,
      adminUserId: userId,
      status: current?.approved ? "MODIFIED" : "PENDING",
      ...(current?.approved ? { approved: current.approved } : {}),
      proposal,
      reviewStatus: "PENDING",
      reservedNames: [
        ...new Set([
          normalizeOrganizationName(proposal.name),
          ...(current?.approved ? [normalizeOrganizationName(current.approved.name)] : []),
        ]),
      ],
      version: (current?.version ?? 0) + 1,
      createdAt: current?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (current) await this.organizations.save(next);
      else await this.organizations.create(next);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        throw new CommunityError(409, "ORGANIZATION_NAME_TAKEN");
      throw error;
    }
    await this.releasePreviousLogos(current, next);
    await this.notify(
      "organization_review_requested",
      next,
      userId,
      await this.users.moderatorIds(),
    );
    return this.response(next, userId);
  }
  async review(userId: string, id: string, input: ReviewOrganizationInput) {
    await requireBgoModerator(userId);
    const current = await this.required(id, true);
    if (
      !current.proposal ||
      current.reviewStatus !== "PENDING" ||
      current.version !== input.version
    )
      throw new CommunityError(409, "ORGANIZATION_CHANGED");
    const next: Organization =
      input.decision === "approve"
        ? {
            id: current.id,
            adminUserId: current.adminUserId,
            status: "CREATED",
            approved: current.proposal,
            reservedNames: [normalizeOrganizationName(current.proposal.name)],
            version: current.version + 1,
            createdAt: current.createdAt,
            updatedAt: new Date().toISOString(),
          }
        : {
            ...current,
            reviewStatus: "REJECTED",
            rejectionReason: input.reason,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
          };
    await this.organizations.save(next);
    await this.releasePreviousLogos(current, next);
    await this.notify("organization_reviewed", next, userId, [next.adminUserId]);
    return this.response(next, userId, true);
  }
  async invite(userId: string, id: string, target: string) {
    const organization = await this.required(id, true);
    this.admin(organization, userId);
    if (!organization.approved) throw new CommunityError(409, "ORGANIZATION_NOT_APPROVED");
    if (target === userId) throw new CommunityError(409, "ALREADY_ORGANIZATION_MEMBER");
    if (!(await this.users.findById(target))) throw new CommunityError(404, "USER_NOT_FOUND");
    if (
      !(await this.relationships.isFriend(userId, target)) ||
      (await this.relationships.isBlocked(userId, target))
    )
      throw new CommunityError(403, "CONFIRMED_FRIEND_REQUIRED");
    return this.pending(organization, userId, target, "INVITATION");
  }
  async request(userId: string, id: string) {
    const organization = await this.required(id, true);
    if (!organization.approved) throw new CommunityError(404, "ORGANIZATION_NOT_FOUND");
    if (organization.adminUserId === userId)
      throw new CommunityError(409, "ALREADY_ORGANIZATION_MEMBER");
    // Ordinary requests intentionally do not require friendship.
    return this.pending(organization, userId, userId, "REQUEST");
  }
  private async pending(
    organization: Organization,
    actor: string,
    target: string,
    kind: OrganizationMembership["kind"],
  ) {
    const current = await this.organizations.findMembership(organization.id, target);
    if (current?.status === "EXCLUDED") throw new CommunityError(403, "ORGANIZATION_EXCLUDED");
    if (current?.status === "ACCEPTED" || current?.status === "PENDING")
      throw new CommunityError(409, "MEMBERSHIP_ALREADY_ACTIVE");
    const membership: OrganizationMembership = {
      id: current?.id ?? randomUUID(),
      organizationId: organization.id,
      userId: target,
      kind,
      status: "PENDING",
      createdAt: current?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.organizations.saveMembership(membership);
    await this.notify(
      kind === "REQUEST" ? "organization_join_requested" : "organization_invitation",
      organization,
      actor,
      [kind === "REQUEST" ? organization.adminUserId : target],
    );
    return membership;
  }
  async membershipAction(
    userId: string,
    id: string,
    target: string,
    action: OrganizationMembershipAction["action"],
  ) {
    const organization = await this.required(id, true);
    if (target === organization.adminUserId)
      throw new CommunityError(403, "ORGANIZATION_ADMIN_CANNOT_LEAVE");
    const current = await this.organizations.findMembership(id, target);
    if (!current) throw new CommunityError(404, "MEMBERSHIP_NOT_FOUND");
    const own = userId === target;
    const admin = userId === organization.adminUserId;
    let status: OrganizationMembership["status"];
    if (action === "accept" || action === "decline") {
      if (!own || current.kind !== "INVITATION")
        throw new CommunityError(403, "INVITATION_RECIPIENT_REQUIRED");
      if (current.status !== "PENDING") throw new CommunityError(409, "MEMBERSHIP_CHANGED");
      status = action === "accept" ? "ACCEPTED" : "DECLINED";
    } else if (action === "approve" || action === "reject") {
      if (!admin || current.kind !== "REQUEST")
        throw new CommunityError(403, "ORGANIZATION_ADMIN_REQUIRED");
      if (current.status !== "PENDING") throw new CommunityError(409, "MEMBERSHIP_CHANGED");
      status = action === "approve" ? "ACCEPTED" : "DECLINED";
    } else if (action === "cancel") {
      if (
        !own ||
        (current.status !== "ACCEPTED" &&
          !(current.status === "PENDING" && current.kind === "REQUEST"))
      )
        throw new CommunityError(403, "MEMBERSHIP_ACTION_FORBIDDEN");
      status = "LEFT";
    } else {
      if (!admin) throw new CommunityError(403, "ORGANIZATION_ADMIN_REQUIRED");
      if (action === "revoke") {
        if (current.status !== "EXCLUDED") throw new CommunityError(409, "MEMBERSHIP_CHANGED");
        status = "LEFT";
      } else status = "EXCLUDED";
    }
    const next: OrganizationMembership = {
      id: current.id,
      organizationId: id,
      userId: target,
      kind: current.kind,
      status,
      ...(status === "EXCLUDED"
        ? { excludedReason: action === "ban" ? ("BANNED" as const) : ("REMOVED" as const) }
        : {}),
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.organizations.saveMembership(next);
    if (status === "LEFT" || status === "EXCLUDED") await this.departure(id, target);
    await this.notify("organization_membership_changed", organization, userId, [
      own ? organization.adminUserId : target,
    ]);
    return next;
  }
  async members(
    userId: string,
    id: string,
    page: CommunityPage,
    mode: "accepted" | "pending" | "excluded" = "accepted",
  ) {
    const organization = await this.required(id);
    const admin = organization.adminUserId === userId;
    if (
      !admin &&
      (mode !== "accepted" ||
        (await this.organizations.findMembership(id, userId))?.status !== "ACCEPTED")
    )
      throw new CommunityError(403, "ORGANIZATION_MEMBER_REQUIRED");
    const rows = await this.organizations.listMemberships(
      id,
      mode === "accepted" ? ["ACCEPTED"] : mode === "pending" ? ["PENDING"] : ["EXCLUDED"],
      page,
    );
    const profiles = await this.users.findByIds([
      ...rows.slice(0, page.limit).map((row) => row.userId),
      ...(mode === "accepted" && !page.cursor ? [organization.adminUserId] : []),
    ]);
    const item = (
      target: string,
      membership: OrganizationMembership | null,
    ): OrganizationMemberResponse => {
      const profile = profiles.find((value) => value.clerkId === target);
      return {
        userId: target,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        isAdmin: target === organization.adminUserId,
        membership,
      };
    };
    const items = rows.slice(0, page.limit).map((row) => item(row.userId, row));
    if (mode === "accepted" && !page.cursor) items.unshift(item(organization.adminUserId, null));
    const last = rows[Math.min(rows.length, page.limit) - 1];
    return {
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
}
