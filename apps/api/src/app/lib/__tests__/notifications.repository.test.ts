import type { NotificationKind } from "@board-game-organizer/schemas";
import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { NotificationsRepository, notificationCopy } from "../notifications.repository";

const cases: Array<{
  kind: NotificationKind;
  enTitle: string;
  itTitle: string;
  href: string;
}> = [
  {
    kind: "friend_request",
    enTitle: "New friend request",
    itTitle: "Nuova richiesta di amicizia",
    href: "/contacts",
  },
  {
    kind: "friend_request_accepted",
    enTitle: "Friend request accepted",
    itTitle: "Richiesta di amicizia accettata",
    href: "/contacts",
  },
  {
    kind: "match_invitation",
    enTitle: "New match invitation",
    itTitle: "Nuovo invito a una partita",
    href: "/matches",
  },
  {
    kind: "match_invitation_accepted",
    enTitle: "Match invitation accepted",
    itTitle: "Invito alla partita accettato",
    href: "/matches",
  },
  {
    kind: "match_invitation_declined",
    enTitle: "Match invitation declined",
    itTitle: "Invito alla partita rifiutato",
    href: "/matches",
  },
  {
    kind: "match_updated",
    enTitle: "Match updated",
    itTitle: "Partita aggiornata",
    href: "/matches",
  },
];

describe("notificationCopy", () => {
  it.each(cases)("creates English $kind copy", ({ kind, enTitle, href }) => {
    expect(notificationCopy(kind, "en", "Alex", "Catan")).toMatchObject({
      title: enTitle,
      href,
    });
  });

  it.each(cases)("creates Italian $kind copy", ({ kind, itTitle, href }) => {
    expect(notificationCopy(kind, "it", "Alex", "Catan")).toMatchObject({
      title: itTitle,
      href,
    });
  });

  it("includes actor and match names in descriptions", () => {
    expect(notificationCopy("friend_request", "en", "Alex").description).toContain("Alex");
    expect(notificationCopy("match_updated", "it", "Alex", "Catan").description).toContain("Catan");
  });

  it("skips empty or unresolved event batches and bulk-inserts resolved events", async () => {
    const insertMany = vi.fn(async () => ({
      insertedIds: { 0: new ObjectId("0123456789abcdef01234567") },
    }));
    const find = vi.fn(() => ({
      toArray: vi.fn(async () => [
        { clerkId: "actor", name: "Alex", preferredLanguage: "en" },
        { clerkId: "recipient", name: "Sam", preferredLanguage: "it" },
      ]),
    }));
    const db = {
      collection: vi.fn((name: string) => (name === "users" ? { find } : { insertMany })),
    };
    const createdIds: ObjectId[] = [];
    const repository = new NotificationsRepository(db as never, undefined, createdIds);

    await expect(repository.notifyMany([])).resolves.toEqual([]);
    await expect(
      repository.notify({
        kind: "friend_request",
        recipientUserId: "recipient",
        actorUserId: "actor",
      }),
    ).resolves.toEqual(new ObjectId("0123456789abcdef01234567"));
    expect(insertMany).toHaveBeenCalledOnce();
    expect(createdIds).toEqual([new ObjectId("0123456789abcdef01234567")]);

    find.mockReturnValueOnce({ toArray: vi.fn(async () => []) });
    await expect(
      repository.notify({
        kind: "friend_request",
        recipientUserId: "missing",
        actorUserId: "actor",
      }),
    ).resolves.toBeNull();
    expect(insertMany).toHaveBeenCalledOnce();
  });
});
