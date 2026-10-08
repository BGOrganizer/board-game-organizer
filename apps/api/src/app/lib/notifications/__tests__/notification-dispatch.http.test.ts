import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_1" })),
  after: vi.fn((work: () => unknown) => work()),
  dispatch: vi.fn(async () => undefined),
  requireCurrentUser: vi.fn(async () => undefined),
  ensureCurrentUser: vi.fn(async () => undefined),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/app/lib/db", () => ({
  withTransaction: vi.fn(async (work) => work({ id: "session" }, {})),
  getDb: vi.fn(async () => ({})),
}));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: mocks.ensureCurrentUser }));
vi.mock("@/app/lib/notifications/push", () => ({ dispatchNotifications: mocks.dispatch }));
vi.mock("@/app/lib/notifications/notifications.repository", () => ({
  NotificationsRepository: vi.fn((_db, _session, createdIds?: ObjectId[]) => {
    createdIds?.push(new ObjectId("0123456789abcdef01234567"));
    return {};
  }),
}));
vi.mock("@/app/lib/contacts/relationship.repository", () => ({ RelationshipRepository: vi.fn() }));
vi.mock("@/app/lib/contacts/relationship.service", () => ({
  RelationshipError: class extends Error {},
  RelationshipService: vi.fn(() => ({ requireCurrentUser: mocks.requireCurrentUser })),
}));
vi.mock("@/app/lib/matches/matches.repository", () => ({ MatchesRepository: vi.fn() }));
vi.mock("@/app/lib/events/events.repository", () => ({ EventsRepository: class {} }));
vi.mock("@/app/lib/organizations/organizations.repository", () => ({
  OrganizationsRepository: class {},
}));
vi.mock("@/app/lib/organizations/organization-assets.repository", () => ({
  OrganizationAssetsRepository: class {},
}));
vi.mock("@/app/lib/matches/match-invitations.repository", () => ({
  MatchInvitationsRepository: vi.fn(),
}));
vi.mock("@/app/lib/users/users.repository", () => ({ UsersRepository: vi.fn() }));
vi.mock("@/app/lib/games/boardGames.repository", () => ({ BoardGamesRepository: vi.fn() }));
vi.mock("@/app/lib/matches/match.service", () => ({
  MatchError: class extends Error {},
  MatchService: vi.fn(() => ({ requireCurrentUser: mocks.requireCurrentUser })),
}));

import { runRelationshipOperation } from "../../contacts/relationship.http";
import { runMatchOperation } from "../../matches/match.http";

describe("post-commit notification delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches match notification ids after transaction success", async () => {
    const response = await runMatchOperation(new Request("http://x"), async () => ({ ok: true }));
    expect(response.status).toBe(200);
    expect(mocks.ensureCurrentUser).toHaveBeenCalledWith("user_1", {});
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.dispatch).toHaveBeenCalledWith([new ObjectId("0123456789abcdef01234567")]);
  });

  it("dispatches relationship notification ids after transaction success", async () => {
    const response = await runRelationshipOperation(new Request("http://x"), async () => ({
      ok: true,
    }));
    expect(response.status).toBe(200);
    expect(mocks.ensureCurrentUser).toHaveBeenCalledWith("user_1", {});
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.dispatch).toHaveBeenCalledWith([new ObjectId("0123456789abcdef01234567")]);
  });
});
