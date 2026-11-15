import type { NotificationChangesQuery } from "@board-game-organizer/schemas";
import { afterEach, expect, it, vi } from "vitest";
import { NotificationChangesRepository } from "../notification-changes.repository";

afterEach(() => vi.useRealTimers());
it("freezes internal before/after eligibility at a cutoff boundary but never backdates current cursor authorization", async () => {
  const at = "2026-01-01T00:00:00.000Z",
    later = "2026-01-01T00:00:01.000Z",
    id = "11111111-1111-4111-8111-111111111111";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(later));
  const pipelines: string[] = [];
  const db = {
    collection: () => ({
      findOne: async () => null,
      aggregate: (stages: unknown) => {
        pipelines.push(JSON.stringify(stages));
        return { toArray: async () => [] };
      },
    }),
  };
  const repo = new NotificationChangesRepository(db as never);
  const query: NotificationChangesQuery = { kind: "table", id, tab: "none", limit: 8 };
  await repo.list("user_recipient", query, at);
  expect(pipelines[0]).toContain(at);
  expect(pipelines[0]).not.toContain(later);
  await repo.list("user_recipient", {
    ...query,
    cursor: { asOf: at, effectiveAt: at, notificationId: "111111111111111111111111", itemId: "" },
  });
  expect(pipelines[1]).toContain(at);
  expect(pipelines[1]).toContain(later);
});
