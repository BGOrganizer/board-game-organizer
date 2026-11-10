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
  filterRevokedStandaloneEventRestore,
  projectProposalReview,
  reconcileProposalAccessError,
  revokeProposalReview,
} from "../eventProposalCache";
import { eventProposalsPageQuery } from "../hooks/useEventProposals";

const owner = { apiUrl: "https://api.test", userId: "actor", getToken: async () => "fresh" },
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

it("enables standalone proposal source pages without a Group key while keeping owner/kind guards", () => {
  const standalone = { ...scope, groupId: null };
  const options = eventProposalsPageQuery(owner, standalone);
  expect(options.enabled).toBe(true);
  expect(options.queryKey[6]).toBeNull();
  expect(options.queryKey).not.toEqual(eventProposalsPageQuery(owner, scope).queryKey);
  expect(eventProposalsPageQuery({ ...owner, userId: null }, standalone).enabled).toBe(false);
  expect(eventProposalsPageQuery({ ...owner, enabled: false }, standalone).enabled).toBe(false);
  expect(eventProposalsPageQuery(owner, { ...standalone, kind: "game" }).enabled).toBe(false);
  expect(
    eventProposalsPageQuery(owner, { ...standalone, kind: "game", tableId: "table" }).enabled,
  ).toBe(true);
});
it("reconciles standalone creation/receipts and revokes only its Event proposal scopes, never unrelated Group access", () => {
  const c = client();
  const standalone = { ...scope, groupId: null };
  const review = eventProposalKeys.page(owner, standalone);
  const mine = eventProposalKeys.page(owner, { ...standalone, mode: "mine" });
  const group = ["groups", owner.apiUrl, owner.userId, "group"];
  const other = eventProposalKeys.page(owner, { ...standalone, eventId: "other-event" });
  const data = { ...page(), groupId: null, items: [{ ...proposal(), groupId: null }] };
  c.setQueryData(review, data);
  c.setQueryData(mine, { ...data, mode: "mine" });
  c.setQueryData(group, { id: "group", canManage: true });
  c.setQueryData(other, { ...data, eventId: "other-event" });
  const row = { ...proposal("p2"), groupId: null };
  const created = commitProposalCreation(
    { ...data, mode: "mine" },
    mine,
    row,
    owner.userId,
  ) as EventProposalsResponse;
  expect(created.items.map((p) => p.id)).toContain("p2");
  expect(
    (
      commitProposalReceipt(created, {
        ...row,
        version: 2,
        status: "ACCEPTED",
      }) as EventProposalsResponse
    ).items.find((p) => p.id === "p2")?.status,
  ).toBe("ACCEPTED");
  reconcileProposalAccessError(
    c,
    owner,
    standalone,
    new CommunityApiError(404, "EVENT_NOT_FOUND"),
    mine,
  );
  expect(c.getQueryData(review)).toBeUndefined();
  expect(c.getQueryData(mine)).toBeUndefined();
  expect(c.getQueryState(mine)?.status).toBe("error");
  expect(c.getQueryData(group)).toEqual({ id: "group", canManage: true });
  expect(c.getQueryData(other)).toBeDefined();
});
it("cancels in-flight standalone proposal reads on definitive access loss so late responses cannot restore them", async () => {
  const c = client();
  const standalone = { ...scope, groupId: null, mode: "mine" as const };
  const key = eventProposalKeys.page(owner, standalone);
  let signal: AbortSignal | undefined;
  let finish: ((value: EventProposalsResponse) => void) | undefined;
  const pending = c
    .fetchQuery({
      queryKey: key,
      queryFn: (context) => {
        signal = context.signal;
        return new Promise<EventProposalsResponse>((resolve) => {
          finish = resolve;
        });
      },
    })
    .catch(() => undefined);
  reconcileProposalAccessError(
    c,
    owner,
    standalone,
    new CommunityApiError(404, "EVENT_NOT_FOUND"),
    eventProposalKeys.page(owner, { ...standalone, kind: "location" }),
  );
  expect(signal?.aborted).toBe(true);
  finish?.({ ...page(), groupId: null });
  await pending;
  expect(c.getQueryData(key)).toBeUndefined();
});

