import { developmentInviteAppLink } from "@board-game-organizer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as claimPOST } from "@/app/api/invites/claim/route";
import { POST } from "@/app/api/invites/route";

vi.mock("@/app/lib/invites/development-invite-publication", () => ({
  developmentInvitePublication: vi.fn().mockResolvedValue("eligible"),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(),
  withTransaction: vi.fn(async (fn: (s: unknown, db: unknown) => Promise<unknown>) =>
    fn(
      {},
      {
        collection: vi.fn(() => ({
          findOne: vi.fn(async () => null),
          countDocuments: vi.fn(async () => 0),
          findOneAndUpdate: vi.fn(async () => ({
            _id: "friendship-receipt",
            updatedAt: new Date(),
            respondedAt: new Date(),
          })),
          updateOne: vi.fn(async () => ({ acknowledged: true })),
          insertOne: vi.fn(async () => ({ insertedId: "id" })),
          find: vi.fn(() => ({
            sort: vi.fn(() => ({ limit: vi.fn(() => ({ toArray: async () => [] })) })),
          })),
          updateMany: vi.fn(async () => ({ modifiedCount: 0 })),
        })),
      },
    ),
  ),
  COLLECTIONS: {
    USERS: "users",
    FOLLOWS: "follows",
    FRIEND_REQUESTS: "friendRequests",
    BLOCKS: "blocks",
    INVITES: "invites",
    PROFILE_ACTIVITIES: "profileActivities",
  },
}));
vi.mock("@/app/lib/invites/invites.repository", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/invites/invites.repository")>(
    "@/app/lib/invites/invites.repository",
  );
  return {
    InvitesRepository: Object.assign(vi.fn(), {
      generateToken: actual.InvitesRepository.generateToken,
      ttlMs: actual.InvitesRepository.ttlMs,
    }),
  };
});

const { auth } = vi.mocked(await import("@clerk/nextjs/server"));
const { getDb } = vi.mocked(await import("@/app/lib/db"));
const { InvitesRepository } = vi.mocked(await import("@/app/lib/invites/invites.repository"));

const authMock = vi.mocked(auth as unknown as () => Promise<{ userId: string | null }>);
const getDbMock = vi.mocked(
  getDb as unknown as () => Promise<{ collection: ReturnType<typeof vi.fn> }>,
);
const repoMock = {
  create: vi.fn(),
  findByToken: vi.fn(),
  listByInviter: vi.fn(),
  claim: vi.fn(),
};
vi.mocked(InvitesRepository).mockImplementation(function MockInvitesRepository() {
  return repoMock as never;
});

function fakeInvite(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    token: "tok1234567890",
    inviterUserId: "inviter_1",
    status: "pending",
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    createdAt: now,
    ...overrides,
  };
}

