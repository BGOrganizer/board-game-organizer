import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../db";
import { migrate } from "../migrate";

function fakeDb(options?: { empty?: boolean; rejectSetup?: boolean }) {
  const createIndex = vi.fn(async () => "index");
  const bulkWrite = vi.fn(async () => ({ modifiedCount: 2 }));
  const users = {
    createIndex,
    find: vi.fn(() => ({
      toArray: vi.fn(async () =>
        options?.empty
          ? []
          : [
              { _id: "valid", mobileNumber: "+39 333 123 4567" },
              { _id: "invalid", mobileNumber: "not a phone" },
            ],
      ),
    })),
    bulkWrite,
  };
  const relationships = {
    createIndex,
    drop: options?.rejectSetup
      ? vi.fn(async () => {
          throw new Error("missing");
        })
      : vi.fn(async () => true),
  };
  const other = { createIndex };
  const db = {
    createCollection: options?.rejectSetup
      ? vi.fn(async () => {
          throw new Error("exists");
        })
      : vi.fn(async () => undefined),
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return users;
      if (name === COLLECTIONS.RELATIONSHIPS) return relationships;
      return other;
    }),
  };
  return { db, users, bulkWrite };
}

describe("migrate", () => {
  it("creates indexes and normalizes existing phone values", async () => {
    const { db, bulkWrite } = fakeDb();

    const result = await migrate(db as never);

    expect(result.droppedLegacyRelationships).toBe(true);
    expect(result.created).toContain('users:{"mobileNumberNormalized":1}');
    expect(bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: "valid" },
          update: { $set: { mobileNumberNormalized: "393331234567" } },
        },
      },
      {
        updateOne: {
          filter: { _id: "invalid" },
          update: { $unset: { mobileNumberNormalized: "" } },
        },
      },
    ]);
  });

  it("tolerates existing collections and a missing legacy collection", async () => {
    const { db, bulkWrite } = fakeDb({ empty: true, rejectSetup: true });

    const result = await migrate(db as never);

    expect(result.droppedLegacyRelationships).toBe(false);
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
