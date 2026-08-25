#!/usr/bin/env tsx
/**
 * Backfill: mirrors ALL existing Clerk users into the `users` collection.
 * Idempotent (upserts) — safe to re-run. Needs CLERK_SECRET_KEY.
 */
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "../src/app/lib/db";
import { UsersRepository } from "../src/app/lib/users.repository";

async function main() {
  const client = await clerkClient();
  const repo = new UsersRepository(await getDb());

  let total = 0;
  let offset = 0;
  for (;;) {
    const page = await client.users.getUserList({ limit: 100, offset });
    if (!page.data.length) break;
    for (const u of page.data) {
      const email = u.emailAddresses[0]?.emailAddress ?? "";
      await repo.upsertFromClerk({
        id: u.id,
        email,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || email,
        avatarUrl: u.imageUrl || undefined,
        preferredLanguage: "en",
        e2e: (u.publicMetadata as { e2e?: boolean } | undefined)?.e2e === true ? true : undefined,
      });
      total += 1;
    }
    offset += page.data.length;
    console.log(`backfilled ${offset} users...`);
  }
  console.log(`done: ${total} users`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
