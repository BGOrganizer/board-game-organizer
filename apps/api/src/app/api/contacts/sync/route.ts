// apps/api/src/app/api/contacts/sync/route.ts
import {
  normalizePhoneNumberForMatching,
  syncContactsSchema,
  type User,
} from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { ContactLinksRepository } from "@/app/lib/contacts.repository";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";

/**
 * POST /api/contacts/sync
 *
 * Matches consented device emails and phone numbers against registered users.
 * Only matched Clerk IDs are persisted; unmatched address-book values are discarded.
 * Duplicate unverified phone numbers are treated as ambiguous and ignored.
 */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const parsed = syncContactsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return corsJson({ error: "Invalid payload" }, { status: 400 }, request);

  const emailSet = new Set(parsed.data.emails.map((email) => email.trim().toLowerCase()));
  const phoneSet = new Set(
    parsed.data.phoneNumbers
      .map(normalizePhoneNumberForMatching)
      .filter((phone): phone is string => Boolean(phone)),
  );
  const filters = [
    ...(emailSet.size ? [{ email: { $in: [...emailSet] } }] : []),
    ...(phoneSet.size ? [{ mobileNumberNormalized: { $in: [...phoneSet] } }] : []),
  ];

  const db = await getDb();
  const registered = filters.length
    ? await db
        .collection<User>(COLLECTIONS.USERS)
        .find(
          { $or: filters },
          { projection: { _id: 0, clerkId: 1, email: 1, mobileNumberNormalized: 1 } },
        )
        .toArray()
    : [];

  const phoneCounts = new Map<string, number>();
  for (const user of registered) {
    const phone = user.mobileNumberNormalized;
    if (phone && phoneSet.has(phone)) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
  }

  const matches = registered
    .filter((user) => {
      if (user.clerkId === userId) return false;
      const emailMatches = emailSet.has(user.email.trim().toLowerCase());
      const phone = user.mobileNumberNormalized;
      return emailMatches || Boolean(phone && phoneCounts.get(phone) === 1);
    })
    .map((user) => ({ contactClerkId: user.clerkId, email: user.email }));

  const stored = await new ContactLinksRepository(db).replaceForUser(userId, matches);
  return corsJson({ stored, users: matches }, request);
}
