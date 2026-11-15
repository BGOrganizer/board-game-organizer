import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  beginOptimisticOperation,
  optimisticOperationSignal,
} from "../../common/optimisticOperation";
import {
  isUnclassifiedEventRead,
  removeRevokedGroupData,
  revokeCachedGroupAccess,
} from "../groupAccessCache";

const owner = { apiUrl: "api", userId: "owner" };
const group = "group",
  event = "event";
const groupRoot = ["groups", owner.apiUrl, owner.userId];
const eventRoot = ["events", owner.apiUrl, owner.userId];
const page = (items: unknown[]) => ({ pages: [{ items, nextCursor: null }], pageParams: [""] });
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const detail = [...groupRoot, "detail", group];
  const mine = [...groupRoot, "list", "mine"],
    discovery = [...groupRoot, "list", "discovery"];
  const eventDetail = [...eventRoot, "detail", event];
  const events = [...eventRoot, "list", {}];
  const other = { id: "other", groupId: null, dates: [] };
  client.setQueryData(detail, { id: group, role: "none", canViewEvents: false });
  client.setQueryData(mine, page([{ id: group }, { id: "other-group" }]));
  client.setQueryData(discovery, page([{ id: group }, { id: "other-group" }]));
  client.setQueryData([...groupRoot, "people", group], page([{ userId: "member" }]));
  client.setQueryData([...groupRoot, "leaderboard", group], { items: [{ userId: "member" }] });
  client.setQueryData([...groupRoot, "detail", "other-group"], { id: "other-group" });
  client.setQueryData(eventDetail, { id: event, groupId: group, dates: [] });
  client.setQueryData(events, page([{ id: event, groupId: group, dates: [] }, other]));
  client.setQueryData([...eventRoot, "table", event, "table"], {
    id: "table",
    eventId: event,
    groupId: group,
  });
  client.setQueryData([...eventRoot, "list", { groupId: group }], page([]));
  client.setQueryData([...eventRoot, "list", { filter: "future" }], page([other]));
  client.setQueryData([...eventRoot, "detail", "other"], other);
  client.setQueryData(
    [...eventRoot, "tables", null],
    page([{ id: "table", eventId: event, groupId: group }, other]),
  );
  client.setQueryData(["tables", owner.apiUrl, owner.userId, "custom", null], { groupId: group });
  client.setQueryData(["events", "foreign-api", owner.userId, "detail", event], { groupId: group });
  client.setQueryData(["groups", owner.apiUrl, "foreign-user", "detail", group], { id: group });
  client.setQueryData(["profile", owner.apiUrl, owner.userId], { id: group });
  client.setQueryData(
    ["profile", owner.apiUrl, owner.userId, "activities", "subject"],
    page([{ id: "protected", groupId: group }, { id: "unrelated" }]),
  );
  client.setQueryData(
    ["profile", owner.apiUrl, "foreign-user", "activities", "subject"],
    page([{ id: "protected", groupId: group }]),
  );
  return { client, detail, mine, discovery, eventDetail, events, other };
}

