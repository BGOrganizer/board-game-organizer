import { describe, expect, it, vi } from "vitest";
import { POST as claimPOST } from "@/app/api/invites/claim/route";
import { GET, POST } from "@/app/api/invites/route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(),
  withTransaction: vi.fn(async (fn: (s: unknown, db: unknown) => Promise<unknown>) =>
    fn(
      {},
      {
        collection: vi.fn(() => ({
          findOne: vi.fn(async () => null),
          findOneAndUpdate: vi.fn(async () => null),
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
  },
}));
vi.mock("@/app/lib/invites.repository", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/invites.repository")>(
    "@/app/lib/invites.repository",
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
const { InvitesRepository } = vi.mocked(await import("@/app/lib/invites.repository"));

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
vi.mocked(InvitesRepository).mockReturnValue(repoMock as never);

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
      new Request("http://x/api/invites", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBe("tok1234567890");
    expect(body.link).toContain("/invite/tok1234567890");
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

describe("GET /api/invites", () => {
  it("lists the viewer's invites", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_1" });
    repoMock.listByInviter.mockResolvedValueOnce([
      fakeInvite({ token: "tok1" }),
      fakeInvite({ token: "tok2", status: "claimed" }),
    ]);
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({ findOne: vi.fn(async () => null) })),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invites).toHaveLength(2);
    expect(body.invites[0].link).toContain("/invite/tok1");
    expect(repoMock.listByInviter).toHaveBeenCalledWith("user_1");
  });
});

describe("POST /api/invites/claim", () => {
  it("claims a pending invite (no email match → follow)", async () => {
    authMock.mockResolvedValueOnce({ userId: "claimer_1" });
    repoMock.findByToken.mockResolvedValueOnce(fakeInvite({ inviterUserId: "inviter_1" }));
    repoMock.claim.mockResolvedValueOnce(
      fakeInvite({ status: "claimed", claimedByUserId: "claimer_1" }),
    );
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({
        findOne: vi.fn(async () => ({ clerkId: "claimer_1", email: "other@x.com" })),
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
    expect(body.autoAccepted).toBe(false);
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
