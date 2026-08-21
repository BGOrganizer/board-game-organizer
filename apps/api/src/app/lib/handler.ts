import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { corsJson, corsOptions, getCorsHeaders } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { LISTS, type ListType } from "@/app/lib/relationship.lists";
import { RelationshipRepository } from "@/app/lib/relationship.repository";

export const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const bodySchema = z.object({ targetUserId: z.string().min(1) });

/** CORS preflight for the relationships route. */
export function OPTIONS() {
  return corsOptions();
}

export function typedMutationHandler(
  table: Record<
    string,
    (userId: string, targetUserId: string, repo: RelationshipRepository) => Promise<any>
  >,
) {
  return async (req: Request) => {
    const { userId } = await auth();
    if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

    const type = new URL(req.url).searchParams.get("type") ?? "";
    const action = table[type];
    if (!action) return corsJson({ error: `Unsupported type: ${type}` }, { status: 400 });

    // DELETE requests may carry no body: parse defensively so a missing body
    // yields a 400 (not an uncaught JSON error → 500) and a targetUserId is
    // still required (the client sends it even on DELETE).
    let body: unknown = {};
    const rawBody = await req.text().catch(() => "");
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return corsJson({ error: "Bad request" }, { status: 400 });
      }
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return corsJson({ error: "Bad request" }, { status: 400 });

    try {
      const extra = await withTransaction((session, db) =>
        action(userId, parsed.data.targetUserId, new RelationshipRepository(db, session)),
      );
      return corsJson({ success: true, ...(extra ?? {}) });
    } catch (err: any) {
      return corsJson({ error: err.message ?? "Error" }, { status: err.status ?? 500 });
    }
  };
}

export async function listHandler(req: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

  const type = new URL(req.url).searchParams.get("type") as ListType;
  const config = LISTS[type];
  if (!config) return corsJson({ error: "Invalid type" }, { status: 400 });

  const { enrichRelationshipsWithUsers } = await import("./enrichUsers");
  const db = await getDb();
  const repo = new RelationshipRepository(db);
  // LISTS[type] è una union di tuple readonly: destructuring invece dello spread (TS2556)
  const [relType, relStatus, direction] = config;
  const relationships = await repo.list(userId, relType, relStatus, direction);
  return corsJson(await enrichRelationshipsWithUsers(db, relationships, userId));
}