it("revokes standalone Event writers, rosters and scoped pickers without erasing unrelated rows or owners", async () => {
  const c = client(),
    standalone = { ...scope, groupId: null },
    denied = eventProposalKeys.page(owner, standalone),
    root = ["events", owner.apiUrl, owner.userId],
    details = ["detail", "table", "tables", "participants", "seats", "invitees", "leaderboard"].map(
      (kind) => [...root, kind, "event"],
    ),
    list = [...root, "list", { groupId: null }],
    tables = [...root, "tables", null],
    picker = (proposal: unknown, collection: unknown) => [
      "bgg-picker",
      owner.apiUrl,
      owner.userId,
      "",
      true,
      false,
      null,
      proposal,
      "sources-v2",
      false,
      collection,
    ],
    proposalPicker = picker({ eventId: "event" }, null),
    collectionPicker = picker(null, { eventId: "event" }),
    safePicker = picker({ eventId: "other" }, null),
    unscopedPicker = picker(null, null),
    malformedPicker = picker("bad", {}),
    retained = [
      [...root, "detail", "other"],
      ["events", owner.apiUrl, "foreign", "detail", "event"],
      ["events", "foreign", owner.userId, "detail", "event"],
      ["groups", owner.apiUrl, owner.userId, "detail", "group"],
      [...root, "list", { groupId: "group" }],
      safePicker,
      unscopedPicker,
      malformedPicker,
    ];
  for (const key of [denied, ...details, proposalPicker, collectionPicker, ...retained])
    c.setQueryData(key, { id: "event", private: true });
  const pages = (items: unknown[]) => ({
    pages: [{ items, nextCursor: "unchanged" }],
    pageParams: [""],
  });
  c.setQueryData(list, pages([{ id: "event" }, { id: "other" }]));
  c.setQueryData(
    tables,
    pages([
      { id: "table", eventId: "event" },
      { id: "safe", eventId: "other" },
    ]),
  );
  const operation = await beginOptimisticOperation(
    c,
    [...root, "event", "write"],
    { queryKey: root },
    (data) => data,
    [],
    undefined,
    "event-fifo",
  );
  const queued = await beginOptimisticOperation(
    c,
    [...root, "event", "write"],
    { queryKey: ["cold"] },
    (data) => data,
    [],
    undefined,
    "event-fifo",
  );
  const ready = queued.prepare();
  const rejected = expect(ready).rejects.toThrow("MUTATION_OWNER_CHANGED");
  const unaffected = await beginOptimisticOperation(c, [...root, "other", "write"], {
    queryKey: ["cold-other"],
  });
  const failureKey = [...root, "mutation", "event", "propose", "date", null];
  const failed = c.getMutationCache().build(c, { mutationKey: failureKey });
  failed.state.status = "error";
  const foreignFailure = c
    .getMutationCache()
    .build(c, { mutationKey: [...root, "mutation", "other", "propose"] });
  foreignFailure.state.status = "error";
  reconcileProposalAccessError(
    c,
    owner,
    standalone,
    new CommunityApiError(404, "EVENT_NOT_FOUND"),
    denied,
  );
  await rejected;
  expect(operation.signal.aborted).toBe(true);
  expect(queued.signal.aborted).toBe(true);
  expect(unaffected.active).toBe(true);
  for (const key of [...details, proposalPicker, collectionPicker])
    expect(c.getQueryData(key)).toBeUndefined();
  expect(c.getQueryState(denied)?.error).toMatchObject({ code: "EVENT_NOT_FOUND" });
  for (const key of retained) expect(c.getQueryData(key)).toBeDefined();
  expect(c.getQueryData(list)).toEqual(pages([{ id: "other" }]));
  expect(c.getQueryData(tables)).toEqual(pages([{ id: "safe", eventId: "other" }]));
  expect(c.getMutationCache().getAll()).not.toContain(failed);
  expect(c.getMutationCache().getAll()).toContain(foreignFailure);
});
it("filters disk-only standalone privileges using a retained verified denial, including review rosters", () => {
  const c = client(),
    root = ["events", owner.apiUrl, owner.userId];
  const queryKey = eventProposalKeys.page(owner, { ...scope, groupId: null, mode: "mine" });
  c.getQueryCache()
    .build(c, { queryKey })
    .setState({ status: "error", error: new CommunityApiError(404, "EVENT_NOT_FOUND") });
  const saved = (queryKey: readonly unknown[], data: unknown = { private: true }) => ({
    queryKey,
    state: { data },
  });
  const list = saved([...root, "list", {}], {
    pages: [{ items: [{ id: "event" }, { id: "safe" }] }],
    pageParams: [""],
  });
  const safe = [
    saved([...root, "detail", "safe"]),
    saved(["events", owner.apiUrl, "other", "detail", "event"]),
    saved(["events", "other", owner.userId, "detail", "event"]),
    saved(["groups", owner.apiUrl, owner.userId, "detail", "group"]),
  ];
  const privateRows = [
    saved([...root, "detail", "event"]),
    saved(eventProposalKeys.page(owner, { ...scope, groupId: null }, "unseen-page")),
    saved(["bgg-picker", owner.apiUrl, owner.userId, "", true, false, null, { eventId: "event" }]),
  ];
  expect(filterRevokedStandaloneEventRestore(c, [...privateRows, list, ...safe])).toEqual([
    { ...list, state: { data: { pages: [{ items: [{ id: "safe" }] }], pageParams: [""] } } },
    ...safe,
  ]);
  // The same scope becomes eligible again only after an authorized read replaces its denial.
  c.setQueryData(queryKey, page());
  expect(filterRevokedStandaloneEventRestore(c, privateRows)).toEqual(privateRows);
  const review = [...root, "participants", "event", "roles-v2", "review", null];
  c.getQueryCache()
    .build(c, { queryKey: review })
    .setState({ error: new CommunityApiError(401, "Unauthorized") });
  expect(filterRevokedStandaloneEventRestore(c, privateRows)).toEqual([]);
  c.getQueryCache()
    .find({ queryKey: review, exact: true })!
    .setState({ error: new CommunityApiError(403, "EVENT_ADMIN_REQUIRED") });
  expect(filterRevokedStandaloneEventRestore(c, privateRows)).toEqual(privateRows);
  c.getQueryCache()
    .find({ queryKey: review, exact: true })!
    .setState({ error: new Error("offline") });
  expect(filterRevokedStandaloneEventRestore(c, privateRows)).toEqual(privateRows);
});
