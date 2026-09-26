import { z } from "zod";
import {
  badRelationshipRequest,
  parseRelationshipJson,
  relationshipOptions,
  runRelationshipList,
  runRelationshipOperation,
  targetUserIdSchema,
} from "@/app/lib/relationship.http";
import type { RelationshipListType } from "@/app/lib/relationship.service";

const listTypeSchema = z.enum(["followers", "following", "friends", "pending", "sent", "blocked"]);
const createTypeSchema = z.enum(["follow", "friend_request", "block"]);
const removeTypeSchema = z.enum(["follow", "friend_request", "friend", "block"]);
const bodySchema = z.object({ targetUserId: targetUserIdSchema }).strict();
const querySchema = z
  .object({
    type: z.string(),
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export const OPTIONS = relationshipOptions;

function queryType(request: Request) {
  const params = new URL(request.url).searchParams;
  if (
    params.getAll("type").length !== 1 ||
    params.getAll("x-vercel-protection-bypass").length > 1
  ) {
    return null;
  }
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  return parsed.success ? parsed.data.type : null;
}

export function GET(request: Request) {
  const parsed = listTypeSchema.safeParse(queryType(request));
  if (!parsed.success) return badRelationshipRequest(request, "Invalid type");
  return runRelationshipList(request, parsed.data as RelationshipListType);
}

export async function POST(request: Request) {
  const type = createTypeSchema.safeParse(queryType(request));
  if (!type.success) return badRelationshipRequest(request, "Invalid type");
  const body = await parseRelationshipJson(request, bodySchema);
  if ("response" in body) return body.response;
  const { targetUserId } = body.data;

  return runRelationshipOperation(request, async ({ userId, service }) => {
    if (type.data === "follow") await service.follow(userId, targetUserId);
    else if (type.data === "friend_request") {
      await service.sendFriendRequest(userId, targetUserId);
    } else await service.block(userId, targetUserId);
  });
}

export async function PATCH(request: Request) {
  if (queryType(request) !== "friend_request") {
    return badRelationshipRequest(request, "Invalid type");
  }
  const body = await parseRelationshipJson(request, bodySchema);
  if ("response" in body) return body.response;
  return runRelationshipOperation(request, async ({ userId, service }) => {
    await service.respondToFriendRequest(userId, body.data.targetUserId, "accepted");
  });
}

export async function DELETE(request: Request) {
  const type = removeTypeSchema.safeParse(queryType(request));
  if (!type.success) return badRelationshipRequest(request, "Invalid type");
  const body = await parseRelationshipJson(request, bodySchema);
  if ("response" in body) return body.response;
  const { targetUserId } = body.data;

  return runRelationshipOperation(request, async ({ userId, service }) => {
    if (type.data === "follow") await service.unfollow(userId, targetUserId);
    else if (type.data === "friend_request") {
      await service.cancelFriendRequest(userId, targetUserId);
    } else if (type.data === "friend") await service.unfriend(userId, targetUserId);
    else await service.unblock(userId, targetUserId);
  });
}
