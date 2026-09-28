import { auth } from "@clerk/nextjs/server";
import { corsJson } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { ensureCurrentUser } from "@/app/lib/ensureCurrentUser";
import { GroupError, GroupService } from "@/app/lib/group.service";
import { GroupsRepository } from "@/app/lib/groups.repository";
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
    const result = await withTransaction(async (session, db) => {
      const service = new GroupService(
        new GroupsRepository(db, session),
        new UsersRepository(db, session),
        new RelationshipRepository(db, session),
      );
      return operation(userId, service);
    });
    return corsJson(result ?? { success: true }, { status }, request);
  } catch (error) {
    if (error instanceof GroupError)
      return corsJson({ error: error.message }, { status: error.status }, request);
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
