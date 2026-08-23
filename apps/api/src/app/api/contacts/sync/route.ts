// apps/api/src/app/api/contacts/sync/route.ts
import type { User } from "@board-game-organizer/schemas";
import { syncContactsSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { ContactLinksRepository } from "@/app/lib/contacts.repository";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";

/**
 * POST /api/contacts/sync
 *
 * Receives the device address-book emails (sent only after the user granted
 * permission) and persists the registered-user matches in `contactLinks`.
 * Non-matching emails are never stored. Returns the matched users so the UI
 * can refresh suggestions immediately.
 */
export function OPTIONS() {
  return corsOptions();
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

  const parsed = syncContactsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return corsJson({ error: "Invalid payload" }, { status: 400 });

  const emails = parsed.data.emails.map((e) => e.trim().toLowerCase());

  const db = await getDb();
  const registered = await db
    .collection<User>(COLLECTIONS.USERS)
    .find({ email: { $in: emails } }, { projection: { _id: 0, clerkId: 1, email: 1 } })
    .toArray();

  const matches = registered.map((u) => ({ contactClerkId: u.clerkId, email: u.email }));

  const repo = new ContactLinksRepository(db);
  const stored = await repo.replaceForUser(userId, matches);

  return corsJson({ stored, users: matches });
}
