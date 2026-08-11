import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, withTransaction } from "@/app/lib/db";
import { LISTS, type ListType } from "@/app/lib/relationship.lists";
import { RelationshipRepository } from "@/app/lib/relationship.repository";

export const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const bodySchema = z.object({ targetUserId: z.string().min(1) });

export function typedMutationHandler(
  table: Record<
    string,
    (userId: string, targetUserId: string, repo: RelationshipRepository) => Promise<any>
  >,
) {
  return async (req: Request) => {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const type = new URL(req.url).searchParams.get("type") ?? "";
    const action = table[type];
    if (!action) return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    try {
      const extra = await withTransaction((session, db) =>
        action(userId, parsed.data.targetUserId, new RelationshipRepository(db, session)),
      );
      return NextResponse.json({ success: true, ...(extra ?? {}) });
    } catch (err: any) {
      return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status ?? 500 });
    }
  };
}

export async function listHandler(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = new URL(req.url).searchParams.get("type") as ListType;
  const config = LISTS[type];
  if (!config) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const { enrichRelationships } = await import("./clerk");
  const repo = new RelationshipRepository(await getDb());
  // LISTS[type] è una union di tuple readonly: destructuring invece dello spread (TS2556)
  const [relType, relStatus, direction] = config;
  const relationships = await repo.list(userId, relType, relStatus, direction);
  return NextResponse.json(await enrichRelationships(relationships, userId));
}
