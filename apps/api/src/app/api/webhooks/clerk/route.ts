import { getMobileNumber } from "@board-game-organizer/schemas";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getDb, withTransaction } from "@/app/lib/db";
import { NotificationsRepository } from "@/app/lib/notifications.repository";
import { RelationshipRepository } from "@/app/lib/relationship.repository";
import { UsersRepository } from "@/app/lib/users.repository";

/**
 * Clerk webhook (`user.created` / `user.updated` / `user.deleted`).
 *
 * Mirrors the Clerk user into the `users` collection so contact search,
 * invites and presence operate on local data instead of hitting the Clerk
 * API for every read. Signature-verified with the SVIX secret
 * (`CLERK_WEBHOOK_SECRET`).
 */

function normalizeLocale(value: string | null | undefined): "en" | "it" {
  return value?.split("-")[0]?.toLowerCase() === "it" ? "it" : "en";
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CLERK_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn("Clerk webhook rejected: missing Svix headers", {
      hasSvixId: Boolean(svixId),
      hasSvixTimestamp: Boolean(svixTimestamp),
      hasSvixSignature: Boolean(svixSignature),
    });
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await request.text();
  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    event = JSON.parse(payload) as { type: string; data: Record<string, unknown> };
  } catch {
    console.warn("Clerk webhook rejected: invalid signature", { svixId });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.info("Clerk webhook verified", { eventType: event.type, svixId });

  const data = event.data;
  const appDbName = process.env.MONGODB_DB_NAME;
  const webhookDbName = process.env.CLERK_WEBHOOK_DB_NAME || appDbName;
  if (
    !webhookDbName ||
    (appDbName?.startsWith("bgo_ci_") &&
      (webhookDbName === appDbName || webhookDbName.startsWith("bgo_ci_")))
  ) {
    // Svix retries a 503; never mirror dev users into an ephemeral E2E database.
    return NextResponse.json({ error: "Webhook database not configured" }, { status: 503 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      // CI users are mirrored directly into their run's DB by admin/sync-user.
      if (
        process.env.CLERK_WEBHOOK_DB_NAME &&
        data.public_metadata &&
        (data.public_metadata as { e2e?: boolean }).e2e === true
      ) {
        return NextResponse.json({ success: true });
      }
      const repo = new UsersRepository(await getDb(webhookDbName));
      const email =
        (data.email_addresses as { email_address?: string }[] | undefined)?.[0]?.email_address ??
        "";
      const firstName = (data.first_name as string) ?? "";
      const lastName = (data.last_name as string) ?? "";
      await repo.upsertFromClerk({
        id: data.id as string,
        email,
        name: [firstName, lastName].filter(Boolean).join(" ") || email,
        avatarUrl: (data.image_url as string | undefined) ?? undefined,
        mobileNumber: getMobileNumber(data.unsafe_metadata) ?? null,
        preferredLanguage: normalizeLocale(data.preferred_language as string | undefined),
        plan: (data.plan as string | undefined) ?? undefined,
        e2e:
          (data.public_metadata as { e2e?: boolean } | undefined)?.e2e === true ? true : undefined,
      });
      return NextResponse.json({ success: true });
    }
    case "user.deleted": {
      // Delete events omit public_metadata. Skip unknown CI users instead of
      // running a transaction against dev; clean old mirrored users if present.
      if (!(await new UsersRepository(await getDb(webhookDbName)).findById(data.id as string))) {
        return NextResponse.json({ success: true });
      }
      await withTransaction(async (session, db) => {
        await new UsersRepository(db, session).deleteByClerkId(data.id as string);
        await new RelationshipRepository(db, session).deleteAllForUser(data.id as string);
        await new NotificationsRepository(db, session).deleteForUser(data.id as string);
      }, webhookDbName);
      return NextResponse.json({ success: true });
    }
    default:
      // Unknown events (session.*, email.*, ...) are intentionally ignored.
      return NextResponse.json({ success: true });
  }
}
