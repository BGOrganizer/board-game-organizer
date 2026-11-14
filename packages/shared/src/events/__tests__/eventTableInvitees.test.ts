import type {
  TableInviteeResponse,
  TableInviteesPageResponse,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { type TableInviteeIntent, tableInviteeItems } from "../eventTableInvitees";

const person = { userId: "friend", name: "Alice", username: "alice-game", avatarUrl: "avatar" };
const candidate: TableInviteeResponse = {
  id: person.userId,
  name: "Canonical Alice",
  username: person.username,
  avatarUrl: person.avatarUrl,
  email: null,
  invitationBlockReason: "TABLE_TIME_CONFLICT",
};
function removal(overrides: Partial<TableInviteeIntent> = {}): TableInviteeIntent {
  return {
    mutationId: 2,
    kind: "remove",
    userId: person.userId,
    person,
    status: "pending",
    failed: false,
    aborted: false,
    uncertain: false,
    ...overrides,
  };
}
function snapshot(
  eventVersion?: number,
  items: TableInviteeResponse[] = [],
  nextCursor: string | null = null,
  query = "",
) {
  return {
    query,
    pages: [{ items, nextCursor, ...(eventVersion === undefined ? {} : { eventVersion }) }],
  };
}
const ids = (items: TableInviteeResponse[]) => items.map((row) => row.id);

describe("Table candidate release intent", () => {
  it("shows the known person before PATCH/GET, without changing source pages or exposing email", () => {
    const pages = snapshot(1);
    expect(tableInviteeItems([], [removal()], [pages], "")).toEqual([
      {
        id: "friend",
        name: "Alice",
        username: "alice-game",
        avatarUrl: "avatar",
        email: null,
        invitationBlockReason: null,
      },
    ]);
    expect(pages).toEqual(snapshot(1));
    expect(ids(tableInviteeItems([], [removal()], [], "ALICE"))).toEqual(["friend"]);
    expect(
      ids(tableInviteeItems([], [removal({ person: { ...person, name: null } })], [], "GAME")),
    ).toEqual(["friend"]);
    expect(tableInviteeItems([], [removal()], [], "other")).toEqual([]);
    expect(tableInviteeItems([], [], [], "")).toEqual([]);
  });
  it("keeps canonical identity/conflict reasons and cursors authoritative", () => {
    const pages = snapshot(2, [candidate], "cursor");
    expect(
      tableInviteeItems(
        [candidate],
        [removal({ status: "success", acknowledgedVersion: 2 })],
        [pages],
        "",
      ),
    ).toEqual([candidate]);
    expect(pages.pages[0].nextCursor).toBe("cursor");
    expect(tableInviteeItems([{ ...candidate, optimisticInvited: true }], [], [], "")).toEqual([]);
  });
  it.each([
    { aborted: true },
    { failed: true },
    { status: "idle" as const },
    { status: "error" as const },
    { status: "success" as const },
    { uncertain: true },
    { person: undefined },
    { person: { ...person, userId: "foreign" } },
  ])("never restores failed, aborted, uncertain or unknown releases: %j", (override) => {
    expect(tableInviteeItems([], [removal(override)], [], "")).toEqual([]);
  });
  it("keeps a positively acknowledged release through metadata refresh failure", () => {
    expect(
      ids(tableInviteeItems([], [removal({ uncertain: true, acknowledgedVersion: 2 })], [], "")),
    ).toEqual(["friend"]);
  });
  it("falls back only to already-known username/identity", () => {
    expect(
      tableInviteeItems([], [removal({ person: { ...person, name: null } })], [], "")[0].name,
    ).toBe("alice-game");
    const unknown = removal({ person: { ...person, name: null, username: null } });
    expect(tableInviteeItems([], [unknown], [], "")[0].name).toBe("friend");
    expect(tableInviteeItems([], [unknown], [], "alice")).toEqual([]);
  });
  it("latest target intent wins; failed reinvitation restores eligibility, failed removal does not revive history", () => {
    const invite = removal({ kind: "invite", mutationId: 1, person: undefined });
    expect(ids(tableInviteeItems([], [invite, removal()], [], ""))).toEqual(["friend"]);
    const reinvite = { ...invite, mutationId: 3 };
    expect(tableInviteeItems([candidate], [removal(), reinvite], [], "")).toEqual([]);
    expect(tableInviteeItems([], [removal(), { ...reinvite, status: "success" }], [], "")).toEqual(
      [],
    );
    expect(tableInviteeItems([candidate], [{ ...reinvite, status: "error" }], [], "")).toEqual([
      candidate,
    ]);
    expect(
      ids(
        tableInviteeItems([], [removal(), { ...reinvite, status: "error", failed: true }], [], ""),
      ),
    ).toEqual(["friend"]);
    expect(
      tableInviteeItems(
        [],
        [removal(), removal({ mutationId: 4, failed: true, status: "error" })],
        [],
        "",
      ),
    ).toEqual([]);
    expect(ids(tableInviteeItems([candidate], [{ ...invite, status: "success" }], [], ""))).toEqual(
      ["friend"],
    );
  });
  it("retires only after complete matching source proof at/after ACK, including another cached search", () => {
    const acknowledged = removal({ status: "success", acknowledgedVersion: 2 });
    for (const pages of [
      snapshot(),
      snapshot(1),
      snapshot(2, [], "next"),
      snapshot(2, [], null, "other"),
      { query: "", pages: [] },
    ])
      expect(ids(tableInviteeItems([], [acknowledged], [pages], ""))).toEqual(["friend"]);
    for (const pages of [
      snapshot(2),
      snapshot(3),
      snapshot(2, [], null, "ALICE"),
      snapshot(2, [{ ...candidate, id: "other" }]),
    ])
      expect(tableInviteeItems([], [acknowledged], [pages], "")).toEqual([]);
    const mixed = { query: "", pages: [...snapshot(1).pages, ...snapshot(2).pages] };
    expect(ids(tableInviteeItems([], [acknowledged], [mixed], ""))).toEqual(["friend"]);
    const positive = {
      query: "",
      pages: [...snapshot(2, [candidate], "next").pages, ...snapshot(2).pages],
    };
    expect(ids(tableInviteeItems([], [acknowledged], [positive], ""))).toEqual(["friend"]);
    expect(ids(tableInviteeItems([], [removal()], [snapshot(2)], ""))).toEqual(["friend"]);
    const invalid = {
      query: "",
      pages: [
        { items: [], nextCursor: undefined, eventVersion: 2 },
      ] as unknown as TableInviteesPageResponse[],
    };
    expect(ids(tableInviteeItems([], [acknowledged], [invalid], ""))).toEqual(["friend"]);
  });
});