describe("verified Group access loss", () => {
  it.each([true, false])(
    "purges only protected owned resources and retains public basics only when authorized (%s)",
    (keepBasic) => {
      const { client, detail, mine, discovery, eventDetail, events, other } = setup();
      revokeCachedGroupAccess(client, owner, group, keepBasic);
      expect(client.getQueryData(detail)).toEqual(
        keepBasic ? { id: group, role: "none", canViewEvents: false } : undefined,
      );
      expect(client.getQueryData(mine)).toEqual(page([{ id: "other-group" }]));
      expect(client.getQueryData(discovery)).toEqual(
        page(keepBasic ? [{ id: group }, { id: "other-group" }] : [{ id: "other-group" }]),
      );
      expect(client.getQueryData([...groupRoot, "people", group])).toBeUndefined();
      expect(client.getQueryData([...groupRoot, "leaderboard", group])).toBeUndefined();
      expect(client.getQueryData(eventDetail)).toBeUndefined();
      expect(client.getQueryData([...eventRoot, "table", event, "table"])).toBeUndefined();
      expect(client.getQueryData([...eventRoot, "list", { groupId: group }])).toBeUndefined();
      expect(client.getQueryData(events)).toEqual(page([other]));
      expect(client.getQueryData([...eventRoot, "tables", null])).toEqual(page([other]));
      expect(client.getQueryData([...eventRoot, "detail", "other"])).toEqual(other);
      expect(client.getQueryData([...eventRoot, "list", { filter: "future" }])).toEqual(
        page([other]),
      );
      expect(
        client.getQueryData(["tables", owner.apiUrl, owner.userId, "custom", null]),
      ).toBeUndefined();
      expect(client.getQueryData([...groupRoot, "detail", "other-group"])).toEqual({
        id: "other-group",
      });
      expect(client.getQueryData(["events", "foreign-api", owner.userId, "detail", event])).toEqual(
        { groupId: group },
      );
      expect(
        client.getQueryData(["groups", owner.apiUrl, "foreign-user", "detail", group]),
      ).toEqual({ id: group });
      expect(client.getQueryData(["profile", owner.apiUrl, owner.userId])).toEqual({ id: group });
      expect(
        client.getQueryData(["profile", owner.apiUrl, owner.userId, "activities", "subject"]),
      ).toEqual(page([{ id: "unrelated" }]));
      expect(
        client.getQueryData(["profile", owner.apiUrl, "foreign-user", "activities", "subject"]),
      ).toEqual(page([{ id: "protected", groupId: group }]));
    },
  );
  it("purges owned roster-only snapshots and cancels their Event writer without leaking retained historical rosters", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const key = [...eventRoot, "participants", event];
    const data = {
      pages: [
        {
          groupId: group,
          status: "TERMINATED",
          eventVersion: 3,
          items: [{ userId: "private-member" }],
        },
      ],
      pageParams: [""],
    };
    client.setQueryData(key, data);
    const foreign = ["events", owner.apiUrl, "another-actor", "participants", event];
    client.setQueryData(foreign, data);
    const operation = await beginOptimisticOperation(client, [...eventRoot, event, "write"], {
      queryKey: key,
    });
    revokeCachedGroupAccess(client, owner, group, true);
    expect(client.getQueryData(key)).toBeUndefined();
    expect(operation.signal.aborted).toBe(true);
    expect(client.getQueryData(foreign)).toEqual(data);
    client.clear();
  });
  it("cancels a revoked Event writer but preserves another Event's pending operation and rollback", async () => {
    const { client, eventDetail, events, other } = setup();
    const revoked = await beginOptimisticOperation(client, [...eventRoot, event], {
      queryKey: eventRoot,
    });
    const independent = await beginOptimisticOperation(client, [...eventRoot, "other"], {
      queryKey: eventRoot,
    });
    const signal = optimisticOperationSignal(client, [...eventRoot, event]);
    revokeCachedGroupAccess(client, owner, group, true);
    expect(signal.aborted).toBe(true);
    expect(revoked.active).toBe(false);
    expect(independent.active).toBe(true);
    revoked.commit(() => ({ leaked: true }));
    independent.rollback();
    expect(client.getQueryData(eventDetail)).toBeUndefined();
    expect(client.getQueryData(events)).toEqual(page([other]));
  });
});

it("handles ordinary pages, malformed entries and independent frozen/shared rows without unnecessary writes", () => {
  const ids = new Set([event]);
  for (const value of [
    undefined,
    null,
    0,
    {},
    { pages: null },
    { items: null },
    { pages: [null, {}] },
  ])
    expect(removeRevokedGroupData(value, group, ids)).toBe(value);
  const personal = { eventId: event, personalAccessOnly: true };
  const shared = { groupId: group, sharedResultsOnly: true };
  const data = {
    items: [null, 1, personal, shared, { groupId: group }, { eventId: event }, { id: "unrelated" }],
  };
  expect(removeRevokedGroupData(data, group, ids)).toEqual({
    items: [null, 1, personal, shared, { id: "unrelated" }],
  });
  const safe = page([personal, shared]);
  expect(removeRevokedGroupData(safe, group, ids)).toBe(safe);
});

