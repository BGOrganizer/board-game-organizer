import { notificationItemId } from "@board-game-organizer/schemas";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { notificationReadAliases } from "../notificationAttentionCache";
import { notificationDestination, notificationWebHref } from "../notificationDestination";

const eventId = "11111111-1111-4111-8111-111111111111",
  tableId = "22222222-2222-4222-8222-222222222222";
const href = `/events/${eventId}/tables/${tableId}`,
  at = "2026-01-01T00:00:00.000Z";
it("opens generic Table participation at Participants, never Details, without acknowledging it", () => {
  for (const kind of [
    "table_invitation",
    "event_booking_requested",
    "event_booking_confirmed",
    "event_booking_removed",
    "event_demonstrator",
  ] as const) {
    expect(notificationDestination({ kind, href })).toEqual({
      href,
      itemId: undefined,
      section: "participants",
    });
    expect(notificationWebHref({ kind, href })).toBe(href + "?tab=participants");
  }
  expect(notificationWebHref({ kind: "event_updated", href })).toBe(href);
});
it("routes a precise Table invitation to Participants while preserving the exact captured anchor", () => {
  const point = notificationItemId(tableId, "invitation", undefined, "table");
  const note = {
    kind: "table_invitation" as const,
    href,
    attentionItems: [{ id: point, readAt: null }],
  };
  expect(notificationDestination(note)).toEqual({ href, itemId: point, section: "participants" });
  expect(notificationWebHref(note)).toBe(
    `${href}?tab=participants&attention=${encodeURIComponent(point)}#attention-${encodeURIComponent(point)}`,
  );
});
it("serializes shared source notices from materialized changes caches, not later/other points or absent pages", () => {
  const client = new QueryClient(),
    o = { apiUrl: "api", userId: "user", getToken: async () => "token" };
  const point = notificationItemId(tableId, "game", 1),
    other = notificationItemId(tableId, "game", 2),
    target = { kind: "item" as const, id: point };
  client
    .getQueryCache()
    .build(client, { queryKey: ["notification-changes", "api", "user", "absent"] });
  client.setQueryData(["notification-changes", "api", "user", "loaded"], {
    pages: [
      {
        changes: [
          { notificationId: "a", itemId: point, effectiveAt: at },
          { notificationId: "b", itemId: other, effectiveAt: at },
          { notificationId: "c", itemId: point, effectiveAt: "2026-01-02T00:00:00.000Z" },
        ],
      },
    ],
  });
  expect(notificationReadAliases(client, o, target, at)).toEqual([
    ["notifications", "api", "user", "item", "a"],
  ]);
  client.clear();
});
