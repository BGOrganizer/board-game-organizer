import { describe, expect, it, vi } from "vitest";
import { enrichRelationshipsWithUsers } from "../enrichUsers";

function fakeDb(users: Array<Record<string, unknown>>) {
  return {
    collection: vi.fn(() => ({
      find: vi.fn(() => ({
        toArray: async () => users,
      })),
    })),
  };
}

describe("enrichRelationshipsWithUsers", () => {
  it("attaches local user profiles (with presence) to relationship rows", async () => {
    const db = fakeDb([
      {
        clerkId: "user_2",
        name: "Bob",
        email: "bob@bgo.it",
        avatarUrl: null,
        presence: { online: true, lastActiveAt: new Date() },
      },
    ]);
    const rows = await enrichRelationshipsWithUsers(
      db as never,
      [{ fromUserId: "user_1", toUserId: "user_2" }],
      "user_1",
    );
    expect(rows[0].profile).toMatchObject({
      id: "user_2",
      name: "Bob",
      presence: { online: true },
    });
  });

  it("returns null profile when the user is not mirrored yet", async () => {
    const db = fakeDb([]);
    const rows = await enrichRelationshipsWithUsers(
      db as never,
      [{ fromUserId: "user_1", toUserId: "ghost" }],
      "user_1",
    );
    expect(rows[0].profile).toBeNull();
  });
});