describe("POST /api/invites", () => {
  it("creates an invite and returns the shareable link", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_1" });
    repoMock.create.mockResolvedValueOnce(fakeInvite({ token: "tok1234567890" }));
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({ findOne: vi.fn(async () => null) })),
    });

    const res = await POST(
      new Request("https://api-preview.vercel.app/api/invites", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBe("tok1234567890");
    // The link points at THIS API (the origin that received the request),
    // so preview deployments generate preview links, production → production.
    expect(body.link).toBe("https://api-preview.vercel.app/invite/tok1234567890");
    expect(repoMock.create).toHaveBeenCalledWith("user_1", undefined);
  });

  it("rejects an invalid email", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_1" });
    const res = await POST(
      new Request("http://x/api/invites", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    const res = await POST(new Request("http://x/api/invites", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/invites/claim", () => {
  it("claims a pending invite and connects as mutual followers/friends", async () => {
    authMock.mockResolvedValueOnce({ userId: "claimer_1" });
    repoMock.findByToken.mockResolvedValueOnce(fakeInvite({ inviterUserId: "inviter_1" }));
    repoMock.claim.mockResolvedValueOnce(
      fakeInvite({ status: "claimed", claimedByUserId: "claimer_1" }),
    );
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({
        findOne: vi.fn(async () => null),
      })),
    });

    const res = await claimPOST(
      new Request("http://x/api/invites/claim", {
        method: "POST",
        body: JSON.stringify({ token: "tok1234567890" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.autoAccepted).toBeUndefined();
    expect(repoMock.claim).toHaveBeenCalledWith("tok1234567890", "claimer_1");
  });

  it("returns 404 for an unknown token", async () => {
    authMock.mockResolvedValueOnce({ userId: "claimer_1" });
    repoMock.findByToken.mockResolvedValueOnce(null);
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({ findOne: vi.fn(async () => null) })),
    });

    const res = await claimPOST(
      new Request("http://x/api/invites/claim", {
        method: "POST",
        body: JSON.stringify({ token: "tok1234567890" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 for an already-claimed invite", async () => {
    authMock.mockResolvedValueOnce({ userId: "claimer_1" });
    repoMock.findByToken.mockResolvedValueOnce(fakeInvite({ status: "claimed" }));
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({ findOne: vi.fn(async () => null) })),
    });

    const res = await claimPOST(
      new Request("http://x/api/invites/claim", {
        method: "POST",
        body: JSON.stringify({ token: "tok1234567890" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 410 for an expired invite", async () => {
    authMock.mockResolvedValueOnce({ userId: "claimer_1" });
    repoMock.findByToken.mockResolvedValueOnce(
      fakeInvite({ expiresAt: new Date(Date.now() - 1000) }),
    );
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({ findOne: vi.fn(async () => null) })),
    });

    const res = await claimPOST(
      new Request("http://x/api/invites/claim", {
        method: "POST",
        body: JSON.stringify({ token: "tok1234567890" }),
      }),
    );
    expect(res.status).toBe(410);
  });
});

describe("OPTIONS /api/invites", () => {
  it("returns CORS headers echoing the request origin", async () => {
    const { OPTIONS } = await import("../route");
    const req = new Request("http://localhost/api/invites", {
      method: "OPTIONS",
      headers: { origin: "https://web-x-board-game-organizers-projects.vercel.app" },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://web-x-board-game-organizers-projects.vercel.app",
    );
  });
});

it("keeps the optional email in a legacy invite response", async () => {
  authMock.mockResolvedValueOnce({ userId: "user_1" });
  repoMock.create.mockResolvedValueOnce(fakeInvite({ email: "friend@example.test" }));
  getDbMock.mockResolvedValueOnce({ collection: vi.fn() });
  const response = await POST(
    new Request("https://api.example.test/api/invites", {
      method: "POST",
      body: JSON.stringify({ email: "friend@example.test" }),
    }),
  );
  expect(await response.json()).toMatchObject({ email: "friend@example.test" });
  expect(repoMock.create).toHaveBeenLastCalledWith("user_1", "friend@example.test");
});
it("accepts an absent create body while rejecting malformed claim bodies", async () => {
  authMock.mockResolvedValueOnce({ userId: "user_1" });
  repoMock.create.mockResolvedValueOnce(fakeInvite());
  getDbMock.mockResolvedValueOnce({ collection: vi.fn() });
  expect(
    (await POST(new Request("https://api.example.test/api/invites", { method: "POST" }))).status,
  ).toBe(201);
  for (const body of ["invalid json", "{}", JSON.stringify({ token: "bad" })]) {
    authMock.mockResolvedValueOnce({ userId: "user_1" });
    expect(
      (
        await claimPOST(
          new Request("https://api.example.test/api/invites/claim", { method: "POST", body }),
        )
      ).status,
    ).toBe(400);
  }
});
it("rejects unauthenticated and self claims before consuming a link", async () => {
  authMock.mockResolvedValueOnce({ userId: null });
  expect(
    (
      await claimPOST(
        new Request("https://api.example.test/api/invites/claim", { method: "POST", body: "{}" }),
      )
    ).status,
  ).toBe(401);
  authMock.mockResolvedValueOnce({ userId: "inviter_1" });
  getDbMock.mockResolvedValueOnce({ collection: vi.fn() });
  repoMock.findByToken.mockResolvedValueOnce(fakeInvite());
  expect(
    (
      await claimPOST(
        new Request("https://api.example.test/api/invites/claim", {
          method: "POST",
          body: JSON.stringify({ token: "tok1234567890" }),
        }),
      )
    ).status,
  ).toBe(400);
});
it("returns conflict when a pending legacy claim loses the transaction race", async () => {
  authMock.mockResolvedValueOnce({ userId: "claimer_1" });
  getDbMock.mockResolvedValueOnce({ collection: vi.fn() });
  repoMock.findByToken.mockResolvedValueOnce(fakeInvite());
  repoMock.claim.mockResolvedValueOnce(null);
  expect(
    (
      await claimPOST(
        new Request("https://api.example.test/api/invites/claim", {
          method: "POST",
          body: JSON.stringify({ token: "tok1234567890" }),
        }),
      )
    ).status,
  ).toBe(409);
});
it.each([null, "https://avatar.example.test/image.png"])(
  "returns the authoritative legacy inviter profile (avatar %s)",
  async (avatarUrl) => {
    authMock.mockResolvedValueOnce({ userId: "claimer_1" });
    const inviter = {
      clerkId: "inviter_1",
      name: "Inviter",
      email: "inviter@example.test",
      ...(avatarUrl ? { avatarUrl } : {}),
    };
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({ findOne: vi.fn(async () => inviter) })),
    });
    repoMock.findByToken.mockResolvedValueOnce(fakeInvite());
    repoMock.claim.mockResolvedValueOnce(fakeInvite({ status: "claimed" }));
    const response = await claimPOST(
      new Request("https://api.example.test/api/invites/claim", {
        method: "POST",
        body: JSON.stringify({ token: "tok1234567890" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      inviter: { id: "inviter_1", name: "Inviter", email: "inviter@example.test", avatarUrl },
    });
  },
);
it("supports legacy claim CORS preflight", async () => {
  const { OPTIONS } = await import("../claim/route");
  expect((await OPTIONS()).status).toBe(204);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("keeps friend links canonical while advertising verified Preview app routing", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  const origin = "https://api-development-pr-25-board-game-organizers-projects.vercel.app";
  const canonicalToken = "abcdefghijklmnopqrstuv";
  const { appLinkAssociation } = await import("@/app/lib/invites/app-link-association");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(appLinkAssociation(true))));
  authMock.mockResolvedValueOnce({ userId: "user_1" });
  repoMock.create.mockResolvedValueOnce(fakeInvite({ token: canonicalToken }));
  getDbMock.mockResolvedValueOnce({ collection: vi.fn() });
  const response = await POST(new Request(`${origin}/api/invites`, { method: "POST", body: "{}" }));
  const link = `${origin}/invite/${canonicalToken}`;
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ link, appLink: developmentInviteAppLink(link) });
});
