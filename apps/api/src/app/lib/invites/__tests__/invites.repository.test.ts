import { INVITE_TTL_DAYS } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { InvitesRepository } from "@/app/lib/invites/invites.repository";

const dbMock = {
  collection: vi.fn(),
};
// collection() must return the SAME object so repo methods share one mock.
const colMock = {
  insertOne: vi.fn(async (_doc: unknown) => ({ insertedId: "id" })),
  findOne: vi.fn(async () => null),
  find: vi.fn(() => ({
    sort: vi.fn(() => ({ limit: vi.fn(() => ({ toArray: async () => [] })) })),
  })),
  findOneAndUpdate: vi.fn<(filter: unknown) => unknown>(async () => null),
  updateMany: vi.fn(async () => ({ modifiedCount: 0 })),
};
dbMock.collection.mockReturnValue(colMock);

function repo() {
  return new InvitesRepository(dbMock as never);
}

describe("InvitesRepository", () => {
  it("generates URL-safe unique tokens", () => {
    const a = InvitesRepository.generateToken();
    const b = InvitesRepository.generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });

  it("ttl is 7 days", () => {
    expect(InvitesRepository.ttlMs()).toBe(INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it("creates a pending invite with expiry = now + ttl", async () => {
    const before = Date.now();
    const invite = await repo().create("inviter_1");
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(invite.status).toBe("pending");
    expect(invite.inviterUserId).toBe("inviter_1");
    expect(invite.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      INVITE_TTL_DAYS * 24 * 60 * 60 * 1000 - 1,
    );
  });

  it("stores the optional target email", async () => {
    const invite = await repo().create("inviter_1", "friend@example.com");
    expect(invite.email).toBe("friend@example.com");
  });

  it("stores contextual Table scope without allocating any registration", async () => {
    const tableId = "33333333-3333-4333-8333-333333333333";
    const invite = await repo().create("inviter_1", undefined, tableId);
    expect(invite.tableId).toBe(tableId);
    expect(invite.email).toBeUndefined();
    expect(invite.tableReceipt).toBeUndefined();
  });

  it("stores the immutable Table receipt with token consumption in the same session", async () => {
    const tableReceipt = {
      groupId: "11111111-1111-4111-8111-111111111111",
      eventId: "22222222-2222-4222-8222-222222222222",
      tableId: "33333333-3333-4333-8333-333333333333",
      position: "WAITING" as const,
    };
    const session = {};
    const result = { token: "receipt-token", status: "claimed", tableReceipt };
    colMock.findOneAndUpdate.mockResolvedValueOnce(result);
    expect(
      await new InvitesRepository(dbMock as never, session as never).claim(
        "receipt-token",
        "claimer",
        tableReceipt,
      ),
    ).toEqual(result);
    expect(colMock.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: "receipt-token", status: "pending" }),
      { $set: expect.objectContaining({ tableReceipt, claimedByUserId: "claimer" }) },
      { returnDocument: "after", session },
    );
  });

  it("claim transitions pending → claimed with claimant", async () => {
    const fakeInvite = {
      token: "tok",
      status: "claimed" as const,
      claimedByUserId: "claimer",
      claimedAt: new Date(),
    };
    const col = dbMock.collection();
    col.findOneAndUpdate.mockResolvedValueOnce(fakeInvite);
    const result = await repo().claim("tok", "claimer");
    expect(result).toEqual(fakeInvite);
    // Only pending, non-expired invites are claimable.
    expect(colMock.findOneAndUpdate.mock.lastCall?.[0]).toMatchObject({
      token: "tok",
      status: "pending",
      expiresAt: { $gt: expect.any(Date) },
    });
  });
});

it("looks up only the exact token", async () => {
  expect(await repo().findByToken("one-owned-token")).toBeNull();
  expect(colMock.findOne).toHaveBeenLastCalledWith({ token: "one-owned-token" }, {});
});
it("bounds an inviter's newest links before returning them", async () => {
  expect(await repo().listByInviter("inviter_1")).toEqual([]);
  expect(colMock.find).toHaveBeenLastCalledWith(
    { inviterUserId: "inviter_1" },
    { projection: { _id: 0 } },
  );
});
it("expires only stale pending links", async () => {
  expect(await repo().expireStale()).toBe(0);
  expect(colMock.updateMany).toHaveBeenLastCalledWith(
    { status: "pending", expiresAt: { $lte: expect.any(Date) } },
    { $set: { status: "expired" } },
    {},
  );
});
