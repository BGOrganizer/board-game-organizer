import { auth } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { after } from "next/server";
import { RelationshipRepository } from "@/app/lib/contacts/relationship.repository";
import { corsJson } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { ensureCurrentUser } from "@/app/lib/ensureCurrentUser";
import { GroupError, GroupService } from "@/app/lib/groups/group.service";
import { GroupsRepository } from "@/app/lib/groups/groups.repository";
import { NotificationsRepository } from "@/app/lib/notifications/notifications.repository";
import { dispatchNotifications } from "@/app/lib/notifications/push";
import { UsersRepository } from "@/app/lib/users/users.repository";

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
