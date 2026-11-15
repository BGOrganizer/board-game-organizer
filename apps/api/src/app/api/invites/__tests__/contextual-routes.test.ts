import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";
import { GET, OPTIONS } from "../[token]/route";
import { POST as claim } from "../claim/route";
import { POST as create } from "../route";

const state = vi.hoisted(() => ({
  userId: "user_viewer" as string | null,
  create: vi.fn(),
  review: vi.fn(),
  claim: vi.fn(),
  findByToken: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId }) }));
vi.mock("@/app/lib/db", () => ({ getDb: async () => ({}), COLLECTIONS: {} }));
vi.mock("@/app/lib/invites/invites.repository", () => ({
  InvitesRepository: class {
    findByToken = state.findByToken;
  },
}));
vi.mock("@/app/lib/community/record-http", async () => {
  const { corsJson } = await import("@/app/lib/cors");
  const { CommunityError } = await import("@/app/lib/community.error");
  return {
    runRecordOperation: async (
      request: Request,
      operation: (userId: string, service: unknown) => Promise<unknown>,
      status = 200,
    ) => {
      if (!state.userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
      try {
        return corsJson(await operation(state.userId, { invites: state }), { status }, request);
      } catch (error) {
        if (!(error instanceof CommunityError)) throw error;
        return corsJson({ error: error.message }, { status: error.status }, request);
      }
    },
  };
});
const tableId = "11111111-1111-4111-8111-111111111111",
  token = "test-contextual-token";
beforeEach(() => {
  state.userId = "user_viewer";
  state.create.mockReset().mockResolvedValue({ token, expiresAt: new Date("2030-01-01Z") });
  state.review.mockReset().mockResolvedValue({ kind: "TABLE", table: { id: tableId } });
  state.claim.mockReset().mockResolvedValue({ success: true, inviter: null, table: { tableId } });
  state.findByToken.mockReset().mockResolvedValue({ token, tableId });
});
it("creates contextual links only through the transactional domain writer and receiving origin", async () => {
  const request = new Request("https://api-preview.example.test/api/invites", {
    method: "POST",
    body: JSON.stringify({ tableId, webOrigin: "https://unrelated.example.test" }),
  });
  const response = await create(request);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    token,
    link: `https://api-preview.example.test/invite/${token}`,
    email: null,
    expiresAt: "2030-01-01T00:00:00.000Z",
  });
  expect(state.create).toHaveBeenCalledWith("user_viewer", tableId);
});
it.each(["TABLE", "FRIEND"])(
  "returns the authenticated %s review without claiming it",
  async (kind) => {
    state.review.mockResolvedValue({ kind, expiresAt: "future", inviter: { id: "user_sender" } });
    const response = await GET(new Request(`https://api.example.test/api/invites/${token}`), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind });
    expect(state.review).toHaveBeenCalledWith("user_viewer", token);
    expect(state.claim).not.toHaveBeenCalled();
  },
);
it("requires authentication before exposing private review metadata", async () => {
  state.userId = null;
  const response = await GET(new Request(`https://api.example.test/api/invites/${token}`), {
    params: Promise.resolve({ token }),
  });
  expect(response.status).toBe(401);
  expect(state.review).not.toHaveBeenCalled();
});
it("rejects malformed review tokens and propagates an unavailable contextual review", async () => {
  const request = () => new Request(`https://api.example.test/api/invites/${token}`);
  expect((await GET(request(), { params: Promise.resolve({ token: "bad" }) })).status).toBe(400);
  expect(state.review).not.toHaveBeenCalled();
  state.review.mockRejectedValueOnce(new CommunityError(410, "INVITE_EXPIRED"));
  expect((await GET(request(), { params: Promise.resolve({ token }) })).status).toBe(410);
});
it("routes contextual combined consent through the single transactional domain operation", async () => {
  const input = {
    token,
    consent: true,
    participation: {
      version: 3,
      gameVotes: {},
      availability: { version: 3, dateVotes: {}, locationVotes: {} },
    },
  };
  const response = await claim(
    new Request("https://api.example.test/api/invites/claim", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  expect(response.status).toBe(200);
  expect(state.claim).toHaveBeenCalledWith("user_viewer", input);
});
it("handles the protected review route's browser preflight", () => {
  const response = OPTIONS(
    new Request("https://api.example.test/api/invites/token", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(response.status).toBe(204);
});
