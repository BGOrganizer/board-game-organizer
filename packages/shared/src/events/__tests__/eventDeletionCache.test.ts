import { describe, expect, it } from "vitest";
import { filterCommunityPages } from "../../community/queryCache";
import { projectEventRemoval } from "../eventDeletionCache";

const key = (kind: string, ...ids: string[]) => ["events", "api", "owner", kind, ...ids];
const event = {
  id: "event",
  version: 1,
  tableCount: 2,
  canEdit: true,
  canRegister: true,
  canInvite: true,
  canVote: true,
  canConfirm: true,
};
const table = {
  id: "table",
  eventId: "event",
  canRegister: true,
  canRespond: true,
  canLeave: true,
  canInvite: true,
};
const pages = (items: object[]) => ({
  pages: [{ items, nextCursor: "next", total: 4 }],
  pageParams: ["cursor"],
});
describe("owned Event/Table deletion projections", () => {
  it("filters source pages without changing cursors, metadata or unrelated records", () => {
    const other = { ...event, id: "other" },
      data = pages([event, other]);
    expect(projectEventRemoval(data, key("list"), "event", 1)).toEqual(pages([other]));
    expect(projectEventRemoval(pages([{ ...event, version: 2 }]), key("list"), "event", 1)).toEqual(
      pages([{ ...event, version: 2 }]),
    );
    for (const empty of [null, undefined, 3, {}, { pages: null }, { pages: {} }])
      expect(filterCommunityPages(empty, () => false)).toBe(empty);
  });
  it("removes only target table or all tables of target Event", () => {
    const sibling = { ...table, id: "sibling" },
      foreign = { ...table, eventId: "other" },
      data = pages([table, sibling, foreign]);
    expect(projectEventRemoval(data, key("tables"), "event", 1, "table")).toEqual(
      pages([sibling, foreign]),
    );
    expect(projectEventRemoval(data, key("tables"), "event", 1)).toEqual(pages([foreign]));
  });
  it("projects count once at the original Event epoch, never grants capabilities or advances canonical version", () => {
    const newer = { ...event, version: 2 },
      foreign = { ...event, id: "other" },
      projected = { ...event, tableCount: 1, canConfirm: false };
    expect(
      projectEventRemoval(pages([event, newer, foreign]), key("list"), "event", 1, "table"),
    ).toEqual(pages([projected, newer, foreign]));
    expect(projectEventRemoval(event, key("detail", "event"), "event", 1, "table")).toEqual(
      projected,
    );
    expect(projectEventRemoval(newer, key("detail", "event"), "event", 1, "table")).toEqual(newer);
    expect(
      projectEventRemoval({ ...event, tableCount: 1 }, key("detail", "event"), "event", 1, "table"),
    ).toEqual(projected);
    expect(projectEventRemoval(event, key("detail", "event"), "event", 1)).toEqual({
      ...event,
      canEdit: false,
      canRegister: false,
      canInvite: false,
      canVote: false,
      canConfirm: false,
    });
  });
  it("disables only known affected detail controls; keeps unrelated data and absent fields", () => {
    const projected = {
      ...table,
      canRegister: false,
      canRespond: false,
      canLeave: false,
      canInvite: false,
    };
    expect(projectEventRemoval(table, key("table", "event", "table"), "event", 1, "table")).toEqual(
      projected,
    );
    expect(projectEventRemoval(table, key("table", "event", "table"), "event", 1)).toEqual(
      projected,
    );
    for (const query of [
      key("detail", "other"),
      key("table", "other", "table"),
      key("table", "event", "other"),
      key("seats", "event", "table"),
    ])
      expect(projectEventRemoval(table, query, "event", 1, "table")).toBe(table);
    expect(projectEventRemoval(undefined, key("list"), "event", 1, "table")).toBeUndefined();
    expect(projectEventRemoval(undefined, key("detail", "event"), "event", 1)).toBeUndefined();
  });
});
