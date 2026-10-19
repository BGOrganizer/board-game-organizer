import { auth } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { after } from "next/server";
import { CommunityError } from "../community.error";
import { corsJson } from "../cors";
import { getDb, withTransaction } from "../db";
import { ensureCurrentUser } from "../ensureCurrentUser";
import { dispatchNotifications } from "../notifications/push";
import { recordServices } from "./record-services";

export { communityBody, communityId } from "./request";
/** Old invitation/booking URLs must never recreate retired collections. */
export async function retiredRecordOperation(request: Request) {
  const { userId } = await auth();
  return corsJson(
    { error: userId ? "LEGACY_DOMAIN_RETIRED" : "Unauthorized" },
    { status: userId ? 410 : 401, headers: { "Cache-Control": "private, no-store" } },
    request,
  );
}
export async function runRecordOperation<T>(
  request: Request,
  operation: (userId: string, services: ReturnType<typeof recordServices>) => Promise<T>,
  status = 200,
) {
  const { userId } = await auth();
  if (!userId)
    return corsJson(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
      request,
    );
  try {
    await ensureCurrentUser(userId, await getDb());
    const ids: ObjectId[] = [];
    const result = await withTransaction(async (session, db) => {
      ids.length = 0;
      return operation(userId, recordServices(db, session, ids));
    });
    // Only committed IDs survive retries; never dispatch legacy Match/deadline workers.
    if (ids.length) {
      const committed = [...ids];
      after(() => dispatchNotifications(committed));
    }
    return corsJson(result, { status, headers: { "Cache-Control": "private, no-store" } }, request);
  } catch (error) {
    return corsJson(
      { error: error instanceof CommunityError ? error.message : "Internal server error" },
      {
        status: error instanceof CommunityError ? error.status : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
      request,
    );
  }
}
