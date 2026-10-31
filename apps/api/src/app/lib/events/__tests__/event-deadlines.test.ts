import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getDb: vi.fn(),
  pending: vi.fn(),
  delivered: vi.fn(),
}));
vi.mock("inngest", () => ({
  Inngest: class {
    send = mocks.send;
  },
}));
vi.mock("../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../events.repository", () => ({
  EventsRepository: class {
    pendingDeliveries = mocks.pending;
    delivered = mocks.delivered;
  },
}));

import { deadlineServiceConfigured, dispatchEventDeadlines } from "../event-deadlines";

const keys = [
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "INNGEST_ENV",
  "MONGODB_DB_NAME",
] as const;
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of keys)
    vi.stubEnv(key, key === "MONGODB_DB_NAME" ? "bgo_ci_events" : "test-only-placeholder");
  mocks.getDb.mockResolvedValue({});
  mocks.pending.mockResolvedValue([]);
  mocks.send.mockResolvedValue({ ids: ["delivery"] });
  mocks.delivered.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("persisted event deadline delivery", () => {
  it.each(keys)("fails closed for absent/empty/whitespace %s configuration", async (key) => {
    expect(deadlineServiceConfigured()).toBe(true);
    for (const missing of [undefined, "", " "]) {
      vi.stubEnv(key, missing);
      expect(deadlineServiceConfigured()).toBe(false);
      await dispatchEventDeadlines();
      expect(mocks.getDb).not.toHaveBeenCalled();
    }
  });
  it("does not send an empty queue", async () => {
    await dispatchEventDeadlines();
    expect(mocks.pending).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.delivered).not.toHaveBeenCalled();
  });
  it("namespaces deterministic delivery IDs and marks delivered only after provider acknowledgment", async () => {
    const rows = [
      { id: "event/7", eventId: "event", version: 7, bookingClosesAt: "2030-01-01T12:00:00.000Z" },
    ];
    mocks.pending.mockResolvedValue(rows);
    await dispatchEventDeadlines();
    expect(mocks.send).toHaveBeenCalledWith([
      {
        id: "bgo_ci_events/event/7",
        name: "bgo/event.deadline",
        data: {
          eventId: "event",
          version: 7,
          bookingClosesAt: rows[0].bookingClosesAt,
          databaseName: "bgo_ci_events",
        },
      },
    ]);
    expect(mocks.delivered).toHaveBeenCalledWith(["event/7"]);
    expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.delivered.mock.invocationCallOrder[0],
    );
  });
  it("retains failed deliveries for an identical retry and never marks a failed send delivered", async () => {
    mocks.pending.mockResolvedValue([
      { id: "event/7", eventId: "event", version: 7, bookingClosesAt: "2030-01-01T12:00:00.000Z" },
    ]);
    mocks.send.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(dispatchEventDeadlines()).rejects.toThrow("provider unavailable");
    expect(mocks.delivered).not.toHaveBeenCalled();
    await dispatchEventDeadlines();
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1]);
    expect(mocks.delivered).toHaveBeenCalledOnce();
  });
});
