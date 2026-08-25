import { INVITE_TTL_DAYS } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { InvitesRepository } from "@/app/lib/invites.repository";

const dbMock = {
  collection: vi.fn(),
};
// collection() must return the SAME object so repo methods share one mock.
const colMock = {
  insertOne: vi.fn(async (doc: unknown) => ({ insertedId: "id" })),
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
    expect(colMock.findOneAndUpdate.mock.calls[0][0]).toMatchObject({
      token: "tok",
      status: "pending",
      expiresAt: { $gt: expect.any(Date) },
    });
  });
});
