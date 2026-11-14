import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";
import { GET, OPTIONS } from "../route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "viewer" as string | null })),
  db: { owned: true },
  getDb: vi.fn(),
  page: vi.fn(async () => ({ items: [], nextCursor: null, sourceEpoch: "epoch" })),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/app/lib/games/bgg-picker", () => ({ bggPickerPage: mocks.page }));
const request = (query: string) => new Request(`http://localhost/api/bgg/picker?${query}`);
const event = "11111111-1111-4111-8111-111111111111";
const table = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "viewer" });
  mocks.getDb.mockResolvedValue(mocks.db);
  mocks.page.mockResolvedValue({ items: [], nextCursor: null, sourceEpoch: "epoch" });
});

it("requires authentication before reading a source or database", async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  expect((await GET(request("query=Azul"))).status).toBe(401);
  expect(mocks.page).not.toHaveBeenCalled();
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it.each([
  "limit=0",
  "limit=51",
  "collection=2",
  "participants=true",
  "unknown=1",
  `query=${"a".repeat(121)}`,
  `cursor=${"x".repeat(513)}`,
  `proposalEventId=${event}`,
  `proposalTableId=${table}`,
  `participantEventId=${event}`,
  `participantTableId=${table}`,
  "participants=1",
  `proposalEventId=${event}&proposalTableId=${table}&participantEventId=${event}&participantTableId=${table}`,
])("rejects invalid or ambiguous source input before database access: %s", async (query) => {
  expect((await GET(request(query))).status).toBe(400);
  expect(mocks.page).not.toHaveBeenCalled();
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it("forwards validated source filters and opaque cursors, never derives authority in the controller", async () => {
  const response = await GET(
    request(
      `query=%20Azul%20&collection=1&participants=1&participantEventId=${event}&participantTableId=${table}&limit=5&cursor=opaque`,
    ),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], nextCursor: null, sourceEpoch: "epoch" });
  expect(mocks.page).toHaveBeenCalledWith(mocks.db, "viewer", {
    query: "Azul",
    collection: "1",
    participants: "1",
    limit: 5,
    cursor: "opaque",
    participantEventId: event,
    participantTableId: table,
  });
});

it("retains paired proposal context and protection bypass input", async () => {
  expect(
    (
      await GET(
        request(
          `proposalEventId=${event}&proposalTableId=${table}&x-vercel-protection-bypass=test`,
        ),
      )
    ).status,
  ).toBe(200);
  expect(mocks.page.mock.calls[0]).toEqual([
    mocks.db,
    "viewer",
    {
      query: "",
      collection: "0",
      participants: "0",
      limit: 25,
      proposalEventId: event,
      proposalTableId: table,
      "x-vercel-protection-bypass": "test",
    },
  ]);
  expect(
    OPTIONS(new Request("http://localhost/api/bgg/picker", { method: "OPTIONS" })).status,
  ).toBe(204);
});

it("preserves typed source/auth/conflict errors and keeps unexpected failures observable without private details", async () => {
  for (const status of [403, 404, 409]) {
    mocks.page.mockRejectedValueOnce(new CommunityError(status, "SOURCE_DENIED"));
    const response = await GET(request("query=Azul"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "SOURCE_DENIED" });
  }
  mocks.page.mockRejectedValueOnce(new Error("private provider/database details"));
  const failed = await GET(request("query=Azul"));
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "Internal server error" });
  mocks.getDb.mockRejectedValueOnce(new Error("private connection"));
  expect((await GET(request("query=Azul"))).status).toBe(500);
});
