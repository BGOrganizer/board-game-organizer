import { z } from "zod";
import {
  badRelationshipRequest,
  parseRelationshipJson,
  relationshipOptions,
  runRelationshipOperation,
  type TargetRouteContext,
  targetFromContext,
} from "@/app/lib/relationship.http";

const decisionSchema = z.object({ decision: z.enum(["accept", "reject"]) }).strict();

export const OPTIONS = relationshipOptions;

export async function POST(request: Request, context: TargetRouteContext) {
  const targetUserId = await targetFromContext(request, context);
  if (!targetUserId) return badRelationshipRequest(request, "Invalid user id");
  return runRelationshipOperation(
    request,
    async ({ userId, service }) => {
      await service.sendFriendRequest(userId, targetUserId);
    },
    201,
  );
}

export async function PATCH(request: Request, context: TargetRouteContext) {
  const targetUserId = await targetFromContext(request, context);
  if (!targetUserId) return badRelationshipRequest(request, "Invalid user id");
  const body = await parseRelationshipJson(request, decisionSchema);
  if ("response" in body) return body.response;
  return runRelationshipOperation(request, async ({ userId, service }) => {
    await service.respondToFriendRequest(
      userId,
      targetUserId,
      body.data.decision === "accept" ? "accepted" : "rejected",
    );
  });
}

export async function DELETE(request: Request, context: TargetRouteContext) {
  const targetUserId = await targetFromContext(request, context);
  if (!targetUserId) return badRelationshipRequest(request, "Invalid user id");
  return runRelationshipOperation(request, async ({ userId, service }) => {
    await service.cancelFriendRequest(userId, targetUserId);
  });
}