it("cancels Group journal work and leaves unrelated operations and their rollback intact", async () => {
  const { client, mine } = setup();
  const revoked = await beginOptimisticOperation(client, [...groupRoot, group, "members"], {
    queryKey: groupRoot,
  });
  const unrelated = await beginOptimisticOperation(client, [...groupRoot, "other-group"], {
    queryKey: groupRoot,
  });
  revokeCachedGroupAccess(client, owner, group, false);
  expect(revoked.signal.aborted).toBe(true);
  expect(unrelated.active).toBe(true);
  revoked.commit(() => page([{ id: group }]));
  unrelated.rollback();
  expect(client.getQueryData(mine)).toEqual(page([{ id: "other-group" }]));
  client.clear();
});

it("purges cold proposal/review scopes, preserves safe projections and the current key", () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const proposal = [...eventRoot, "proposals", event, "review", group];
  const review = [...eventRoot, "participants", "review-event", "roles-v2", "review", group];
  const keep = [...groupRoot, "detail", group];
  client.setQueryData(proposal, {});
  client.setQueryData(review, {});
  client.setQueryData(keep, { id: group });
  client.setQueryData([...eventRoot, "detail", event], { personalAccessOnly: true });
  client.setQueryData([...eventRoot, "table", event, "shared"], { sharedResultsOnly: true });
  revokeCachedGroupAccess(client, owner, group, false, keep);
  expect(client.getQueryData(proposal)).toBeUndefined();
  expect(client.getQueryData(review)).toBeUndefined();
  expect(client.getQueryData(keep)).toEqual({ id: group });
  expect(client.getQueryData([...eventRoot, "detail", event])).toEqual({
    personalAccessOnly: true,
  });
  expect(client.getQueryData([...eventRoot, "table", event, "shared"])).toEqual({
    sharedResultsOnly: true,
  });
  client.clear();
});

it("cancels only susceptible in-flight reads, keeps the current key, and restarts an active list safely", async () => {
  const { QueryObserver } = await import("@tanstack/react-query");
  const { client, eventDetail, events, other } = setup();
  const resolvers: ((value: unknown) => void)[] = [];
  const read = (queryKey: unknown[]) =>
    client
      .fetchQuery({ queryKey, queryFn: () => new Promise((resolve) => resolvers.push(resolve)) })
      .catch(() => undefined);
  const stale = read(eventDetail);
  const foreignDetail = [...eventRoot, "detail", "other"];
  const good = read(foreignDetail);
  const keep = [...groupRoot, "detail", group];
  const current = read(keep);
  const otherListKey = [...eventRoot, "list", { groupId: "other-group" }];
  const otherList = read(otherListKey);
  let calls = 0;
  const observer = new QueryObserver(client, {
    queryKey: events,
    queryFn: async () => {
      calls++;
      return page([other]);
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  revokeCachedGroupAccess(client, owner, group, false, keep);
  resolvers[0]({ groupId: group, private: true });
  resolvers[1](other);
  resolvers[2]({ id: group, readOnly: true });
  resolvers[3](page([other]));
  await Promise.all([stale, good, current, otherList]);
  expect(client.getQueryData(eventDetail)).toBeUndefined();
  expect(client.getQueryData(foreignDetail)).toEqual(other);
  expect(client.getQueryData(keep)).toEqual({ id: group, readOnly: true });
  expect(client.getQueryData(otherListKey)).toEqual(page([other]));
  expect(calls).toBeGreaterThan(0);
  expect(client.getQueryData(events)).toEqual(page([other]));
  unsubscribe();
  client.clear();
});

it("cancels fetching data-linked and Group-filtered scopes even with no Event identity", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const keys = [
    ["tables", owner.apiUrl, owner.userId, "custom", 0],
    [...eventRoot, "list", { groupId: group }],
  ];
  const resolvers: ((value: unknown) => void)[] = [];
  const reads = keys.map((queryKey) => {
    client.setQueryData(queryKey, { groupId: group });
    return client
      .fetchQuery({ queryKey, queryFn: () => new Promise((resolve) => resolvers.push(resolve)) })
      .catch(() => undefined);
  });
  revokeCachedGroupAccess(client, owner, group, false);
  for (const resolve of resolvers) resolve({ groupId: group, secret: true });
  await Promise.all(reads);
  for (const key of keys) expect(client.getQueryData(key)).toBeUndefined();
  client.clear();
});

it("cancels cold unscoped list/activity reads while retaining another Group's filtered source", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const keys = [
    [...eventRoot, "list", null],
    [...eventRoot, "list", {}],
    [...eventRoot, "list", { groupId: null }],
    [...eventRoot, "tables", null],
    ["profile", owner.apiUrl, owner.userId, "activities", "subject"],
    [...eventRoot, "list", { groupId: "other-group" }],
  ];
  const resolvers: ((value: unknown) => void)[] = [];
  const reads = keys.map((queryKey) =>
    client
      .fetchQuery({ queryKey, queryFn: () => new Promise((resolve) => resolvers.push(resolve)) })
      .catch(() => undefined),
  );
  revokeCachedGroupAccess(client, owner, group, false);
  for (const resolve of resolvers) resolve(page([{ id: "unrelated" }]));
  await Promise.all(reads);
  for (const key of keys.slice(0, -1)) expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryData(keys[5])).toEqual(page([{ id: "unrelated" }]));
  client.clear();
});

