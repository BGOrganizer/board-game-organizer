import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: async () => ({}), withTransaction: mocks.transaction }));
vi.mock("@/app/lib/notifications/notification-changes.repository", () => ({
  NotificationChangesRepository: vi.fn(() => ({ list: mocks.list, read: mocks.read })),
}));

import { GET, OPTIONS, PATCH } from "../route";

const scope = { kind: "table", id: "11111111-1111-4111-8111-111111111111", tab: "participants" };
const url = `http://localhost/api/notifications/changes?${new URLSearchParams(scope)}`;
const through = "2026-01-01T00:00:00.000Z";
const request = (body: unknown) =>
  new Request("http://localhost/api/notifications/changes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("notification changes route controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "recipient" });
    mocks.list.mockResolvedValue({
      asOf: through,
      changes: [],
      tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
      nextCursor: null,
    });
    mocks.read.mockResolvedValue({ updated: 0 });
    mocks.transaction.mockImplementation(
      async (work: (session: object, db: object) => Promise<unknown>) => work({}, {}),
    );
  });
  it("requires authentication and exposes centralized CORS", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await PATCH(request({ scope, through, references: [] }))).status).toBe(401);
    expect(OPTIONS).toBeTypeOf("function");
  });
  it("rejects duplicate, unknown, unbounded or malformed queries", async () => {
    for (const suffix of ["&tab=details", "&limit=51", "&cursor=broken", "&arbitrary=true"])
      expect((await GET(new Request(url + suffix))).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns the bounded recipient query with private/no-store headers", async () => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith("recipient", { ...scope, limit: 8 });
    mocks.list.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await GET(new Request(url))).status).toBe(500);
  });
  it("accepts whole-entity scope while retaining exact bounded read references", async () => {
    const all = { ...scope, tab: "all" };
    const params = new URLSearchParams(all);
    expect(
      (await GET(new Request(`http://localhost/api/notifications/changes?${params}`))).status,
    ).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("recipient", { ...all, limit: 8 });
    expect((await PATCH(request({ scope: all, through, references: [] }))).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith("recipient", { scope: all, through, references: [] });
  });
  it("validates exact read selections and uses the shared transaction boundary", async () => {
    expect((await PATCH(request({ scope, through, references: [] }))).status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledWith("recipient", { scope, through, references: [] });
    expect((await PATCH(request({ scope, through, references: [], readAll: true }))).status).toBe(
      400,
    );
    expect(
      (
        await PATCH(
          new Request("http://localhost/api/notifications/changes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: "malformed",
          }),
        )
      ).status,
    ).toBe(400);
    mocks.read.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await PATCH(request({ scope, through, references: [] }))).status).toBe(500);
  });
});
