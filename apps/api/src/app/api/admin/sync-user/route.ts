// apps/api/src/app/api/admin/sync-user/route.ts
/**
 * POST /api/admin/sync-user
 *
 * Service-to-service mirroring of a Clerk user into the `users` collection.
 * Used by CI to deterministically seed the E2E test users (the Clerk webhook
 * only reaches the production deployment, which may not be on this branch).
 *
 * Auth: `Authorization: Bearer <CLERK_SECRET_KEY>` — the same secret already
 * configured on the API (Vercel) and in CI, so no new credential is needed.
 * Rejects when the secret is unset or mismatched.
 */
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { UsersRepository } from "@/app/lib/users.repository";

const syncUserSchema = z.object({
  clerkId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  mobileNumber: z.string().trim().min(1).optional(),
});

export function OPTIONS(request: Request) {
  return corsOptions(request);
}

function isAuthorized(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** CI checks the runtime DB override before provisioning users or running E2E. */
export function GET(request: Request) {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }
  return corsJson(
    {
      databaseName: process.env.MONGODB_DB_NAME,
      webhookDbReady: Boolean(
        process.env.CLERK_WEBHOOK_DB_NAME &&
          !process.env.CLERK_WEBHOOK_DB_NAME.startsWith("bgo_ci_"),
      ),
    },
    {},
    request,
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }

  const parsed = syncUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return corsJson({ error: "Invalid payload" }, { status: 400 }, request);
  }

  const db = await getDb();
  const repo = new UsersRepository(db);
  const { clerkId, email, name, avatarUrl, mobileNumber } = parsed.data;
  await repo.upsertFromClerk({
    id: clerkId,
    email,
    name,
    avatarUrl,
    mobileNumber,
    preferredLanguage: "en",
    e2e: true,
  });

  return corsJson({ ok: true, clerkId }, request);
}
