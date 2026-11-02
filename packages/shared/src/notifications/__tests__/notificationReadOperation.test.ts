import {
  type NotificationAttentionSnapshot,
  notificationItemId,
} from "@board-game-organizer/schemas";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { optimisticOperationState } from "../../common/optimisticOperation";
import { emptyAttentionSummary } from "../notificationAttention";
import { beginNotificationItemRead } from "../notificationReadOperation";

const options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
const id = "11111111-1111-4111-8111-111111111111";
const itemId = notificationItemId(id, "invitation");
const target = { kind: "item", id: itemId } as const,
  group = { kind: "group", id } as const;
const key = ["notification-attention", options.apiUrl, options.userId, "source"];
function source(): NotificationAttentionSnapshot {
  const summary = { ...emptyAttentionSummary(), groups: 2, events: 1 };
  return {
    asOf: "2027-01-01T00:00:00.000Z",
    unreadCount: 3,
    summary,
    targets: [
      {
        target,
        count: 1,
        direct: 1,
        events: 0,
        sections: summary.sections,
        readEffect: {
          unread: 1,
          summary: { ...emptyAttentionSummary(), groups: 1 },
          targets: [target, group].map((target) => ({
            target,
            count: 1,
            direct: target.kind === "item" ? 1 : 0,
            events: 0,
          })),
        },
      },
      { target: group, count: 2, direct: 1, events: 0, sections: summary.sections },
    ],
  };
}
it("applies a captured consent read to inactive caches immediately, then selectively rolls it back or commits a known ACK", async () => {
  const client = new QueryClient();
  try {
    const before = source(),
      foreign = ["notification-attention", options.apiUrl, "other", "source"];
    client.setQueryData(key, before);
    client.setQueryData(foreign, before);
    client.setQueryData(["notifications", options.apiUrl, options.userId, "en"], {
      pages: [
        {
          unreadCount: 3,
          nextCursor: null,
          notifications: [
            {
              id: "invitation-notice",
              kind: "group_invitation",
              href: `/groups/${id}`,
              title: "Invite",
              description: "Invite",
              createdAt: before.asOf,
              readAt: null,
              attention: { target: group, itemIds: [itemId] },
            },
          ],
        },
      ],
      pageParams: [undefined],
    });
    const read = await beginNotificationItemRead(client, options, itemId);
    expect(read?.through).toBe(before.asOf);
    expect(
      optimisticOperationState(client, [
        "notifications",
        options.apiUrl,
        options.userId,
        "item",
        "invitation-notice",
      ]).busy(),
    ).toBe(true);
    expect(
      optimisticOperationState(client, [
        "notifications",
        options.apiUrl,
        options.userId,
        "item",
        "unrelated-notice",
      ]).busy(),
    ).toBe(false);
    expect(client.getQueryData<NotificationAttentionSnapshot>(key)).toMatchObject({
      unreadCount: 2,
      summary: { groups: 1, events: 1 },
      targets: [{ count: 0 }, { count: 1 }],
    });
    expect(client.getQueryData(foreign)).toEqual(before);
    await read?.operation.reject(Object.assign(new Error("Denied"), { status: 409 }));
    expect(client.getQueryData(key)).toEqual(before);
    const accepted = await beginNotificationItemRead(client, options, itemId);
    accepted?.operation.commit();
    expect(accepted?.operation.active).toBe(false);
    expect(client.getQueryData<NotificationAttentionSnapshot>(key)?.summary.groups).toBe(1);
  } finally {
    client.clear();
  }
});
it("does not fabricate counts without a matching owned source aggregate", async () => {
  const client = new QueryClient();
  try {
    expect(await beginNotificationItemRead(client, options, itemId)).toBeUndefined();
    const missingEffect = source();
    delete missingEffect.targets[0].readEffect;
    client.setQueryData(key, missingEffect);
    expect(await beginNotificationItemRead(client, options, itemId)).toBeUndefined();
    const empty = source();
    empty.targets[0].count = 0;
    client.setQueryData(key, empty);
    expect(await beginNotificationItemRead(client, options, itemId)).toBeUndefined();
  } finally {
    client.clear();
  }
});
