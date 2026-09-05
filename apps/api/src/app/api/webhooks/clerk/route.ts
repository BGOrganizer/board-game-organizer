import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getDb } from "@/app/lib/db";
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
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const repo = new UsersRepository(await getDb());
  const data = event.data;

  switch (event.type) {
    case "user.created":
    case "user.updated": {
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
        preferredLanguage: normalizeLocale(data.preferred_language as string | undefined),
        plan: (data.plan as string | undefined) ?? undefined,
        e2e:
          (data.public_metadata as { e2e?: boolean } | undefined)?.e2e === true ? true : undefined,
      });
      return NextResponse.json({ success: true });
    }
    case "user.deleted": {
      await repo.deleteByClerkId(data.id as string);
      return NextResponse.json({ success: true });
    }
    default:
      // Unknown events (session.*, email.*, ...) are intentionally ignored.
      return NextResponse.json({ success: true });
  }
}
