import {
  pushSubscriptionSchema,
  removePushSubscriptionSchema,
} from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import type { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { PushSubscriptionsRepository } from "@/app/lib/push-subscriptions.repository";

export const OPTIONS = corsOptions;

function validQuery(request: Request): boolean {
  const params = new URL(request.url).searchParams;
  return (
    ![...params.keys()].some((key) => key !== "x-vercel-protection-bypass") &&
    params.getAll("x-vercel-protection-bypass").length <= 1
  );
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>) {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8_192) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  if (!validQuery(request)) return corsJson({ error: "Invalid query" }, { status: 400 }, request);
  const body = await parseBody(request, pushSubscriptionSchema);
  if (!body) return corsJson({ error: "Invalid request body" }, { status: 400 }, request);

  try {
    await new PushSubscriptionsRepository(await getDb()).upsert(
      userId,
      body.token,
      body.platform,
      body.locale,
    );
    return corsJson({ success: true }, { status: 201 }, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  if (!validQuery(request)) return corsJson({ error: "Invalid query" }, { status: 400 }, request);
  const body = await parseBody(request, removePushSubscriptionSchema);
  if (!body) return corsJson({ error: "Invalid request body" }, { status: 400 }, request);

  try {
    await new PushSubscriptionsRepository(await getDb()).remove(userId, body.token);
    return corsJson({ success: true }, {}, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