it("classifies Event reads only from same-owner authoritative Group/standalone scope", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const key = [...eventRoot, "detail", "cold"];
  expect(isUnclassifiedEventRead(client, key)).toBe(true);
  for (const data of [
    null,
    0,
    "invalid",
    {},
    { groupId: undefined },
    { groupId: null, personalAccessOnly: true },
    { groupId: "group", sharedResultsOnly: true },
    { pages: [null, {}] },
    { items: [0] },
  ]) {
    client.setQueryData(key, data);
    expect(isUnclassifiedEventRead(client, key)).toBe(true);
  }
  client.setQueryData(["events", "foreign-api", owner.userId, "detail", "cold"], {
    groupId: "known",
  });
  client.setQueryData(["events", owner.apiUrl, "foreign-user", "detail", "cold"], {
    groupId: null,
  });
  expect(isUnclassifiedEventRead(client, key)).toBe(true);
  client.setQueryData(
    [...eventRoot, "list", {}],
    page([
      { id: "unrelated", groupId: "group" },
      { id: "cold", groupId: "known" },
    ]),
  );
  expect(isUnclassifiedEventRead(client, key)).toBe(false);
  client.removeQueries({ queryKey: [...eventRoot, "list", {}], exact: true });
  client.setQueryData([...eventRoot, "tables", null], {
    items: [{ eventId: "cold", groupId: null }],
  });
  expect(isUnclassifiedEventRead(client, key)).toBe(false);
  client.removeQueries({ queryKey: [...eventRoot, "tables", null], exact: true });
  client.setQueryData(key, { groupId: null });
  expect(isUnclassifiedEventRead(client, key)).toBe(false);
  expect(isUnclassifiedEventRead(client, [...groupRoot, "detail", group])).toBe(false);
  expect(isUnclassifiedEventRead(client, [...eventRoot, "list", {}])).toBe(false);
  expect(isUnclassifiedEventRead(client, [...eventRoot, "tables", null])).toBe(false);
  expect(
    isUnclassifiedEventRead(client, [...eventRoot, "proposals", "cold", "review", "known"]),
  ).toBe(false);
  expect(
    isUnclassifiedEventRead(client, [
      ...eventRoot,
      "participants",
      "cold",
      "roles-v2",
      "review",
      "known",
    ]),
  ).toBe(false);
  client.clear();
});
