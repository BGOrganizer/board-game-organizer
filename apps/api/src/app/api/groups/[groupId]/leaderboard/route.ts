import { z } from "zod";
import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
const query = z
  .object({
    gameId: z.coerce.number().int().positive().optional(),
    cursor: z.coerce.number().int().min(0).max(1_000_000).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    query: z.string().trim().min(4).max(120).optional(),
  })
  .strict();
export function GET(request: Request, context: { params: Promise<{ groupId: string }> }) {
  return runRecordOperation(request, async (actor, { groups }) =>
    groups.rankings(
      actor,
      communityId((await context.params).groupId),
      recordQuery(request, query),
    ),
  );
}
