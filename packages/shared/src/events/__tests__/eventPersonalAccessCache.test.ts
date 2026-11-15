import { dehydrate, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { beginOptimisticOperation } from "../../common/optimisticOperation";
import {
  filterPersonalEventAccessRestore,
  reconcilePersonalEventAccess,
} from "../eventPersonalAccessCache";

const owner = { apiUrl: "api", userId: "reader" };
const root = ["events", owner.apiUrl, owner.userId];
const groupRoot = ["groups", owner.apiUrl, owner.userId];
const personal = { id: "event", groupId: null, personalAccessOnly: true, readOnly: true };
const full = { id: "event", groupId: "group", dates: [], privatePlanning: "private-plan" };
const other = { id: "other", groupId: "other-group", dates: [] };
const page = (items: unknown[]) => ({ items, nextCursor: null });
const pages = (items: unknown[]) => ({ pages: [page(items)], pageParams: [""] });
const create = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

describe("verified personal Event access", () => {
  it("replaces only the owned detail and purges known Group/roster/ratings privileges, retaining independent projections", () => {
    const client = create(),
      key = [...root, "detail", "event"];
    client.setQueryData(key, full);
    client.setQueryData([...groupRoot, "people", "group"], pages([{ userId: "private-member" }]));
    client.setQueryData([...root, "participants", "event"], {
      groupId: "group",
      items: [{ email: "private-email" }],
    });
    client.setQueryData([...root, "leaderboard", "event", "table"], {
      scope: "GROUP",
      groupId: "group",
    });
    client.setQueryData([...root, "detail", "preserved"], {
      id: "preserved",
      personalAccessOnly: true,
      groupId: null,
    });
    client.setQueryData(
      [...root, "list", {}],
      pages([full, other, { ...personal, id: "preserved" }]),
    );
    client.setQueryData(["events", "other-api", owner.userId, "detail", "event"], full);
    client.setQueryData(["events", owner.apiUrl, "other-reader", "detail", "event"], full);
    reconcilePersonalEventAccess(client, owner, personal, key);
    expect(client.getQueryData(key)).toEqual(personal);
    expect(client.getQueryData([...groupRoot, "people", "group"])).toBeUndefined();
    expect(client.getQueryData([...root, "participants", "event"])).toBeUndefined();
    expect(client.getQueryData([...root, "leaderboard", "event", "table"])).toBeUndefined();
    expect(client.getQueryData([...root, "list", {}])).toEqual(
      pages([other, { ...personal, id: "preserved" }]),
    );
    expect(client.getQueryData([...root, "detail", "preserved"])).toBeDefined();
    expect(client.getQueryData(["events", "other-api", owner.userId, "detail", "event"])).toEqual(
      full,
    );
    expect(
      client.getQueryData(["events", owner.apiUrl, "other-reader", "detail", "event"]),
    ).toEqual(full);
    const owned = dehydrate(client).queries.filter(
      (query) => query.queryKey[1] === owner.apiUrl && query.queryKey[2] === owner.userId,
    );
    expect(JSON.stringify(owned)).not.toMatch(/private-plan|private-member|private-email/);
    client.clear();
  });
  it("purges a cold detail's revoked Group scope even when no cached Event retains its parent identity", () => {
    const client = create(),
      key = [...root, "detail", "event"];
    client.setQueryData([...groupRoot, "people", "group"], pages([{ email: "private-email" }]));
    client.setQueryData([...groupRoot, "detail", "other-group"], {
      id: "other-group",
      canViewMembers: true,
    });
    const result = { ...personal, accessRevokedGroupId: "group" };
    reconcilePersonalEventAccess(client, owner, result, key);
    expect(client.getQueryData([...groupRoot, "people", "group"])).toBeUndefined();
    expect(client.getQueryData([...groupRoot, "detail", "other-group"])).toEqual({
      id: "other-group",
      canViewMembers: true,
    });
    expect(client.getQueryData(key)).toEqual(result);
    client.clear();
  });
  it("cancels the enclosing infinite fetch so captured older pages cannot restore private data", async () => {
    const client = create(),
      key = [...root, "list", {}];
    client.setQueryData(key, { pages: [page([full, other])], pageParams: [""] });
    const result = page([personal]);
    await client
      .fetchInfiniteQuery({
        queryKey: key,
        initialPageParam: "",
        queryFn: async ({ pageParam }) => {
          reconcilePersonalEventAccess(client, owner, result, key, pageParam);
          return result;
        },
      })
      .catch(() => undefined);
    expect(client.getQueryData(key)).toEqual({ pages: [result], pageParams: [""] });
    client.clear();
  });
  it("retains unrelated older pages and their cursor identities during a next-page downgrade", () => {
    const client = create(),
      key = [...root, "list", {}];
    client.setQueryData(key, pages([full, other]));
    reconcilePersonalEventAccess(client, owner, page([personal]), key, "next");
    expect(client.getQueryData(key)).toEqual({
      pages: [page([other]), page([personal])],
      pageParams: ["", "next"],
    });
    client.clear();
  });
  it("revokes Event-scoped privileges even when only a roster supplies its Group link", () => {
    const client = create(),
      key = [...root, "table", "event", "table"];
    client.setQueryData(
      [...root, "participants", "event", "roles-v2", "review", "group"],
      pages([{ userId: "private-member" }]),
    );
    client.setQueryData([...groupRoot, "people", "group"], pages([{ userId: "private-member" }]));
    const table = { id: "table", eventId: "event", groupId: null, personalAccessOnly: true };
    reconcilePersonalEventAccess(client, owner, table, key);
    expect(client.getQueryData(key)).toEqual(table);
    expect(client.getQueryData([...groupRoot, "people", "group"])).toBeUndefined();
    client.clear();
  });
  it("cancels stale writers without letting a late ACK or rollback recreate private fields", async () => {
    const client = create(),
      key = [...root, "detail", "event"];
    client.setQueryData(key, full);
    const operation = await beginOptimisticOperation(client, [...root, "event"], {
      queryKey: root,
    });
    reconcilePersonalEventAccess(client, owner, personal, key);
    expect(operation.active).toBe(false);
    operation.commit(() => full);
    operation.rollback();
    expect(client.getQueryData(key)).toEqual(personal);
    client.clear();
  });
  it("does not cancel or rewrite already safe reads, ordinary results or foreign owners", () => {
    const client = create(),
      key = [...root, "detail", "event"];
    client.setQueryData(key, personal);
    const before = client.getQueryState(key)?.dataUpdatedAt;
    reconcilePersonalEventAccess(client, owner, personal, key);
    reconcilePersonalEventAccess(client, owner, full, key);
    reconcilePersonalEventAccess(client, { ...owner, userId: "another" }, personal, [
      "events",
      "api",
      "another",
      "detail",
      "event",
    ]);
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(before);
    expect(client.getQueryData(key)).toEqual(personal);
    client.clear();
  });
});

it("cancels cold Event and unscoped list reads, but not another scoped read", async () => {
  const client = create(),
    key = [...root, "detail", "event"];
  let resolve!: (value: unknown) => void;
  const stale = client
    .fetchQuery({
      queryKey: [...root, "participants", "event"],
      queryFn: () =>
        new Promise((r) => {
          resolve = r;
        }),
    })
    .catch(() => undefined);
  let resolveOther!: (value: unknown) => void;
  const unrelated = client.fetchQuery({
    queryKey: [...root, "tables", "other"],
    queryFn: () =>
      new Promise((r) => {
        resolveOther = r;
      }),
  });
  let resolveList!: (value: unknown) => void;
  const listKey = [...root, "tables", null];
  const list = client
    .fetchQuery({
      queryKey: listKey,
      queryFn: () =>
        new Promise((r) => {
          resolveList = r;
        }),
    })
    .catch(() => undefined);
  reconcilePersonalEventAccess(client, owner, personal, key);
  resolve({ items: [{ email: "private-email" }] });
  resolveList(pages([full]));
  resolveOther(pages([other]));
  await Promise.all([stale, list, unrelated]);
  expect(client.getQueryData([...root, "participants", "event"])).toBeUndefined();
  expect(client.getQueryData(listKey)).toBeUndefined();
  expect(client.getQueryData([...root, "tables", "other"])).toEqual(pages([other]));
  expect(client.getQueryData(key)).toEqual(personal);
  client.clear();
});

it("cancels a cold writer even with no privileged cached row", async () => {
  const client = create();
  const operation = await beginOptimisticOperation(client, [...root, "event"], { queryKey: root });
  reconcilePersonalEventAccess(client, owner, personal, [...root, "detail", "event"]);
  expect(operation.signal.aborted).toBe(true);
  operation.commit(() => full);
  expect(client.getQueryData([...root, "detail", "event"])).toBeUndefined();
  client.clear();
});

it("updates the enclosing journal base without absorbing an unrelated pending projection", async () => {
  const client = create(),
    key = [...root, "list", {}];
  client.setQueryData(key, pages([full, other]));
  const operation = await beginOptimisticOperation(
    client,
    [...root, "other"],
    { queryKey: key },
    (value) => {
      const data = value as ReturnType<typeof pages>;
      return { ...data, pending: true };
    },
  );
  reconcilePersonalEventAccess(client, owner, page([personal]), key, "next");
  operation.rollback();
  expect(client.getQueryData(key)).toEqual({
    pages: [page([other]), page([personal])],
    pageParams: ["", "next"],
  });
  client.clear();
});

it("revokes proposal-linked Group data and ordinary page rows without destroying independent snapshots", () => {
  const client = create(),
    key = [...root, "detail", "event"];
  client.setQueryData([...root, "proposals", "event", "mine", "group"], { items: [] });
  client.setQueryData([...root, "list", {}], page([full, other]));
  client.setQueryData(
    [...root, "tables", "event"],
    pages([{ id: "table", eventId: "event", personalAccessOnly: true }]),
  );
  client.setQueryData([...root, "detail", "shared"], { ...full, sharedResultsOnly: true });
  reconcilePersonalEventAccess(client, owner, personal, key);
  expect(client.getQueryData([...root, "proposals", "event", "mine", "group"])).toBeUndefined();
  expect(client.getQueryData([...root, "list", {}])).toEqual(page([other]));
  expect(client.getQueryData([...root, "tables", "event"])).toEqual(
    pages([{ id: "table", eventId: "event", personalAccessOnly: true }]),
  );
  expect(client.getQueryData([...root, "detail", "shared"])).toEqual({
    ...full,
    sharedResultsOnly: true,
  });
  client.clear();
});

it("builds a cold infinite page when authority loss is only in another cache", () => {
  const client = create(),
    key = [...root, "tables", null];
  client.setQueryData([...root, "detail", "event"], full);
  reconcilePersonalEventAccess(
    client,
    owner,
    page([{ ...personal, eventId: "event", id: "table" }]),
    key,
    "",
  );
  expect(client.getQueryData(key)).toEqual(pages([{ ...personal, eventId: "event", id: "table" }]));
  client.clear();
});

it("ignores non-record results and records with no personal access marker", () => {
  const client = create();
  for (const result of [undefined, null, 0, [], { items: [null, 1, other] }])
    reconcilePersonalEventAccess(client, owner, result, [...root, "detail", "event"]);
  expect(client.getQueryCache().getAll()).toEqual([]);
});

it("pre-filters disk-only privileges using current authoritative personal bases and saved associations", () => {
  const client = create();
  client.setQueryData([...root, "detail", "event"], personal);
  const snapshot = (queryKey: unknown[], data: unknown) => ({
    queryKey,
    state: { data, dataUpdatedAt: 100 },
  });
  const independent = { ...full, sharedResultsOnly: true };
  const saved = [
    snapshot([...root, "detail", "event"], full),
    snapshot([...groupRoot, "people", "group"], pages([{ email: "private" }])),
    snapshot([...root, "participants", "event"], { items: [] }),
    snapshot([...root, "list", {}], pages([full, other, independent])),
    snapshot([...root, "list", { groupId: "group" }], pages([full])),
    snapshot([...root, "table", "event", "table"], { eventId: "event", personalAccessOnly: true }),
    snapshot([...root, "detail", "shared"], independent),
    snapshot([...root, "roster", "unscoped"], { groupId: "group" }),
    snapshot([...root, "detail", "odd-key"], { eventId: "event" }),
    snapshot([...root, "detail", "other"], other),
    snapshot(["profile", owner.apiUrl, owner.userId, "network"], pages([full, other])),
    snapshot(["groups", "foreign-api", owner.userId, "people", "group"], { private: true }),
    snapshot(["groups", owner.apiUrl, "foreign-user", "people", "group"], { private: true }),
  ];
  const safe = filterPersonalEventAccessRestore(client, saved);
  expect(safe.map((row) => row.state.data)).toEqual([
    pages([other, independent]),
    { eventId: "event", personalAccessOnly: true },
    independent,
    other,
    pages([other]),
    { private: true },
    { private: true },
  ]);
  expect(saved[0].state.data).toEqual(full);
  client.clear();
});

it("does not turn optimistic personal overlays into restoration authority", async () => {
  const client = create();
  client.setQueryData([...root, "detail", "event"], full);
  client.setQueryData(["other"], personal);
  const operation = await beginOptimisticOperation(
    client,
    [...root, "other"],
    { queryKey: root },
    () => personal,
  );
  const saved = [
    { queryKey: [...groupRoot, "people", "group"], state: { data: { email: "member" } } },
  ];
  expect(filterPersonalEventAccessRestore(client, saved)).toEqual(saved);
  operation.rollback();
  client.clear();
});

it("prunes Event-only list bases and cancels captured global pages without a cached Group association", async () => {
  const client = create(),
    key = [...root, "detail", "event"],
    list = [...root, "list", {}];
  const privateEvent = { id: "event", private: true };
  client.setQueryData(list, pages([privateEvent, other]));
  let finish: (value: unknown) => void = () => {};
  const stale = client
    .fetchQuery({
      queryKey: list,
      queryFn: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    })
    .catch(() => undefined);
  reconcilePersonalEventAccess(client, owner, personal, key);
  finish(pages([privateEvent]));
  await stale;
  expect(client.getQueryData(list)).toEqual(pages([other]));
  expect(client.getQueryState(list)?.isInvalidated).toBe(true);
  reconcilePersonalEventAccess(client, owner, { personalAccessOnly: true }, key);
  client.clear();
});

it("cancels legacy unscoped list reads without filters", async () => {
  const client = create(),
    list = [...root, "list"];
  let finish: (value: unknown) => void = () => {};
  const read = client
    .fetchQuery({
      queryKey: list,
      queryFn: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    })
    .catch(() => undefined);
  reconcilePersonalEventAccess(client, owner, personal, [...root, "detail", "event"]);
  finish(pages([full]));
  await read;
  expect(client.getQueryData(list)).toBeUndefined();
  client.clear();
});

it("distinguishes cold unscoped and unrelated Group-filtered lists without a Group revocation", async () => {
  const client = create();
  const keys = [
    [...root, "list", {}],
    [...root, "list", { groupId: "other-group" }],
  ];
  const resolvers: ((value: unknown) => void)[] = [];
  const reads = keys.map((queryKey) =>
    client
      .fetchQuery({ queryKey, queryFn: () => new Promise((resolve) => resolvers.push(resolve)) })
      .catch(() => undefined),
  );
  reconcilePersonalEventAccess(client, owner, personal, [...root, "detail", "event"]);
  for (const resolve of resolvers) resolve(pages([other]));
  await Promise.all(reads);
  expect(client.getQueryData(keys[0])).toBeUndefined();
  expect(client.getQueryData(keys[1])).toEqual(pages([other]));
  client.clear();
});

it("revokes metadata-scoped cold Group reads and writers before either can materialize privileges", async () => {
  const client = create(),
    key = [...root, "detail", "event"];
  const operation = await beginOptimisticOperation(client, [...groupRoot, "group", "members"], {
    queryKey: groupRoot,
  });
  const people = [...groupRoot, "people", "group"];
  let finish: (value: unknown) => void = () => {};
  const read = client
    .fetchQuery({
      queryKey: people,
      queryFn: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    })
    .catch(() => undefined);
  reconcilePersonalEventAccess(client, owner, { ...personal, accessRevokedGroupId: "group" }, key);
  finish(pages([{ email: "private-member" }]));
  await read;
  operation.commit(() => pages([{ email: "private-member" }]));
  expect(operation.signal.aborted).toBe(true);
  expect(client.getQueryData(people)).toBeUndefined();
  expect(client.getQueryData(key)).toEqual({ ...personal, accessRevokedGroupId: "group" });
  client.clear();
});

it.each([false, true])(
  "cancels a cold sibling during Group revocation even when A is already personal (%s)",
  async (alreadyPersonal) => {
    const client = create(),
      key = [...root, "detail", "event"];
    const result = { ...personal, accessRevokedGroupId: "group" };
    client.setQueryData(key, alreadyPersonal ? result : full);
    const siblingKey = [...root, "detail", "sibling"];
    let finish: (value: unknown) => void = () => {};
    const read = client
      .fetchQuery({
        queryKey: siblingKey,
        queryFn: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    reconcilePersonalEventAccess(client, owner, result, key);
    finish({ id: "sibling", groupId: "group", secret: "private-sibling" });
    await read;
    expect(client.getQueryData(siblingKey)).toBeUndefined();
    expect(client.getQueryData(key)).toEqual(result);
    client.clear();
  },
);
