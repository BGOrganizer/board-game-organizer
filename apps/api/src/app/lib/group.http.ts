import { auth } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { after } from "next/server";
import { corsJson } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { ensureCurrentUser } from "@/app/lib/ensureCurrentUser";
import { GroupError, GroupService } from "@/app/lib/group.service";
import { GroupsRepository } from "@/app/lib/groups.repository";
import { NotificationsRepository } from "@/app/lib/notifications.repository";
import { dispatchNotifications } from "@/app/lib/push";
import { RelationshipRepository } from "@/app/lib/relationship.repository";
import { UsersRepository } from "@/app/lib/users.repository";

export async function runGroupOperation<T>(
  request: Request,
  operation: (userId: string, service: GroupService) => Promise<T>,
  status = 200,
) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  try {
    await ensureCurrentUser(userId, await getDb());
    const createdNotificationIds: ObjectId[] = [];
    const result = await withTransaction(async (session, db) => {
      createdNotificationIds.length = 0; // Transaction callback may be replayed.
      const service = new GroupService(
        new GroupsRepository(db, session),
        new UsersRepository(db, session),
        new RelationshipRepository(db, session),
        new NotificationsRepository(db, session, createdNotificationIds),
      );
      return operation(userId, service);
    });
    if (createdNotificationIds.length > 0)
      after(() => dispatchNotifications(createdNotificationIds));
    return corsJson(result ?? { success: true }, { status }, request);
  } catch (error) {
    if (error instanceof GroupError)
      return corsJson({ error: error.message }, { status: error.status }, request);
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
