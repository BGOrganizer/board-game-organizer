import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  belongsToDeletedGroup,
  removeDeletedGroupData,
  restoreDeletedGroup,
} from "../groupDeletionCache";

const row = (id: string, version = 1) => ({ id, version, name: id }) as GroupRecordResponse;
const pages = (items: unknown[], cursor = "") => ({
  pages: [{ items, nextCursor: null }],
  pageParams: [cursor],
});
const deleted = "deleted",
  eventIds = new Set(["event"]);
describe("Group deletion cache ownership", () => {
  it("matches Group data, related Event/Table data and precise inbox destinations, not unrelated records", () => {
    for (const value of [
      { id: deleted },
      { groupId: deleted },
      { id: "event" },
      { eventId: "event" },
      { resourceHref: "/groups/deleted" },
      { resourceHref: "/groups/deleted/members?query=x" },
      { resourceHref: "/moderation/deleted#review" },
      { resourceHref: "/events/event/tables/table" },
    ])
      expect(belongsToDeletedGroup(value, deleted, eventIds)).toBe(true);
    for (const value of [
      null,
      undefined,
      "deleted",
      1,
      {},
      { id: "other" },
      { resourceHref: "/groups/deleted-other" },
      { resourceHref: "/events/other" },
      { resourceHref: "/profile/deleted" },
      { resourceHref: "/events" },
      { resourceHref: 1 },
    ])
      expect(belongsToDeletedGroup(value, deleted, eventIds)).toBe(false);
  });
  it("filters all owned list pages while preserving metadata and unrelated rows", () => {
    const before = {
      pages: [
        { items: [row(deleted), row("other")], nextCursor: "next" },
        {
          items: [{ id: "table", eventId: "event" }, { resourceHref: "/events/event" }],
          nextCursor: null,
        },
      ],
      pageParams: ["", "next"],
    };
    expect(removeDeletedGroupData(before, deleted, eventIds)).toEqual({
      ...before,
      pages: [
        { ...before.pages[0], items: [row("other")] },
        { ...before.pages[1], items: [] },
      ],
    });
    expect(before.pages[0].items).toHaveLength(2);
  });
  it("does not invent or replace missing, malformed or differently shaped cache data", () => {
    for (const value of [
      undefined,
      null,
      1,
      {},
      { pages: 1 },
      { pages: [null], pageParams: [] },
      { pages: [{ games: [] }], pageParams: [] },
      { pages: [], pageParams: 1 },
    ]) {
      expect(removeDeletedGroupData(value, deleted, eventIds)).toBe(value);
      expect(restoreDeletedGroup(value, pages([row(deleted)]), deleted)).toBe(value);
    }
  });
  it("restores only the deleted row, retaining concurrent edits, insertions, later pages and latest detail", () => {
    const before = pages([row("first"), row(deleted), row("other")]);
    const current = {
      pages: [
        { items: [row("first", 2), row("other", 3), row("inserted")], nextCursor: "next" },
        { items: [row("later")], nextCursor: null },
      ],
      pageParams: ["", "next"],
    };
    const latest = { ...row(deleted, 2), name: "New authoritative name" };
    expect(restoreDeletedGroup(current, before, deleted, latest)).toEqual({
      ...current,
      pages: [
        { ...current.pages[0], items: [row("first", 2), latest, row("other", 3), row("inserted")] },
        current.pages[1],
      ],
    });
  });
  it("never duplicates a restored row or recreates cleared caches; stale detail cannot replace newer snapshots", () => {
    const before = pages([row(deleted, 3), row("other")]);
    const removed = pages([row("other")]);
    expect(restoreDeletedGroup(removed, before, deleted)).toEqual(before);
    expect(restoreDeletedGroup(removed, before, deleted, row(deleted, 1))).toEqual(before);
    expect(restoreDeletedGroup(removed, before, deleted, row(deleted, 3))).toEqual(before);
    expect(restoreDeletedGroup(before, before, deleted)).toBe(before);
    expect(restoreDeletedGroup(undefined, before, deleted)).toBeUndefined();
    expect(restoreDeletedGroup(removed, null, deleted)).toBe(removed);
    expect(restoreDeletedGroup(removed, pages([]), deleted)).toEqual(removed);
    expect(restoreDeletedGroup(pages([row("other")], "changed"), before, deleted)).toEqual(
      pages([row("other")], "changed"),
    );
  });
});
