import { auth } from "@clerk/nextjs/server";
import type { ClientSession, Db, ObjectId } from "mongodb";
import { after } from "next/server";
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { enrichRelationshipsWithUsers } from "@/app/lib/enrichUsers";
import { ensureCurrentUser } from "@/app/lib/ensureCurrentUser";
import { NotificationsRepository } from "@/app/lib/notifications.repository";
import { dispatchNotifications } from "@/app/lib/push";
import { RelationshipRepository } from "@/app/lib/relationship.repository";
import {
  RelationshipError,
  type RelationshipListType,
  RelationshipService,
} from "@/app/lib/relationship.service";

export interface RelationshipContext {
  userId: string;
  db: Db;
  session: ClientSession;
  service: RelationshipService;
}

export type TargetRouteContext = {
  params: Promise<{ targetUserId: string }>;
};

export const targetUserIdSchema = z
  .string()
  .min(6)
  .max(128)
  .regex(/^user_[A-Za-z0-9_-]+$/);

const protectionQuerySchema = z
  .object({
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export function parseTargetUserId(value: unknown): string | null {
  const parsed = targetUserIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function hasOnlyProtectionBypassQuery(request: Request): boolean {
  const params = new URL(request.url).searchParams;
  return (
    protectionQuerySchema.safeParse(Object.fromEntries(params)).success &&
    params.getAll("x-vercel-protection-bypass").length <= 1
  );
}

export async function targetFromContext(
  request: Request,
  context: TargetRouteContext,
): Promise<string | null> {
  if (!hasOnlyProtectionBypassQuery(request)) return null;
  return parseTargetUserId((await context.params).targetUserId);
}

export function relationshipOptions(request: Request) {
  return corsOptions(request);
}

export function badRelationshipRequest(request: Request, message = "Bad request") {
  return corsJson({ error: message }, { status: 400 }, request);
}

export async function parseRelationshipJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { response: Response }> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return {
      response: corsJson(
        { error: "Content-Type must be application/json" },
        { status: 415 },
        request,
      ),
    };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1_024) {
    return {
      response: corsJson({ error: "Request body too large" }, { status: 413 }, request),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { response: badRelationshipRequest(request, "Invalid JSON") };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { data: parsed.data }
    : { response: badRelationshipRequest(request, "Invalid request body") };
}

export async function runRelationshipOperation<T>(
  request: Request,
  operation: (context: RelationshipContext) => Promise<T>,
  status = 200,
) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  try {
    await ensureCurrentUser(userId, await getDb());
    const createdNotificationIds: ObjectId[] = [];
    const result = await withTransaction(async (session, db) => {
      const service = new RelationshipService(
        new RelationshipRepository(db, session),
        new NotificationsRepository(db, session, createdNotificationIds),
      );
      await service.requireCurrentUser(userId);
      return operation({ userId, db, session, service });
    });
    if (createdNotificationIds.length > 0) {
      after(() => dispatchNotifications(createdNotificationIds));
    }
    return corsJson(result ?? { success: true }, { status }, request);
  } catch (error) {
    if (error instanceof RelationshipError) {
      return corsJson({ error: error.message }, { status: error.status }, request);
    }
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}

export function runRelationshipList(request: Request, type: RelationshipListType) {
  return runRelationshipOperation(request, async ({ userId, db, session, service }) => {
    const relationships = await service.list(userId, type);
    return enrichRelationshipsWithUsers(db, relationships, userId, session);
  });
}
