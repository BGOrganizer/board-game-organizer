import { COMMUNITY_NOTIFICATION_KINDS, type Notification } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { localizedNotificationText, notificationCopy } from "../notification-copy";

const base = {
  kind: "friend_request",
  title: "Historical title",
  description: "Original body",
  copy: { actorName: "Nome storico" },
} satisfies Pick<Notification, "kind" | "title" | "description" | "copy">;

describe("notification language", () => {
  it.each(COMMUNITY_NOTIFICATION_KINDS)(
    "keeps both translations and frozen resource identity for %s",
    (kind) => {
      for (const locale of ["en", "it"] as const) {
        const copy = notificationCopy(kind, locale, "Actor", "Original event");
        expect(copy.title.length).toBeGreaterThan(0);
        expect(copy.description).toBe("Actor: Original event");
        expect(copy.href).toBe(
          kind.startsWith("group_") || kind.startsWith("organization_") ? "/groups" : "/events",
        );
      }
    },
  );
  it("handles absent resources and rejects unsupported kinds", () => {
    expect(notificationCopy("table_invitation", "it", "Actor").description).toBe("Actor: ");
    expect(() => notificationCopy("unsupported" as never, "en", "Actor")).toThrow(
      "Unsupported notification kind",
    );
    expect(() => notificationCopy("unsupported" as never, "it", "Actor")).toThrow(
      "Unsupported notification kind",
    );
  });
  it("renders the recipient/device locale, never the actor locale or changed profile name", () => {
    expect(localizedNotificationText(base, "it")).toEqual({
      title: "Nuova richiesta di amicizia",
      description: "Nome storico ti ha inviato una richiesta di amicizia.",
    });
    expect(localizedNotificationText(base, "en")).toEqual({
      title: "New friend request",
      description: "Nome storico sent you a friend request.",
    });
    expect(base.title).toBe("Historical title");
  });
  it("preserves legacy text without guessing names or rewriting historical notifications", () => {
    expect(localizedNotificationText(base)).toEqual({
      title: base.title,
      description: base.description,
    });
    expect(localizedNotificationText({ ...base, copy: undefined }, "it")).toEqual({
      title: base.title,
      description: base.description,
    });
  });
});
