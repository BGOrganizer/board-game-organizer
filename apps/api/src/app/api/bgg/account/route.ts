import { bggUsernameSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { BggAccountRepository } from "@/app/lib/bgg-account.repository";
import { BggRemoteError, fetchBggUser } from "@/app/lib/bgg-collection";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  return corsJson(await new BggAccountRepository(await getDb()).get(userId), request);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "Invalid request" }, { status: 400 }, request);
  }
  const parsed = z.object({ username: bggUsernameSchema }).strict().safeParse(body);
  if (!parsed.success) return corsJson({ error: "Invalid username" }, { status: 400 }, request);
  try {
    const identity = await fetchBggUser(parsed.data.username);
    if (!identity) return corsJson({ error: "BGG user not found" }, { status: 404 }, request);
    const repository = new BggAccountRepository(await getDb());
    await repository.stage(userId, identity);
    return corsJson(await repository.get(userId), request);
  } catch (error) {
    if (error instanceof BggRemoteError)
      return corsJson(
        { error: error.kind === "not_found" ? "BGG user not found" : "BGG unavailable" },
        { status: error.kind === "not_found" ? 404 : 503 },
        request,
      );
    return corsJson({ error: "Could not start BGG sync" }, { status: 500 }, request);
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  await withTransaction(async (session, db) => {
    await new BggAccountRepository(db).unlink(userId, session);
  });
  return corsJson({ active: null, pending: null }, request);
}
