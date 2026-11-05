import type {
  ActivityAuthor,
  CommunityActivityPage,
  CommunityNetwork,
  ProfileActivity,
  ProfileActivityKind,
  ProfileActivityPage,
  ProfileActivityRecord,
  ProfileView,
} from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { recordServices } from "../community/record-services";
import { CommunityError } from "../community.error";
import { RelationshipRepository } from "../contacts/relationship.repository";
import { publicUserName } from "../users/public-user-name";
import { ProfileRepository } from "./profile.repository";
import { ProfileActivitiesRepository } from "./profile-activities.repository";

export class ProfileService {
  private profiles;
  private relationships;
  private activities;
  constructor(private db: Db) {
    this.profiles = new ProfileRepository(db);
    this.relationships = new RelationshipRepository(db);
    this.activities = new ProfileActivitiesRepository(db);
  }
  async requireVisible(viewer: string, subject: string) {
    if (!subject || (viewer !== subject && (await this.relationships.isBlocked(viewer, subject))))
      throw new CommunityError(404, "PROFILE_NOT_FOUND");
    const user = await this.profiles.user(subject);
    if (!user) throw new CommunityError(404, "PROFILE_NOT_FOUND");
    return user;
  }
  async profile(viewer: string, subject: string): Promise<ProfileView> {
    const user = await this.requireVisible(viewer, subject);
    return {
      id: subject,
      name: publicUserName(user),
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
      social: await this.profiles.social(subject),
      player: await this.profiles.player(subject),
    };
  }
  async games(viewer: string, subject: string, cursor: number, query: string) {
    await this.requireVisible(viewer, subject);
    return this.profiles.games(subject, cursor, query);
  }
  async history(viewer: string, subject: string, gameId: number, cursor?: number) {
    await this.requireVisible(viewer, subject);
    return this.profiles.history(subject, gameId, cursor);
  }
  async feed(
    viewer: string,
    subject: string,
    input: { kind?: ProfileActivityKind; limit: number; cursor?: string },
  ): Promise<ProfileActivityPage> {
    await this.requireVisible(viewer, subject);
    return this.readFeed(viewer, input, subject);
  }
  async networkFeed(
    viewer: string,
    input: {
      network: CommunityNetwork;
      kind?: ProfileActivityKind;
      limit: number;
      cursor?: string;
    },
  ): Promise<CommunityActivityPage> {
    await this.requireVisible(viewer, viewer);
    return this.readFeed(viewer, input, undefined, input.network);
  }
  /** Both surfaces resolve the same current source visibility before their visible page limit. */
  private readFeed(
    viewer: string,
    input: { kind?: ProfileActivityKind; limit: number; cursor?: string },
    subject: string,
  ): Promise<ProfileActivityPage>;
  private readFeed(
    viewer: string,
    input: { kind?: ProfileActivityKind; limit: number; cursor?: string },
    subject: undefined,
    network: CommunityNetwork,
  ): Promise<CommunityActivityPage>;
  private async readFeed(
    viewer: string,
    input: { kind?: ProfileActivityKind; limit: number; cursor?: string },
    subject?: string,
    network?: CommunityNetwork,
  ) {
    const services = recordServices(this.db);
    type Resource = { name: string; href: string; groupId?: string; eventContext?: string };
    const resources = new Map<string, Promise<Resource | null>>();
    const authors = new Map<string, Promise<ActivityAuthor | null>>();
    const blocked = new Set(await this.relationships.getBlockedUserIds(viewer));
    const author = (id: string) => {
      let pending = authors.get(id);
      if (!pending) {
        pending = this.profiles.user(id).then((user) =>
          user
            ? {
                id,
                name: publicUserName(user),
                username: user.username ?? null,
                avatarUrl: user.avatarUrl ?? null,
              }
            : null,
        );
        authors.set(id, pending);
      }
      return pending;
    };
    const resource = (row: ProfileActivityRecord) => {
      const key = `${row.eventId ?? ""}/${row.tableId ?? ""}/${row.groupId ?? ""}/${row.otherUserId ?? ""}`;
      let pending = resources.get(key);
      if (!pending) {
        pending = (async () => {
          try {
            if (row.eventId)
              return await services.events.activityResource(viewer, row.eventId, row.tableId, true);
            if (row.groupId) {
              const group = await services.groups.detail(viewer, row.groupId);
              if (group.type !== "PUBLIC" || !group.approved) return null;
              return { name: group.approved.name, href: `/groups/${group.id}`, groupId: group.id };
            }
            if (row.otherUserId) {
              const user = await author(row.otherUserId);
              return user
                ? { name: user.username || user.name, href: `/profiles/${user.id}` }
                : null;
            }
            return null;
          } catch (error) {
            if (error instanceof CommunityError && [403, 404].includes(error.status)) return null;
            throw error;
          }
        })();
        resources.set(key, pending);
      }
      return pending;
    };
    const items: Array<ProfileActivity & { author?: ActivityAuthor }> = [];
    let cursor = input.cursor;
    while (items.length <= input.limit) {
      const rows = network
        ? await this.activities.networkPage(viewer, network, [...blocked], cursor, input.kind)
        : await this.activities.page(subject as string, input.kind, cursor);
      if (!rows.length) break;
      resources.clear();
      authors.clear();
      for (const row of rows) {
        if (blocked.has(row.userId) || (row.otherUserId && blocked.has(row.otherUserId))) continue;
        const identity = await author(row.userId);
        if (!identity) continue;
        const target = await resource(row);
        if (!target) continue;
        items.push({
          id: row.id,
          kind: row.kind,
          occurredAt: row.occurredAt,
          context: target.name,
          href: target.href,
          visibility: target.groupId ? "public-group" : "authorized",
          ...(target.groupId ? { groupId: target.groupId } : {}),
          ...(target.eventContext ? { eventContext: target.eventContext } : {}),
          ...(row.otherUserId ? { otherUserId: row.otherUserId } : {}),
          author: identity,
          ...(row.outcome ? { outcome: row.outcome } : {}),
          ...(row.milestone ? { milestone: row.milestone } : {}),
        });
        if (items.length > input.limit) break;
      }
      const last = rows.at(-1);
      if (rows.length < 50 || !last) break;
      cursor = `${last.occurredAt}|${last.id}`;
    }
    const visible = items.slice(0, input.limit),
      last = visible.at(-1);
    return {
      items: visible,
      nextCursor: items.length > input.limit && last ? `${last.occurredAt}|${last.id}` : null,
    };
  }
}
