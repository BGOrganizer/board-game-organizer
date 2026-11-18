import type { ClientSession, Db } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactLinksRepository } from "../contacts.repository";

const now = new Date("2030-06-01T10:00:00.000Z");
const session = { id: "contact-sync-session" } as unknown as ClientSession;

function setup() {
  const cursor = { toArray: vi.fn(async (): Promise<{ contactClerkId: string }[]> => []) };
  const collection = {
    deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
    insertMany: vi.fn(async () => ({ acknowledged: true, insertedCount: 2 })),
    find: vi.fn(() => cursor),
  };
  const db = { collection: vi.fn(() => collection) };
  const repository = new ContactLinksRepository(db as unknown as Db);
  return { repository, db, collection, cursor };
}

describe("ContactLinksRepository with the MongoDB boundary mocked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it("replaces only the owner's matched contacts using the same transaction session", async () => {
    const { repository, db, collection } = setup();
    const matches = [
      { contactClerkId: "registered-a", email: "a@example.test" },
      { contactClerkId: "registered-b", email: "b@example.test" },
    ];
    await expect(repository.replaceForUser("owner", matches, session)).resolves.toBe(2);
    expect(db.collection).toHaveBeenCalledWith("contactLinks");
    expect(collection.deleteMany).toHaveBeenCalledExactlyOnceWith({ userId: "owner" }, { session });
    expect(collection.insertMany).toHaveBeenCalledExactlyOnceWith(
      matches.map((match) => ({ ...match, userId: "owner", createdAt: now })),
      { session },
    );
    expect(matches[0]).toEqual({ contactClerkId: "registered-a", email: "a@example.test" });
  });

  it("waits for the delete receipt before inserting on the shared MongoDB session", async () => {
    const { repository, collection } = setup();
    let finishDelete: (receipt: { deletedCount: number }) => void = () => {};
    collection.deleteMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelete = resolve;
        }),
    );
    const replacement = repository.replaceForUser(
      "owner",
      [{ contactClerkId: "registered-a", email: "a@example.test" }],
      session,
    );
    expect(collection.deleteMany).toHaveBeenCalledOnce();
    expect(collection.insertMany).not.toHaveBeenCalled();
    finishDelete({ deletedCount: 1 });
    await expect(replacement).resolves.toBe(1);
    expect(collection.insertMany).toHaveBeenCalledOnce();
  });

  it("removes stale links for an empty replacement without attempting an empty insert", async () => {
    const { repository, collection } = setup();
    await expect(repository.replaceForUser("owner", [], session)).resolves.toBe(0);
    expect(collection.deleteMany).toHaveBeenCalledWith({ userId: "owner" }, { session });
    expect(collection.insertMany).not.toHaveBeenCalled();
  });

  it("preserves a deletion failure and never follows it with an insert", async () => {
    const { repository, collection } = setup();
    const failure = new Error("Fixture transaction unavailable");
    collection.deleteMany.mockRejectedValueOnce(failure);
    await expect(repository.replaceForUser("owner", [], session)).rejects.toBe(failure);
    expect(collection.insertMany).not.toHaveBeenCalled();
  });

  it("propagates an insertion failure so the caller can abort its transaction", async () => {
    const { repository, collection } = setup();
    const failure = new Error("Fixture insert rejected");
    collection.insertMany.mockRejectedValueOnce(failure);
    await expect(
      repository.replaceForUser(
        "owner",
        [{ contactClerkId: "registered-a", email: "a@example.test" }],
        session,
      ),
    ).rejects.toBe(failure);
    expect(collection.deleteMany).toHaveBeenCalledOnce();
  });

  it.each([
    { rows: [] },
    { rows: [{ contactClerkId: "registered-a" }, { contactClerkId: "registered-b" }] },
  ])("reads only the owner's projected registered IDs ($rows)", async ({ rows }) => {
    const { repository, collection, cursor } = setup();
    cursor.toArray.mockResolvedValueOnce(rows);
    await expect(repository.contactClerkIdsForUser("owner")).resolves.toEqual(
      rows.map((row) => row.contactClerkId),
    );
    expect(collection.find).toHaveBeenCalledExactlyOnceWith(
      { userId: "owner" },
      { projection: { contactClerkId: 1 } },
    );
    expect(cursor.toArray).toHaveBeenCalledOnce();
    expect(collection.deleteMany).not.toHaveBeenCalled();
    expect(collection.insertMany).not.toHaveBeenCalled();
  });

  it("keeps a failed contact read observable instead of returning an empty list", async () => {
    const { repository, cursor } = setup();
    const failure = new Error("Fixture contact read unavailable");
    cursor.toArray.mockRejectedValueOnce(failure);
    await expect(repository.contactClerkIdsForUser("owner")).rejects.toBe(failure);
  });
});
