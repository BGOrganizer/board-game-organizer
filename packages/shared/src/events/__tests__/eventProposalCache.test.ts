import type { EventProposalResponse, EventProposalsResponse } from "@board-game-organizer/schemas";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";
import { beginOptimisticOperation, clearSessionQueryCache } from "../../common/optimisticOperation";
import { CommunityApiError } from "../../community/communityApi";
import {
  commitProposalCreation,
  commitProposalReceipt,
  EVENT_PROPOSAL_PAGE_SIZE,
  type EventProposalScope,
  eventProposalKeys,
  projectProposalReview,
  reconcileProposalAccessError,
  revokeProposalReview,
} from "../eventProposalCache";

const owner = { apiUrl: "https://api.test", userId: "actor" },
  scope: EventProposalScope = { eventId: "event", groupId: "group", kind: "date", mode: "review" };
const proposal = (id = "p1"): EventProposalResponse => ({
  id,
  eventId: "event",
  groupId: "group",
  userId: "actor",
  authorName: "Player",
  clientRequestId: id,
  label: "Date",
  payload: { kind: "date", day: "2030-06-03", startTime: "20:00" },
  status: "PENDING",
  version: 1,
  submittedEventVersion: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
});
const page = (
  items = [proposal()],
  mode: "mine" | "review" = "review",
): EventProposalsResponse => ({
  eventId: "event",
  groupId: "group",
  eventVersion: 1,
  mode,
  items,
  nextCursor: null,
});
const clients: QueryClient[] = [];
const client = () => {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(c);
  return c;
};
afterEach(() => clients.splice(0).forEach(clearSessionQueryCache));
it("marks all known pending game intents and reconciles every batch receipt without inventing decisions", () => {
  const one = { ...proposal(), payload: { kind: "game" as const, gameId: 2, tableId: "table" } };
  const two = { ...one, id: "p2", userId: "other", version: 2 };
  const unrelated = { ...one, id: "p3", payload: { ...one.payload, tableId: "other-table" } };
  const grouped = {
    ...one,
    gameSuggestions: [one, two].map((p) => ({
      id: p.id,
      userId: p.userId,
      authorName: p.authorName,
      version: p.version,
      status: p.status,
    })),
  };
  const input = page([grouped, two, unrelated, { ...one, id: "p4", status: "REJECTED" }]);
  const projected = projectProposalReview(input, "event", one.id, 1, 1, "accept", {
    gameId: 2,
    tableId: "table",
  }) as ReturnType<typeof page>;
  expect(projected.items[0]).toMatchObject({ clientAction: "accept", status: "PENDING" });
  expect(projected.items[1]).toMatchObject({ clientAction: "accept", status: "PENDING" });
  expect(projected.items[2]).toBe(unrelated);
  expect(projected.items[3]).not.toHaveProperty("clientAction");
  const first = { ...one, status: "ACCEPTED" as const, version: 2 };
  const second = { ...two, status: "ACCEPTED" as const, version: 3 };
  let result = commitProposalReceipt(input, first);
  result = commitProposalReceipt(result, second);
  expect(
    (result as ReturnType<typeof page>).items[0].gameSuggestions?.map((p) => p.status),
  ).toEqual(["ACCEPTED", "ACCEPTED"]);
  const newer = commitProposalReceipt(result, { ...second, version: 1, status: "REJECTED" });
  expect((newer as ReturnType<typeof page>).items[0].gameSuggestions?.map((p) => p.status)).toEqual(
    ["ACCEPTED", "ACCEPTED"],
  );
});
it("keys every private scope and presents exactly five source rows", () => {
  const key = eventProposalKeys.page(owner, scope);
  expect(EVENT_PROPOSAL_PAGE_SIZE).toBe(5);
  for (const other of [
    eventProposalKeys.page({ ...owner, userId: "other" }, scope),
    eventProposalKeys.page({ ...owner, apiUrl: "other" }, scope),
    eventProposalKeys.page(owner, { ...scope, groupId: "other" }),
    eventProposalKeys.page(owner, { ...scope, mode: "mine" }),
    eventProposalKeys.page(owner, { ...scope, kind: "game", tableId: "t" }),
    eventProposalKeys.page(owner, scope, "next"),
  ])
    expect(other).not.toEqual(key);
});
it("projects only a captured pending decision and never creates consent or an accepted option", () => {
  const input = page([proposal(), proposal("unrelated")]);
  const result = projectProposalReview(input, "event", "p1", 1, 1, "accept") as ReturnType<
    typeof page
  >;
  expect(result.items[0]).toMatchObject({ status: "PENDING", clientAction: "accept" });
  expect(result.items[0]).not.toHaveProperty("canonicalOptionId");
  expect(result.items[1]).toBe(input.items[1]);
  expect(input.items[0]).not.toHaveProperty("clientAction");
  expect(projectProposalReview(null, "event", "p1", 1, 1, "accept")).toBeNull();
  expect(projectProposalReview({ items: [] }, "event", "p1", 1, 1, "accept")).toEqual({
    items: [],
  });
  expect(
    projectProposalReview({ items: [], eventId: "event" }, "event", "p1", 1, 1, "accept"),
  ).toEqual({ items: [], eventId: "event" });
  expect(
    projectProposalReview({ items: "wrong", eventId: "event" }, "event", "p1", 1, 1, "accept"),
  ).toMatchObject({ items: "wrong" });
  expect(projectProposalReview("wrong", "event", "p1", 1, 1, "accept")).toBe("wrong");
  expect(
    projectProposalReview({ ...input, eventId: "other" }, "event", "p1", 1, 1, "accept"),
  ).toMatchObject({ eventId: "other" });
  expect(
    projectProposalReview({ ...input, eventVersion: 2 }, "event", "p1", 1, 1, "accept"),
  ).toMatchObject({ eventVersion: 2 });
  for (const row of [
    { ...proposal(), version: 2 },
    { ...proposal(), status: "ACCEPTED" as const },
  ])
    expect(
      (projectProposalReview(page([row]), "event", "p1", 1, 1, "reject") as ReturnType<typeof page>)
        .items[0],
    ).toBe(row);
  expect(
    (
      projectProposalReview(input, "event", "p1", 1, 1, "reject") as {
        items: { clientAction?: string }[];
      }
    ).items[0].clientAction,
  ).toBe("reject");
});
it("commits only known records and keeps newer private decisions", () => {
  const saved = { ...proposal(), version: 2, status: "REJECTED" as const };
  expect(commitProposalReceipt(undefined, saved)).toBeUndefined();
  expect(commitProposalReceipt(page(), { ...saved, eventId: "other" })).toEqual(page());
  expect(
    (commitProposalReceipt(page([proposal(), proposal("other")]), saved) as ReturnType<typeof page>)
      .items,
  ).toEqual([saved, proposal("other")]);
  const future = { ...saved, version: 3 };
  expect((commitProposalReceipt(page([future]), saved) as ReturnType<typeof page>).items[0]).toBe(
    future,
  );
  expect((commitProposalReceipt(page([]), saved) as ReturnType<typeof page>).items).toEqual([]);
});
it("inserts acknowledged creations into own first pages only, never fabricating grouped review membership", () => {
  const key = eventProposalKeys.page(owner, scope),
    saved = proposal("p9");
  expect(commitProposalCreation(null, key, saved, "actor")).toBeNull();
  for (const k of [
    eventProposalKeys.page(owner, scope, "later"),
    eventProposalKeys.page(owner, { ...scope, kind: "location" }),
    eventProposalKeys.page(owner, { ...scope, eventId: "other" }),
  ]) {
    const input = k[4] === "other" ? { ...page(), eventId: "other" } : page();
    expect(commitProposalCreation(input, k, saved, "actor")).toEqual(input);
  }
  expect(
    commitProposalCreation(page([], "mine"), key, { ...saved, userId: "other" }, "actor"),
  ).toEqual(page([], "mine"));
  expect(
    (commitProposalCreation(page([], "mine"), key, saved, "actor") as ReturnType<typeof page>)
      .items,
  ).toEqual([saved]);
  expect(commitProposalCreation(page(), key, { ...proposal(), version: 2 }, "actor")).toEqual(
    page(),
  );
  expect(
    (
      commitProposalCreation(
        page([proposal()], "mine"),
        key,
        { ...proposal(), version: 2 },
        "actor",
      ) as ReturnType<typeof page>
    ).items[0].version,
  ).toBe(2);
  const rows = Array.from({ length: 5 }, (_, i) => proposal(`p${i}`));
  const result = commitProposalCreation(page(rows, "mine"), key, saved, "actor") as ReturnType<
    typeof page
  >;
  expect(result.items.map((r) => r.id)).toEqual(["p9", "p4", "p3", "p2", "p1"]);
  expect(result.nextCursor).toBe(`${saved.createdAt}|p1`);
  const descending = commitProposalCreation(
    page([...rows].reverse(), "mine"),
    key,
    saved,
    "actor",
  ) as ReturnType<typeof page>;
  expect(descending.items.map((row) => row.id)).toEqual(["p9", "p4", "p3", "p2", "p1"]);
  const newest = { ...saved, createdAt: "2030-01-02T00:00:00.000Z" },
    older = { ...saved, id: "old", createdAt: "2029-01-01T00:00:00.000Z" };
  expect(
    (
      commitProposalCreation(page([newest], "mine"), key, older, "actor") as ReturnType<typeof page>
    ).items.map((r) => r.id),
  ).toEqual(["p9", "old"]);
  expect(
    (
      commitProposalCreation(page([older], "mine"), key, newest, "actor") as ReturnType<typeof page>
    ).items.map((r) => r.id),
  ).toEqual(["p9", "old"]);
  const game = { ...saved, payload: { kind: "game" as const, tableId: "table", gameId: 1 } };
  expect(
    commitProposalCreation(
      page([]),
      eventProposalKeys.page(owner, { ...scope, kind: "game", tableId: "other" }),
      game,
      "actor",
    ),
  ).toEqual(page([]));
  expect(
    (
      commitProposalCreation(
        page([]),
        eventProposalKeys.page(owner, { ...scope, kind: "game", tableId: "table" }),
        game,
        "actor",
      ) as ReturnType<typeof page>
    ).items,
  ).toEqual([]); // A single ACK cannot fabricate grouped review membership/revision.
  expect(
    (
      commitProposalCreation(
        { ...page([]), mode: "mine" },
        eventProposalKeys.page(owner, { ...scope, mode: "mine", kind: "game", tableId: "table" }),
        game,
        "actor",
      ) as ReturnType<typeof page>
    ).items,
  ).toEqual([game]);
});
it("revokes only owned review data and review writers, not own work or foreign scopes", async () => {
  const c = client(),
    reviewKey = eventProposalKeys.page(owner, scope),
    ownKey = eventProposalKeys.page(owner, { ...scope, mode: "mine" }),
    foreign = eventProposalKeys.page({ ...owner, userId: "foreign" }, scope),
    other = eventProposalKeys.page(owner, { ...scope, eventId: "other", groupId: "other" });
  for (const key of [reviewKey, ownKey, foreign, other]) c.setQueryData(key, page());
  const ordinary = await beginOptimisticOperation(
    c,
    ["events", owner.apiUrl, owner.userId, "event", "ordinary"],
    { queryKey: ownKey },
  );
  const review = await beginOptimisticOperation(
    c,
    ["events", owner.apiUrl, owner.userId, "event", "review-write"],
    { queryKey: reviewKey },
    (d) => d,
    [eventProposalKeys.reviewResource(owner, "event")],
  );
  revokeProposalReview(c, owner, { eventId: "event" });
  expect(review.signal.aborted).toBe(true);
  expect(ordinary.active).toBe(true);
  expect(c.getQueryData(reviewKey)).toBeUndefined();
  for (const key of [ownKey, foreign, other]) expect(c.getQueryData(key)).toBeDefined();
  ordinary.commit();
  c.setQueryData(reviewKey, page());
  c.setQueryData(["events", owner.apiUrl, owner.userId, "detail", "event"], { id: "event" });
  c.setQueryData(["events", owner.apiUrl, owner.userId, "detail", "unrelated"], {
    id: "unrelated",
  });
  const absent = await beginOptimisticOperation(
    c,
    ["events", owner.apiUrl, owner.userId, "cold", "write"],
    { queryKey: ["absent"] },
    (d) => d,
    [eventProposalKeys.groupReviewResource(owner, "group")],
  );
  revokeProposalReview(c, owner, { groupId: "group" });
  expect(absent.signal.aborted).toBe(true);
  expect(
    c.getQueryState(["events", owner.apiUrl, owner.userId, "detail", "event"])?.isInvalidated,
  ).toBe(true);
  expect(
    c.getQueryState(["events", owner.apiUrl, owner.userId, "detail", "unrelated"])?.isInvalidated,
  ).toBe(false);
});
it("purges only role-owned participant collection pickers and cancels their review resources even without a cached proposal page", async () => {
  const c = client();
  const picker = (
    value: unknown,
    participants = true,
    api = owner.apiUrl,
    user = owner.userId,
    version = "sources-v2",
  ) => ["bgg-picker", api, user, "", false, false, null, null, version, participants, value];
  const matching = picker({ eventId: "picker-event", groupId: "group" }),
    sameGroup = picker({ eventId: "second", groupId: "group" });
  const retained = [
    picker(null),
    picker("bad"),
    picker({}),
    picker({ eventId: 3 }),
    picker({ eventId: "unrelated", groupId: "other" }),
    picker({ eventId: "picker-event" }, false),
    picker({ eventId: "picker-event" }, true, "other-api"),
    picker({ eventId: "picker-event" }, true, owner.apiUrl, "other-user"),
    picker({ eventId: "picker-event" }, true, owner.apiUrl, owner.userId, "old"),
    picker({ eventId: "no-group" }),
  ];
  for (const key of [matching, sameGroup, ...retained])
    c.setQueryData(key, { pages: [{ items: [] }], pageParams: [""] });
  const op = await beginOptimisticOperation(
    c,
    ["review-writer"],
    { queryKey: matching },
    undefined,
    [eventProposalKeys.reviewResource(owner, "picker-event")],
  );
  revokeProposalReview(c, owner, { eventId: "picker-event" });
  expect(op.signal.aborted).toBe(true);
  expect(c.getQueryState(matching)).toBeUndefined();
  expect(c.getQueryState(sameGroup)).toBeDefined();
  c.setQueryData(["events", owner.apiUrl, owner.userId, "detail", "second"], { id: "second" });
  revokeProposalReview(c, owner, { groupId: "group" });
  expect(c.getQueryState(sameGroup)).toBeUndefined();
  expect(
    c.getQueryState(["events", owner.apiUrl, owner.userId, "detail", "second"])?.isInvalidated,
  ).toBe(true);
  for (const key of retained) expect(c.getQueryState(key)).toBeDefined();
});

