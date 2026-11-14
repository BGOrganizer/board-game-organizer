import type {
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { emptyAttentionSummary } from "../notificationAttention";
import {
  attentionRoot,
  cachedAttention,
  notificationFilters,
  projectAttentionRead,
} from "../notificationAttentionCache";

const options = { apiUrl: "https://api.test", userId: "owner" };
const id = "11111111-1111-4111-8111-111111111111";
const table = { kind: "table", id } as const;
function snapshot(target: NotificationAttentionTarget, count = 2): NotificationAttentionSnapshot {
  return {
    asOf: "2027-01-01T00:00:00.000Z",
    unreadCount: 2,
    summary: { ...emptyAttentionSummary(), tables: 2, events: 2 },
    targets: [
      {
        target,
        count,
        direct: count,
        events: 0,
        sections: { connections: 0, requests: 0, search: 0 },
      },
    ],
  };
}
it("shares one owner filter without exposing another API, actor or unrelated cache", () => {
  const { predicate } = notificationFilters(options);
  for (const root of ["notifications", "notification-attention"])
    expect(predicate({ queryKey: [root, options.apiUrl, options.userId] })).toBe(true);
  for (const key of [
    ["groups", options.apiUrl, options.userId],
    ["notifications", "other", options.userId],
    ["notification-attention", options.apiUrl, "other"],
  ])
    expect(predicate({ queryKey: key })).toBe(false);
});
it("finds only materialized target snapshots and uses client receipt age, not a server clock that may drift", () => {
  const client = new QueryClient();
  try {
    client.setQueryData(
      [...attentionRoot({ ...options, userId: "other" }), "foreign"],
      snapshot(table),
    );
    client
      .getQueryCache()
      .build(client, { queryKey: [...attentionRoot(options), "unmaterialized"] });
    client.setQueryData(
      [...attentionRoot(options), "wrong-target"],
      snapshot({ kind: "group", id }),
    );
    expect(cachedAttention(client, options, table)).toBeUndefined();
    const old = { ...snapshot(table), asOf: "2099-01-01T00:00:00.000Z" },
      current = snapshot(table, 0);
    client.setQueryData([...attentionRoot(options), "old"], old, { updatedAt: 100 });
    client.setQueryData([...attentionRoot(options), "new"], current, { updatedAt: 200 });
    expect(cachedAttention(client, options, table)?.snapshot).toBe(current);
    expect(cachedAttention(client, options, table)?.row.count).toBe(0);
  } finally {
    client.clear();
  }
});
it("preserves paging and immutable read times, handles ISO precision equally and excludes descendants/newer arrivals", () => {
  const through = "2027-01-01T00:00:00.000Z",
    readAt = "2027-01-01T00:01:00.000Z";
  expect(
    projectAttentionRead(undefined, ["notifications"], { target: table }, 2, through, readAt),
  ).toBeUndefined();
  const dto = (
    n: number,
    createdAt: string,
    reference = { target: table },
    previous: string | null = null,
  ) => ({
    id: String(n),
    kind: "event_booking_removed" as const,
    title: "Fixture",
    description: "Fixture",
    href: `/events/${id}/tables/${id}`,
    createdAt,
    readAt: previous,
    attention: reference,
  });
  const data: InfiniteData<NotificationListResponse> = {
    pages: [
      {
        notifications: [
          dto(1, "2027-01-01T00:00:00Z"),
          dto(2, "2027-01-01T00:00:00.001Z"),
          dto(3, through, undefined, "existing-read"),
        ],
        unreadCount: 2,
        nextCursor: "next",
        attention: snapshot(table).summary,
      },
      { notifications: [], unreadCount: 2, nextCursor: null },
    ],
    pageParams: [undefined, "page2"],
  };
  const next = projectAttentionRead(
    data,
    ["notifications"],
    { target: table },
    1,
    through,
    readAt,
  ) as typeof data;
  expect(next.pageParams).toBe(data.pageParams);
  expect(next.pages[0].nextCursor).toBe("next");
  expect(next.pages[0].notifications.map((row) => row.readAt)).toEqual([
    readAt,
    null,
    "existing-read",
  ]);
  expect(next.pages.map((page) => page.unreadCount)).toEqual([1, 1]);
  expect(next.pages[0].attention?.tables).toBe(1);
  expect(next.pages[1]).not.toHaveProperty("attention");
  const parent = projectAttentionRead(
    data,
    ["notifications"],
    { target: { kind: "event", id } },
    0,
    through,
    readAt,
  ) as typeof data;
  expect(parent.pages[0].notifications[0]).toBe(data.pages[0].notifications[0]);
  const counts = snapshot(table);
  expect(
    (
      projectAttentionRead(
        counts,
        ["notification-attention"],
        { target: table },
        1,
        through,
        readAt,
      ) as typeof counts
    ).targets[0].count,
  ).toBe(1);
});
