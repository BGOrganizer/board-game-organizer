import type { Db } from "mongodb";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  groupArgs: [] as unknown[],
  departed: vi.fn(),
}));
vi.mock("../../groups/group-records.service", () => ({
  GroupRecordsService: class {
    constructor(...args: unknown[]) {
      mocks.groupArgs = args;
    }
  },
}));
vi.mock("../../events/event-records.service", () => ({
  EventRecordsService: class {
    membershipDeparted = mocks.departed;
  },
}));

import { recordServices } from "../record-services";

it("binds unified repositories without legacy writers and preserves snapshot-safe departure callbacks", async () => {
  const collection = vi.fn((_name: string) => ({})),
    db = { collection } as unknown as Db;
  const services = recordServices(db);
  expect(services.assets).toBeDefined();
  expect(services.ratings).toBeDefined();
  const names = collection.mock.calls.map((call) => call[0]);
  expect(names).toContain("groupMemberships");
  expect(names).toContain("eventVotes");
  expect(names).not.toContain("matches");
  expect(names).not.toContain("organizations");
  expect(names).not.toContain("eventBookings");
  await (mocks.groupArgs[5] as (id: string, user: string, reason: "BAN" | "LEFT") => Promise<void>)(
    "group",
    "guest",
    "LEFT",
  );
  expect(mocks.departed).toHaveBeenCalledWith("group", "guest", "LEFT");
  await (mocks.groupArgs[5] as (id: string, user: string, reason: "BAN" | "LEFT") => Promise<void>)(
    "group",
    "guest",
    "BAN",
  );
  expect(mocks.departed).toHaveBeenCalledWith("group", "guest", "BAN");
});
