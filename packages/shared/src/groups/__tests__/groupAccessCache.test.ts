import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  beginOptimisticOperation,
  optimisticOperationSignal,
} from "../../common/optimisticOperation";
import { revokeCachedGroupAccess } from "../groupAccessCache";

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
    },
  );
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
