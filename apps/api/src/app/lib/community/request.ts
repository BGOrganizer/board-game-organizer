import { targetUserIdSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { CommunityError } from "../community.error";

const bodies = new WeakMap<Request, Promise<unknown>>();
/** MongoDB may retry callbacks: consume each request body only once. */
export async function communityBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body = bodies.get(request);
  if (!body) {
    body = request.json().catch(() => {
      throw new CommunityError(400, "INVALID_REQUEST");
    });
    bodies.set(request, body);
  }
  const parsed = schema.safeParse(await body);
  if (!parsed.success) throw new CommunityError(400, "INVALID_REQUEST");
  return parsed.data;
}
export function communityUserId(id: string): string {
  const parsed = targetUserIdSchema.safeParse(id);
  if (!parsed.success) throw new CommunityError(400, "INVALID_ID");
  return parsed.data;
}
export function communityId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new CommunityError(400, "INVALID_ID");
  return id;
}
