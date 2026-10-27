import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { after } from "next/server";
import { CommunityError } from "../community.error";
import { corsJson } from "../cors";
import { getDb, withTransaction } from "../db";
import { ensureCurrentUser } from "../ensureCurrentUser";
import { dispatchNotifications } from "../notifications/push";
import type { recordServices } from "./record-services";

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
  diagnostic?: "group.create" | "group.logo.start" | "group.logo.chunk" | "group.logo.complete",
) {
  const requestId = diagnostic ? randomUUID() : undefined;
  let stage = "auth";
  const trace = (phase: string, responseStatus?: number, code?: string) => {
    if (diagnostic)
      console.info("[bgo.group-write]", {
        operation: diagnostic,
        requestId,
        phase,
        stage,
        status: responseStatus,
        code,
      });
  };
  trace("received");
  let userId: string | null;
  try {
    ({ userId } = await auth());
  } catch (error) {
    trace("failed", 500, "AUTHENTICATION_ERROR");
    throw error;
  }
  if (!userId) {
    trace("rejected", 401, "UNAUTHORIZED");
    return corsJson(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
      request,
    );
  }
  try {
    stage = "services";
    trace("starting");
    const { recordServices } = await import("./record-services");
    stage = "user_sync";
    trace("starting");
    await ensureCurrentUser(userId, await getDb());
    const ids: ObjectId[] = [];
    stage = "transaction";
    trace("starting");
    const result = await withTransaction(async (session, db) => {
      ids.length = 0;
      return operation(userId, recordServices(db, session, ids));
    });
    // Only committed IDs survive retries; never dispatch legacy Match/deadline workers.
    if (ids.length) {
      const committed = [...ids];
      after(() => dispatchNotifications(committed));
    }
    trace("completed", status);
    return corsJson(result, { status, headers: { "Cache-Control": "private, no-store" } }, request);
  } catch (error) {
    const domainError = error instanceof CommunityError;
    trace(
      "failed",
      domainError ? error.status : 500,
      domainError && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.message)
        ? error.message
        : domainError
          ? "REQUEST_REJECTED"
          : "INTERNAL_ERROR",
    );
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