it("purges role-owned participant reviews, including cold or inactive queries, without erasing ordinary rosters", () => {
  const c = client();
  const key = (
    id: string,
    mode = "review",
    groupId = "group",
    api = owner.apiUrl,
    user = owner.userId,
    version = "roles-v2",
  ) => ["events", api, user, "participants", id, version, mode, groupId];
  const first = key("event"),
    second = key("second"),
    retained = [
      key("event", "member"),
      key("event", "review", "group", "foreign"),
      key("event", "review", "group", owner.apiUrl, "other"),
      key("event", "review", "group", owner.apiUrl, owner.userId, "old"),
      key("other", "review", "other"),
    ];
  for (const k of [first, second, ...retained])
    c.setQueryData(k, {
      pages: [{ items: [{ userId: "pending", pendingInvitation: true }], groupId: "group" }],
      pageParams: [""],
    });
  c.setQueryData(["events", owner.apiUrl, owner.userId, "detail", "event"], { id: "event" });
  revokeProposalReview(c, owner, { eventId: "event" }, first);
  expect(c.getQueryData(first)).toBeUndefined();
  expect(c.getQueryState(first)?.error).toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
  expect(
    c.getQueryState(["events", owner.apiUrl, owner.userId, "detail", "event"])?.isInvalidated,
  ).toBe(true);
  expect(c.getQueryData(second)).toBeDefined();
  const cold = key("cold");
  c.getQueryCache().build(c, { queryKey: cold });
  revokeProposalReview(c, owner, { groupId: "group" });
  for (const k of [first, second, cold]) expect(c.getQueryState(k)).toBeUndefined();
  for (const k of retained) expect(c.getQueryData(k)).toBeDefined();
});
it("reconciles generic grouped date/location suggestion receipts without overwriting newer members", () => {
  const base = proposal();
  const suggestion = {
    id: "member",
    userId: "user",
    authorName: "User",
    status: "PENDING" as const,
    version: 2,
  };
  const input = page([{ ...base, suggestions: [suggestion] }]);
  const receipt = { ...proposal("member"), version: 3, status: "ACCEPTED" as const };
  const output = commitProposalReceipt(input, receipt) as ReturnType<typeof page>;
  expect(output.items[0].suggestions?.[0]).toMatchObject({ version: 3, status: "ACCEPTED" });
  expect(
    (commitProposalReceipt(output, { ...receipt, version: 2 }) as ReturnType<typeof page>).items[0]
      .suggestions?.[0].version,
  ).toBe(3);
});
it("keeps denied observers terminal, blocks late restore, and distinguishes management from membership loss", () => {
  const c = client(),
    key = eventProposalKeys.page(owner, scope),
    own = eventProposalKeys.page(owner, { ...scope, mode: "mine" });
  c.setQueryData(key, page());
  c.setQueryData(own, page([], "mine"));
  reconcileProposalAccessError(c, owner, scope, new Error("offline"));
  expect(c.getQueryData(key)).toBeDefined();
  reconcileProposalAccessError(c, owner, scope, new CommunityApiError(409, "EVENT_CHANGED"));
  expect(c.getQueryData(key)).toBeDefined();
  reconcileProposalAccessError(
    c,
    owner,
    scope,
    new CommunityApiError(403, "EVENT_ADMIN_REQUIRED"),
    key,
  );
  expect(c.getQueryData(key)).toBeUndefined();
  expect(c.getQueryState(key)?.error).toMatchObject({ status: 403 });
  expect(c.getQueryData(own)).toBeDefined();
  reconcileProposalAccessError(
    c,
    owner,
    scope,
    new CommunityApiError(403, "GROUP_MEMBER_REQUIRED"),
  );
  expect(c.getQueryState(own)).toBeUndefined();
  const cold = eventProposalKeys.page(owner, { ...scope, eventId: "cold" });
  c.getQueryCache().build(c, { queryKey: cold });
  reconcileProposalAccessError(c, owner, scope, new CommunityApiError(403, "GROUP_BANNED"));
  expect(c.getQueryState(cold)).toBeUndefined();
  revokeProposalReview(c, owner, { eventId: "missing" });
});
