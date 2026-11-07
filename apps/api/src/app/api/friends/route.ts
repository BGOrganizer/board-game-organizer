import {
  badRelationshipRequest,
  hasOnlyProtectionBypassQuery,
  relationshipOptions,
  runRelationshipList,
} from "@/app/lib/contacts/relationship.http";

export const OPTIONS = relationshipOptions;

export function GET(request: Request) {
  if (!hasOnlyProtectionBypassQuery(request)) return badRelationshipRequest(request);
  return runRelationshipList(request, "friends");
}
