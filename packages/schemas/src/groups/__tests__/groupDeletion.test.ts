import { describe, expect, it } from "vitest";
import { deleteGroupRecordSchema } from "../dto/groupRecords";

describe("explicit versioned Group cascade deletion", () => {
  it("requires current numeric version and explicit Event deletion consent, rejecting extra fields", () => {
    expect(deleteGroupRecordSchema.parse({ version: 1, deleteEvents: true })).toEqual({
      version: 1,
      deleteEvents: true,
    });
    for (const value of [
      undefined,
      null,
      {},
      { version: 1 },
      { version: 1, deleteEvents: false },
      { version: 0, deleteEvents: true },
      { version: -1, deleteEvents: true },
      { version: 1.5, deleteEvents: true },
      { version: "1", deleteEvents: true },
      { version: Number.NaN, deleteEvents: true },
      { version: Infinity, deleteEvents: true },
      { version: 1, deleteEvents: true, preserveHistory: true },
    ])
      expect(deleteGroupRecordSchema.safeParse(value).success).toBe(false);
  });
});
