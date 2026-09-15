import { auth } from "@clerk/nextjs/server";
import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { BoardGamesRepository } from "@/app/lib/boardGames.repository";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { withTransaction } from "@/app/lib/db";
import { MatchError, MatchService } from "@/app/lib/match.service";
import { MatchInvitationsRepository } from "@/app/lib/match-invitations.repository";
import { MatchesRepository } from "@/app/lib/matches.repository";
import { RelationshipRepository } from "@/app/lib/relationship.repository";
import { UsersRepository } from "@/app/lib/users.repository";

export type MatchRouteContext = { params: Promise<{ matchId: string }> };
export type MatchInvitationRouteContext = { params: Promise<{ invitationId: string }> };
export type MatchAdminInvitationRouteContext = {
  params: Promise<{ matchId: string; invitationId: string }>;
};

export interface MatchContext {
  userId: string;
  db: Db;
  session: ClientSession;
  service: MatchService;
}

const idSchema = z.uuid();
const protectionQuerySchema = z
  .object({
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export function matchOptions(request: Request) {
  return corsOptions(request);
}

export function badMatchRequest(request: Request, message = "Bad request", status = 400) {
  return corsJson({ error: message }, { status }, request);
}

export function hasValidMatchQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  return (
    protectionQuerySchema.safeParse(Object.fromEntries(params)).success &&
    params.getAll("x-vercel-protection-bypass").length <= 1
  );
}

export async function matchIdFromContext(
  request: Request,
  context: MatchRouteContext,
): Promise<string | null> {
  if (!hasValidMatchQuery(request)) return null;
  const parsed = idSchema.safeParse((await context.params).matchId);
  return parsed.success ? parsed.data : null;
}

export async function invitationIdFromContext(
  request: Request,
  context: MatchInvitationRouteContext,
): Promise<string | null> {
  if (!hasValidMatchQuery(request)) return null;
  const parsed = idSchema.safeParse((await context.params).invitationId);
  return parsed.success ? parsed.data : null;
}

export async function matchAdminInvitationIdsFromContext(
  request: Request,
  context: MatchAdminInvitationRouteContext,
): Promise<{ matchId: string; invitationId: string } | null> {
  if (!hasValidMatchQuery(request)) return null;
  const params = await context.params;
  const matchId = idSchema.safeParse(params.matchId);
  const invitationId = idSchema.safeParse(params.invitationId);
  return matchId.success && invitationId.success
    ? { matchId: matchId.data, invitationId: invitationId.data }
    : null;
}

export async function parseMatchJson(
  request: Request,
): Promise<{ data: unknown } | { response: Response }> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return {
      response: badMatchRequest(request, "Content-Type must be application/json", 415),
    };
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16_384) {
    return { response: badMatchRequest(request, "Request body too large", 413) };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { response: badMatchRequest(request, "Invalid JSON") };
  }
  return { data: json };
}

export async function runMatchOperation<T>(
  request: Request,
  operation: (context: MatchContext) => Promise<T>,
  status = 200,
) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  try {
    const result = await withTransaction(async (session, db) => {
      const service = new MatchService(
        new MatchesRepository(db, session),
        new MatchInvitationsRepository(db, session),
        new UsersRepository(db, session),
        new RelationshipRepository(db, session),
        new BoardGamesRepository(db, session),
      );
      await service.requireCurrentUser(userId);
      return operation({ userId, db, session, service });
    });
    return corsJson(result ?? { success: true }, { status }, request);
  } catch (error) {
    if (error instanceof MatchError) {
      return corsJson({ error: error.message }, { status: error.status }, request);
    }
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
