import { ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  dispatch: vi.fn(),
  getDb: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
  due: vi.fn(),
  notify: vi.fn(),
  produceNotification: false,
  attemptIds: [] as unknown[],
}));
vi.mock("../event-deadlines", () => ({
  deadlineServiceConfigured: mocks.configured,
  dispatchEventDeadlines: mocks.dispatch,
  inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
}));
vi.mock("../../db", () => ({ getDb: mocks.getDb, withTransaction: mocks.transaction }));
vi.mock("../events.repository", () => ({
  EventsRepository: class {
    dueEvents = mocks.due;
  },
}));
vi.mock("../events.service", () => ({
  EventsService: class {
    close = mocks.close;
  },
}));
vi.mock("../../organizations/organizations.repository", () => ({
  OrganizationsRepository: class {},
}));
vi.mock("../../organizations/organization-assets.repository", () => ({
  OrganizationAssetsRepository: class {},
}));
vi.mock("../../users/users.repository", () => ({ UsersRepository: class {} }));
vi.mock("../../games/boardGames.repository", () => ({ BoardGamesRepository: class {} }));
vi.mock("../../notifications/notifications.repository", () => ({
  NotificationsRepository: class {
    constructor(_db: unknown, _session: unknown, ids: ObjectId[]) {
      if (mocks.produceNotification) {
        const id = new ObjectId();
        mocks.attemptIds.push(id);
        ids.push(id);
      }
    }
  },
}));
vi.mock("../../notifications/push", () => ({ dispatchNotifications: mocks.notify }));

import { closeEventAtDeadline, recoverEventDeadlines } from "../event-workers";

type Step = { sleepUntil: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
type Worker = {
  config: { id: string; retries?: number; triggers: unknown[] };
  handler: (context: { event?: { data: unknown }; step: Step }) => Promise<unknown>;
};
const deadline = closeEventAtDeadline as unknown as Worker,
  recovery = recoverEventDeadlines as unknown as Worker;
const id = "11111111-1111-4111-8111-111111111111",
  data = {
    eventId: id,
    version: 7,
    bookingClosesAt: "2030-01-01T12:00:00.000Z",
    databaseName: "bgo_ci_events",
  };
function step(): Step {
  return {
    sleepUntil: vi.fn(async () => {}),
    run: vi.fn(async (_name: string, run: () => Promise<unknown>) => run()),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MONGODB_DB_NAME", data.databaseName);
  mocks.configured.mockReturnValue(true);
  mocks.getDb.mockResolvedValue({});
  mocks.close.mockResolvedValue({ closed: true });
  mocks.transaction.mockImplementation(
    async (run: (session: unknown, db: unknown) => Promise<unknown>) => run({}, {}),
  );
  mocks.due.mockResolvedValue([]);
  mocks.dispatch.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
  mocks.produceNotification = false;
  mocks.attemptIds.length = 0;
});
afterEach(() => vi.unstubAllEnvs());
describe("deadline worker protocol", () => {
  it("registers revision-aware sleep and five-minute recovery", () => {
    expect(deadline.config).toEqual({
      id: "event-booking-cutoff",
      retries: 5,
      triggers: [{ event: "bgo/event.deadline" }],
    });
    expect(recovery.config).toEqual({
      id: "recover-event-deadlines",
      triggers: [{ cron: "*/5 * * * *" }],
    });
  });
  it("ignores disabled or foreign database jobs without sleeping or touching a transaction", async () => {
    const s = step();
    mocks.configured.mockReturnValue(false);
    await expect(deadline.handler({ event: { data }, step: s })).resolves.toEqual({
      ignored: true,
    });
    mocks.configured.mockReturnValue(true);
    await expect(
      deadline.handler({ event: { data: { ...data, databaseName: "production" } }, step: s }),
    ).resolves.toEqual({ ignored: true });
    expect(s.sleepUntil).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { ...data, eventId: "bad" },
    { ...data, version: 0 },
    { ...data, bookingClosesAt: "bad" },
    { ...data, databaseName: "" },
  ])("rejects malformed delivery before executing", async (invalid) => {
    const s = step();
    await expect(deadline.handler({ event: { data: invalid }, step: s })).rejects.toThrow();
    expect(s.run).not.toHaveBeenCalled();
  });
  it("waits for the exact cutoff and forwards the stored revision to the transactional close", async () => {
    const s = step();
    await expect(deadline.handler({ event: { data }, step: s })).resolves.toEqual({ closed: true });
    expect(s.sleepUntil).toHaveBeenCalledWith(
      "wait-for-booking-cutoff",
      new Date(data.bookingClosesAt),
    );
    expect(s.run).toHaveBeenCalledWith("freeze-event-roster", expect.any(Function));
    expect(mocks.close).toHaveBeenCalledWith(id, 7);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("resets collected notification IDs across a transaction retry and dispatches only after commit", async () => {
    mocks.produceNotification = true;
    mocks.transaction.mockImplementation(
      async (run: (session: unknown, db: unknown) => Promise<unknown>) => {
        await run({}, {});
        return run({}, {});
      },
    );
    await deadline.handler({ event: { data }, step: step() });
    expect(mocks.close).toHaveBeenCalledTimes(2);
    expect(mocks.notify).toHaveBeenCalledWith([mocks.attemptIds[1]]);
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.notify.mock.invocationCallOrder[0],
    );
  });
  it("lets failed close transactions retry without emitting uncommitted notifications", async () => {
    mocks.produceNotification = true;
    mocks.close.mockRejectedValueOnce(new Error("write conflict"));
    await expect(deadline.handler({ event: { data }, step: step() })).rejects.toThrow(
      "write conflict",
    );
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("keeps disabled recovery read/write-free", async () => {
    mocks.configured.mockReturnValue(false);
    await expect(recovery.handler({ step: step() })).resolves.toEqual({ disabled: true });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("recovers persisted delivery and every due revision with stable step IDs", async () => {
    mocks.due.mockResolvedValue([
      { id, version: 7 },
      { id: "second", version: 9 },
    ]);
    const s = step();
    await expect(recovery.handler({ step: s })).resolves.toEqual({ checked: 2 });
    expect(s.run.mock.calls.map(([name]) => name)).toEqual([
      "deliver-persisted-deadlines",
      "find-overdue-events",
      `recover-${id}-7`,
      "recover-second-9",
    ]);
    expect(mocks.close).toHaveBeenNthCalledWith(1, id, 7);
    expect(mocks.close).toHaveBeenNthCalledWith(2, "second", 9);
  });
});
