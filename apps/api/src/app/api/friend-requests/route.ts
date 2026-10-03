import { z } from "zod";
import {
  badRelationshipRequest,
  relationshipOptions,
  runRelationshipList,
} from "@/app/lib/relationship.http";

const querySchema = z
  .object({
    direction: z.enum(["incoming", "outgoing"]),
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export const OPTIONS = relationshipOptions;

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (params.getAll("direction").length !== 1) {
    return badRelationshipRequest(request, "Invalid direction");
  }
  if (!parsed.success) return badRelationshipRequest(request, "Invalid direction");
  return runRelationshipList(request, parsed.data.direction === "incoming" ? "pending" : "sent");
}
