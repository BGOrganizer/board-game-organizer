import type { User } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ContactLinksRepository } from "@/app/lib/contacts/contacts.repository";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";

/**
 * GET /api/users/suggestions
 *
 * Follow suggestions = the user's device contacts who are registered on
 * Board Game Organizer (persisted in `contactLinks` after address-book
 * consent). No contacts synced → empty list; `hasContacts` tells the UI
 * whether to show the "Add contacts" call-to-action.
 *
 * `blockedMe` users are excluded (the blocked user must not see the blocker
 * as a suggestion).
 */
/** CORS preflight. */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const params = new URL(request.url).searchParams;
  if (
    ["limit", "cursor", "x-vercel-protection-bypass"].some((key) => params.getAll(key).length > 1)
  )
    return corsJson({ error: "Invalid list query" }, { status: 400 }, request);
  const pageQuery = z
    .object({
      limit: z.coerce.number().int().min(1).max(50).optional(),
      cursor: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/)
        .optional(),
      "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
    })
    .strict()
    .safeParse(Object.fromEntries(params));
  if (!pageQuery.success)
    return corsJson({ error: "Invalid list query" }, { status: 400 }, request);

  const db = await getDb();
  const repo = new ContactLinksRepository(db);
  const contactClerkIds = await repo.contactClerkIdsForUser(userId);

  if (!contactClerkIds.length) {
    return corsJson({ users: [], nextCursor: null, hasContacts: false }, {}, request);
  }

  const [blockedByMe, blockedMe] = await Promise.all([
    db.collection(COLLECTIONS.BLOCKS).find({ fromUserId: userId }).toArray(),
    db.collection(COLLECTIONS.BLOCKS).find({ toUserId: userId }).toArray(),
  ]);
  const blockedIds = new Set([
    ...blockedByMe.map((b) => b.toUserId),
    ...blockedMe.map((b) => b.fromUserId),
  ]);

  const following = await db.collection(COLLECTIONS.FOLLOWS).find({ fromUserId: userId }).toArray();
  const followingIds = new Set(following.map((f) => f.toUserId));
  followingIds.add(userId);

  const users = await db
    .collection<User>(COLLECTIONS.USERS)
    .find({ clerkId: { $in: contactClerkIds } }, { projection: { _id: 0 } })
    .toArray();

  const suggestions = users
    .filter((u) => !followingIds.has(u.clerkId) && !blockedIds.has(u.clerkId))
    .map((u) => ({
      id: u.clerkId,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl ?? null,
      presence: u.presence,
      // Always false here (non-followers only), kept for a coherent shape.
      isFollowing: false,
    }));

  if (!pageQuery.data.limit)
    return corsJson({ users: suggestions, nextCursor: null, hasContacts: true }, {}, request);
  const rows = suggestions
    .filter((user) => !pageQuery.data.cursor || user.id > pageQuery.data.cursor)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, pageQuery.data.limit + 1);
  const hasMore = rows.length > pageQuery.data.limit;
  const usersPage = rows.slice(0, pageQuery.data.limit);
  return corsJson(
    {
      users: usersPage,
      nextCursor: hasMore ? usersPage[usersPage.length - 1].id : null,
      hasContacts: true,
    },
    {},
    request,
  );
}
