import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { BggAccountRepository } from "@/app/lib/games/bgg-account.repository";
import { BggRemoteError, fetchBggCollection } from "@/app/lib/games/bgg-collection";

export const OPTIONS = corsOptions;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const repository = new BggAccountRepository(await getDb());
  let pending = await repository.pending(userId);
  if (!pending) return corsJson({ error: "No BGG sync pending" }, { status: 409 }, request);
  const retry = new URL(request.url).searchParams.get("retry") === "true";
  if (pending.status === "failed") {
    if (!retry) return corsJson(await repository.get(userId), request);
    await repository.restart(userId, pending.snapshot);
    pending = await repository.pending(userId);
    if (!pending) return corsJson(await repository.get(userId), request);
  }
  if (pending.nextAttemptAt && pending.nextAttemptAt > new Date())
    return corsJson(await repository.get(userId), request);
  if (!(await repository.claim(userId, pending.snapshot)))
    return corsJson(await repository.get(userId), request);
  try {
    const games = await fetchBggCollection(pending.username, userId, pending.snapshot);
    await repository.publish(userId, pending.snapshot, pending, games);
  } catch (error) {
    if (error instanceof BggRemoteError && error.kind === "rate_limited")
      await repository.queued(userId, pending.snapshot, error.retryAfterMs);
    else await repository.failed(userId, pending.snapshot);
  }
  return corsJson(await repository.get(userId), request);
}
