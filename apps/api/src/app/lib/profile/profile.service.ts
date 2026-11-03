import type {
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
      name: user.name && user.name !== user.email ? user.name : (user.username ?? ""),
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
    const services = recordServices(this.db);
    const resourceCache = new Map<
      string,
      Promise<{ name: string; href: string; groupId?: string } | null>
    >();
    const blocked = new Set(await this.relationships.getBlockedUserIds(viewer));
    const resource = (row: ProfileActivityRecord) => {
      const key = `${row.eventId ?? ""}/${row.tableId ?? ""}/${row.groupId ?? ""}/${row.otherUserId ?? ""}`;
      let pending = resourceCache.get(key);
      if (!pending) {
        pending = (async () => {
          try {
            if (row.eventId)
              return await services.events.activityResource(viewer, row.eventId, row.tableId);
            if (row.groupId) {
              const group = await services.groups.detail(viewer, row.groupId);
              if (group.type === "PRIVATE" && !group.canViewEvents) return null;
              return { name: group.name, href: `/groups/${group.id}`, groupId: group.id };
            }
            if (row.otherUserId) {
              if (blocked.has(row.otherUserId)) return null;
              const user = await this.profiles.user(row.otherUserId);
              return user
                ? {
                    name: user.name && user.name !== user.email ? user.name : (user.username ?? ""),
                    href: `/profiles/${row.otherUserId}`,
                  }
                : null;
            }
            return null;
          } catch (error) {
            if (error instanceof CommunityError && [403, 404].includes(error.status)) return null;
            throw error;
          }
        })();
        resourceCache.set(key, pending);
      }
      return pending;
    };
    const items: ProfileActivity[] = [];
    let cursor = input.cursor;
    // Source chunks are bounded; authorize before applying the visible response page limit.
    while (items.length <= input.limit) {
      const rows = await this.activities.page(subject, input.kind, cursor);
      if (!rows.length) break;
      resourceCache.clear();
      for (const row of rows) {
        const target = await resource(row);
        if (!target) continue;
        items.push({
          id: row.id,
          kind: row.kind,
          occurredAt: row.occurredAt,
          context: target.name,
          href: target.href,
          ...(target.groupId ? { groupId: target.groupId } : {}),
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
