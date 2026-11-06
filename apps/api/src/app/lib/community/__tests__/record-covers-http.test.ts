import { beforeEach, expect, it, vi } from "vitest";
import { runRecordOperation } from "../record-http";

const m = vi.hoisted(() => ({ order: [] as string[], signedIn: true, enrich: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: m.signedIn ? "owner" : null }),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("../../notifications/push", () => ({ dispatchNotifications: vi.fn() }));
vi.mock("../../games/record-game-covers", () => ({ enrichRecordGameCovers: m.enrich }));
vi.mock("../record-services", () => ({ recordServices: () => ({}) }));
vi.mock("../../db", () => ({
  getDb: async () => ({}),
  withTransaction: async (work: (session: unknown, db: unknown) => unknown) => {
    m.order.push("transaction");
    const result = await work({}, {});
    m.order.push("committed");
    return result;
  },
}));
beforeEach(() => {
  m.signedIn = true;
  m.order = [];
  m.enrich.mockReset().mockImplementation(async () => m.order.push("enriched"));
});
it("enriches authorized GET artwork only after committing the read transaction", async () => {
  const result = await runRecordOperation(
    new Request("https://api.test/api/events/id/tables/id"),
    async () => {
      m.order.push("authorized");
      return { gamesDetail: [{ id: 1, imageUrl: null }] };
    },
  );
  expect(result.status).toBe(200);
  expect(m.order).toEqual(["transaction", "authorized", "committed", "enriched"]);
  expect(m.enrich).toHaveBeenCalledOnce();
});
it("does not enrich mutating requests or unauthorized reads", async () => {
  await runRecordOperation(
    new Request("https://api.test/api/events", { method: "POST" }),
    async () => ({ id: "event" }),
  );
  expect(m.enrich).not.toHaveBeenCalled();
  m.signedIn = false;
  expect(
    (await runRecordOperation(new Request("https://api.test/api/events"), async () => ({}))).status,
  ).toBe(401);
  expect(m.enrich).not.toHaveBeenCalled();
});
