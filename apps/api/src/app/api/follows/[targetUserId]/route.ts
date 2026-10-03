import {
  badRelationshipRequest,
  relationshipOptions,
  runRelationshipOperation,
  type TargetRouteContext,
  targetFromContext,
} from "@/app/lib/relationship.http";

export const OPTIONS = relationshipOptions;

export async function PUT(request: Request, context: TargetRouteContext) {
  const targetUserId = await targetFromContext(request, context);
  if (!targetUserId) return badRelationshipRequest(request, "Invalid user id");
  return runRelationshipOperation(request, async ({ userId, service }) => {
    await service.follow(userId, targetUserId);
  });
}

export async function DELETE(request: Request, context: TargetRouteContext) {
  const targetUserId = await targetFromContext(request, context);
  if (!targetUserId) return badRelationshipRequest(request, "Invalid user id");
  return runRelationshipOperation(request, async ({ userId, service }) => {
    await service.unfollow(userId, targetUserId);
  });
}
