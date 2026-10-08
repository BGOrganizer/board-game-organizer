import { auth } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { after } from "next/server";
import { z } from "zod";
import { BoardGamesRepository } from "./boardGames.repository";
import { CommunityError } from "./community.error";
import { corsJson } from "./cors";
import { getDb, withTransaction } from "./db";
import { ensureCurrentUser } from "./ensureCurrentUser";
import { dispatchEventDeadlines } from "./event-deadlines";
import { EventsRepository } from "./events.repository";
import { EventsService } from "./events.service";
import { NotificationsRepository } from "./notifications.repository";
import { OrganizationAssetsRepository } from "./organization-assets.repository";
import { OrganizationsRepository } from "./organizations.repository";
import { OrganizationsService } from "./organizations.service";
import { dispatchNotifications } from "./push";
import { RelationshipRepository } from "./relationship.repository";
import { UsersRepository } from "./users.repository";

export { communityBody, communityId } from "./organization-assets.http";
export function communityPage(request: Request) {
  const url = new URL(request.url);
  const input = z
    .object({
      limit: z.coerce.number().int().min(1).max(50),
      query: z.string().trim().min(4).max(120).optional(),
      cursor: z
        .string()
        .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|[0-9a-f-]{36}$/)
        .optional(),
    })
    .safeParse({
      limit: url.searchParams.get("limit") ?? 20,
      query: url.searchParams.get("query") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
  if (!input.success) throw new CommunityError(400, "INVALID_PAGINATION");
  return input.data;
}
export async function runCommunityOperation<T>(
  request: Request,
  operation: (
    userId: string,
    organizations: OrganizationsService,
    events: EventsService,
  ) => Promise<T>,
  status = 200,
) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  try {
    await ensureCurrentUser(userId, await getDb());
    const ids: ObjectId[] = [];
    const result = await withTransaction(async (session, db) => {
      ids.length = 0;
      const organizations = new OrganizationsRepository(db, session);
      const assets = new OrganizationAssetsRepository(db, session);
      const users = new UsersRepository(db, session);
      const notifications = new NotificationsRepository(db, session, ids);
      const events = new EventsService(
        new EventsRepository(db, session),
        organizations,
        assets,
        users,
        new BoardGamesRepository(db, session),
        notifications,
      );
      return operation(
        userId,
        new OrganizationsService(
          organizations,
          assets,
          users,
          new RelationshipRepository(db, session),
          notifications,
          (organizationId, target) => events.membershipDeparted(organizationId, target),
        ),
        events,
      );
    });
    after(async () => {
      if (ids.length > 0) await dispatchNotifications(ids);
      // Durable outbox is retried by recovery if this invocation or provider fails.
      try {
        await dispatchEventDeadlines();
      } catch (error) {
        console.error(
          "Event deadline delivery failed",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    });
    return corsJson(result, { status }, request);
  } catch (error) {
    if (error instanceof CommunityError)
      return corsJson({ error: error.message }, { status: error.status }, request);
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
