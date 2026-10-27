import { auth } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { after } from "next/server";
import { CommunityError } from "../community.error";
import { corsJson } from "../cors";
import { getDb, withTransaction } from "../db";
import { ensureCurrentUser } from "../ensureCurrentUser";
import { dispatchNotifications } from "../notifications/push";
import type { recordServices } from "./record-services";
import {
  createRequestDiagnostics,
  type RequestDiagnosticOperation,
  type RequestDiagnosticTrace,
} from "./request-diagnostics";

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
  diagnostic?: RequestDiagnosticOperation | RequestDiagnosticTrace,
) {
  const trace =
    typeof diagnostic === "function" ? diagnostic : createRequestDiagnostics(diagnostic);
  let stage: "auth" | "services" | "user_sync" | "transaction" = "auth";
  let userId: string | null;
  try {
    ({ userId } = await auth());
  } catch (error) {
    trace("failed", stage, 500, "AUTHENTICATION_ERROR");
    throw error;
  }
  if (!userId) {
    trace("rejected", stage, 401, "UNAUTHORIZED");
    return corsJson(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
      request,
    );
  }
  try {
    stage = "services";
    trace("starting", stage);
    const { recordServices } = await import("./record-services");
    stage = "user_sync";
    trace("starting", stage);
    await ensureCurrentUser(userId, await getDb());
    const ids: ObjectId[] = [];
    stage = "transaction";
    trace("starting", stage);
    const result = await withTransaction(async (session, db) => {
      ids.length = 0;
      return operation(userId, recordServices(db, session, ids));
    });
    // Only committed IDs survive retries; never dispatch legacy Match/deadline workers.
    if (ids.length) {
      const committed = [...ids];
      after(() => dispatchNotifications(committed));
    }
    trace("completed", stage, status);
    return corsJson(result, { status, headers: { "Cache-Control": "private, no-store" } }, request);
  } catch (error) {
    const domainError = error instanceof CommunityError;
    trace(
      "failed",
      stage,
      domainError ? error.status : 500,
      domainError ? error.message : "INTERNAL_ERROR",
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
