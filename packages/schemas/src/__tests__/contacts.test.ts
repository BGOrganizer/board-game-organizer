import { describe, expect, it } from "vitest";
import { syncContactsSchema } from "../index";

describe("syncContactsSchema", () => {
  it("accepts email and unverified phone contact values", () => {
    expect(
      syncContactsSchema.parse({
        emails: ["friend@example.com"],
        phoneNumbers: ["+39 333 123 4567", "not formatted"],
      }),
    ).toEqual({
      emails: ["friend@example.com"],
      phoneNumbers: ["+39 333 123 4567", "not formatted"],
    });
  });

  it("defaults missing contact lists", () => {
    expect(syncContactsSchema.parse({})).toEqual({ emails: [], phoneNumbers: [] });
  });

  it("rejects invalid or oversized contact values", () => {
    expect(syncContactsSchema.safeParse({ emails: ["invalid"] }).success).toBe(false);
    expect(syncContactsSchema.safeParse({ phoneNumbers: ["1".repeat(65)] }).success).toBe(false);
    expect(
      syncContactsSchema.safeParse({ phoneNumbers: Array.from({ length: 1001 }, () => "1234567") })
        .success,
    ).toBe(false);
  });
});
