import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_1" })),
  after: vi.fn((work: () => unknown) => work()),
  dispatch: vi.fn(async () => undefined),
  requireCurrentUser: vi.fn(async () => undefined),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/app/lib/db", () => ({
  withTransaction: vi.fn(async (work) => work({ id: "session" }, {})),
}));
vi.mock("@/app/lib/push", () => ({ dispatchNotifications: mocks.dispatch }));
vi.mock("@/app/lib/notifications.repository", () => ({
  NotificationsRepository: vi.fn((_db, _session, createdIds?: ObjectId[]) => {
    createdIds?.push(new ObjectId("0123456789abcdef01234567"));
    return {};
  }),
}));
vi.mock("@/app/lib/relationship.repository", () => ({ RelationshipRepository: vi.fn() }));
vi.mock("@/app/lib/relationship.service", () => ({
  RelationshipError: class extends Error {},
  RelationshipService: vi.fn(() => ({ requireCurrentUser: mocks.requireCurrentUser })),
}));
vi.mock("@/app/lib/matches.repository", () => ({ MatchesRepository: vi.fn() }));
vi.mock("@/app/lib/match-invitations.repository", () => ({ MatchInvitationsRepository: vi.fn() }));
vi.mock("@/app/lib/users.repository", () => ({ UsersRepository: vi.fn() }));
vi.mock("@/app/lib/boardGames.repository", () => ({ BoardGamesRepository: vi.fn() }));
vi.mock("@/app/lib/match.service", () => ({
  MatchError: class extends Error {},
  MatchService: vi.fn(() => ({ requireCurrentUser: mocks.requireCurrentUser })),
}));

import { runMatchOperation } from "../match.http";
import { runRelationshipOperation } from "../relationship.http";

describe("post-commit notification delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches match notification ids after transaction success", async () => {
    const response = await runMatchOperation(new Request("http://x"), async () => ({ ok: true }));
    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.dispatch).toHaveBeenCalledWith([new ObjectId("0123456789abcdef01234567")]);
  });

  it("dispatches relationship notification ids after transaction success", async () => {
    const response = await runRelationshipOperation(new Request("http://x"), async () => ({
      ok: true,
    }));
    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.dispatch).toHaveBeenCalledWith([new ObjectId("0123456789abcdef01234567")]);
  });
});
