import { ObjectId } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  after: [] as Array<() => unknown>,
  dispatch: vi.fn(),
  ids: [] as unknown[],
  transaction: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_owner" }) }));
vi.mock("next/server", () => ({ after: (task: () => unknown) => m.after.push(task) }));
vi.mock("@/app/lib/db", () => ({
  getDb: async () => ({}),
  withTransaction: (fn: unknown) => m.transaction(fn),
}));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("@/app/lib/contacts/relationship.repository", () => ({ RelationshipRepository: class {} }));
vi.mock("@/app/lib/contacts/relationship.service", () => ({
  RelationshipService: class {
    async requireCurrentUser() {}
  },
  RelationshipError: class extends Error {},
}));
vi.mock("@/app/lib/notifications/notifications.repository", () => ({
  NotificationsRepository: class {
    constructor(_db: unknown, _session: unknown, ids: unknown[]) {
      ids.push(...m.ids);
    }
  },
}));
vi.mock("@/app/lib/notifications/push", () => ({ dispatchNotifications: m.dispatch }));

import { runRelationshipOperation } from "../../contacts/relationship.http";

beforeEach(() => {
  m.after = [];
  m.ids = [new ObjectId()];
  vi.clearAllMocks();
  m.transaction.mockImplementation(async (fn) => fn({}, {}));
});
it("dispatches committed social notifications only through the post-response hook", async () => {
  const response = await runRelationshipOperation(new Request("https://api.test"), async () => ({
    ok: true,
  }));
  expect(response.status).toBe(200);
  expect(m.dispatch).not.toHaveBeenCalled();
  expect(m.after).toHaveLength(1);
  await m.after[0]();
  expect(m.dispatch).toHaveBeenCalledWith(m.ids);
});
it("never dispatches notifications from a rolled-back relationship mutation", async () => {
  const response = await runRelationshipOperation(new Request("https://api.test"), async () => {
    throw Error("failure");
  });
  expect(response.status).toBe(500);
  expect(m.after).toHaveLength(0);
  expect(m.dispatch).not.toHaveBeenCalled();
});
