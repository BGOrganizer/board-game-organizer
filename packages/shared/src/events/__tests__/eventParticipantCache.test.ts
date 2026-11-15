import { describe, expect, it } from "vitest";
import {
  participantGroupVersion,
  projectEventParticipantRemoval,
  projectGroupParticipantBan,
} from "../eventParticipantCache";

const target = { id: "target", userId: "target" },
  other = { id: "other", userId: "other" };
const page = (extra = {}) => ({
  items: [target, other],
  eventVersion: 1,
  groupId: "group",
  status: "PLANNING",
  nextCursor: "next",
  ...extra,
});
const pages = (values = [page()]) => ({ pages: values, pageParams: [""] });
const key = (kind: string, id = "event") => ["events", "api", "owner", kind, id];
const captured = new Set(["old"]);
const project = (data: unknown, kind: string, eventId = "event") =>
  projectEventParticipantRemoval(data, key(kind, eventId), "event", "target", 1, captured);
describe("scoped Event participant negative intent", () => {
  it("filters only owned participant pages at the captured epoch, preserving later rejoins and cursors", () => {
    const data = pages([page(), page({ eventVersion: 3 })]);
    const result = project(data, "participants") as typeof data;
    expect(result.pages[0].items).toEqual([other]);
    expect(result.pages[1]).toBe(data.pages[1]);
    expect(result.pages[0].nextCursor).toBe("next");
    expect((project(page(), "participants") as ReturnType<typeof page>).items).toEqual([other]);
    expect(project(data, "participants", "foreign")).toBe(data);
    for (const value of [undefined, null, 1, {}, { items: null }])
      expect(project(value, "participants")).toBe(value);
  });
  it("removes captured seats only, never a later registration with the same user identity", () => {
    const data = {
      pages: [{ items: [{ ...target, id: "old" }, { ...target, id: "new" }, other] }],
      pageParams: [""],
    };
    expect(project(data, "seats")).toEqual({
      ...data,
      pages: [{ items: [{ ...target, id: "new" }, other] }],
    });
  });
  it("reconciles cached counts and own attendance without granting capability or advancing versions", () => {
    const own = { userId: "target", status: "ACCEPTED" };
    const event = {
      id: "event",
      version: 1,
      participantCount: 1,
      canVote: true,
      canConfirm: true,
      myRegistrations: [own],
      agreement: {},
    };
    expect(project(event, "detail")).toMatchObject({
      version: 1,
      participantCount: 0,
      canVote: false,
      canConfirm: false,
      myRegistrations: [],
      agreement: undefined,
    });
    const data = {
      items: [
        event,
        { ...event, version: 2 },
        { ...event, id: "foreign" },
        {
          ...event,
          myRegistrations: [{ userId: "other", status: "ACCEPTED" }],
          participantCount: 0,
        },
      ],
    };
    const input = { pages: [data], pageParams: [""] };
    const result = project(input, "list") as typeof input;
    expect(result.pages[0].items[0].myRegistrations).toEqual([]);
    expect(result.pages[0].items[1]).toBe(data.items[1]);
    expect(result.pages[0].items[2]).toBe(data.items[2]);
    expect(result.pages[0].items[3]).toMatchObject({ canVote: true, participantCount: 0 });
  });
  it("clears only a known own Table registration, preserving newer and unrelated Tables", () => {
    const table = {
      id: "table",
      eventId: "event",
      myRegistration: { ...target, id: "old" },
      myPosition: "SEATED",
      canLeave: true,
      canRespond: true,
    };
    const data = {
      items: [
        table,
        { ...table, eventVersion: 1 },
        { ...table, eventVersion: 2 },
        { ...table, myRegistration: { ...target, id: "new" } },
        { ...table, eventId: "foreign" },
        { ...table, myRegistration: null },
      ],
    };
    const input = { pages: [data], pageParams: [""] };
    const result = project(input, "tables") as typeof input;
    expect(result.pages[0].items[0]).toMatchObject({
      myRegistration: null,
      myPosition: null,
      canLeave: false,
      canRespond: false,
    });
    expect(result.pages[0].items[1].myRegistration).toBeNull();
    for (const index of [2, 3, 4, 5]) expect(result.pages[0].items[index]).toBe(data.items[index]);
    expect((project(table, "table") as typeof table).myRegistration).toBeNull();
    expect(project(table, "table", "foreign")).toBe(table);
    expect(project(table, "unrelated")).toBe(table);
    expect(project(undefined, "list")).toBeUndefined();
    for (const partial of [
      { id: "event", version: 1 },
      { id: "event", version: 1, myRegistrations: [] },
    ])
      expect(project(partial, "detail")).toBe(partial);
  });
});
describe("Group ban participant page ownership", () => {
  it("discovers only canonical mutable Group epochs", () => {
    for (const data of [
      null,
      undefined,
      1,
      {},
      page({ groupId: "other" }),
      page({ status: "TERMINATED" }),
      page({ status: "legacy" }),
      { groupId: "group", status: "PLANNING" },
      page({ eventVersion: "1" }),
    ])
      expect(participantGroupVersion(data, "group")).toBe(0);
    expect(participantGroupVersion(pages([page(), page({ eventVersion: 3 })]), "group")).toBe(3);
    expect(participantGroupVersion({ pages: [] }, "group")).toBe(0);
  });
  it("retains terminal history, foreign groups, later epochs and malformed/cold caches", () => {
    const data = pages([
      page(),
      page({ status: "CONFIRMED" }),
      page({ status: "TERMINATED" }),
      page({ eventVersion: 3 }),
      page({ groupId: "foreign" }),
    ]);
    const result = projectGroupParticipantBan(data, "group", "target", 1) as typeof data;
    expect(result.pages[0].items).toEqual([other]);
    expect(result.pages[1].items).toEqual([other]);
    for (const index of [2, 3, 4]) expect(result.pages[index]).toBe(data.pages[index]);
    for (const value of [undefined, null, 1, {}, { items: [] }])
      expect(projectGroupParticipantBan(value, "group", "target", 1)).toBe(value);
    expect(projectGroupParticipantBan(page(), "group", "target", 0)).toEqual(page());
  });
});
