import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { CommunityError } from "./community.error";
import { corsJson } from "./cors";
import { getDb, withTransaction } from "./db";
import { ensureCurrentUser } from "./ensureCurrentUser";
import { OrganizationAssetsRepository } from "./organization-assets.repository";
import { OrganizationAssetsService } from "./organization-assets.service";
import { OrganizationsRepository } from "./organizations.repository";
import { UsersRepository } from "./users.repository";

export async function communityBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new CommunityError(400, "INVALID_REQUEST");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new CommunityError(400, "INVALID_REQUEST");
  return parsed.data;
}
export function communityId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new CommunityError(400, "INVALID_ID");
  return id;
}
export async function runOrganizationAssetOperation<T>(
  request: Request,
  operation: (userId: string, service: OrganizationAssetsService) => Promise<T>,
  status = 200,
) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  try {
    await ensureCurrentUser(userId, await getDb());
    const result = await withTransaction((session, db) =>
      operation(
        userId,
        new OrganizationAssetsService(
          new OrganizationAssetsRepository(db, session),
          new OrganizationsRepository(db, session),
          new UsersRepository(db, session),
        ),
      ),
    );
    return corsJson(result, { status }, request);
  } catch (error) {
    if (error instanceof CommunityError)
      return corsJson({ error: error.code }, { status: error.status }, request);
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
