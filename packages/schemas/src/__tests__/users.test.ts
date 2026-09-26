import { describe, expect, it } from "vitest";
import {
  getMobileNumber,
  MOBILE_NUMBER_METADATA_KEY,
  normalizePhoneNumberForMatching,
  USER_INDEXES,
} from "../index";

describe("mobile number metadata", () => {
  it("reads and trims a non-empty custom value", () => {
    expect(getMobileNumber({ [MOBILE_NUMBER_METADATA_KEY]: " +39 123 456 " })).toBe("+39 123 456");
  });

  it("rejects missing, empty, and non-string values without phone-format validation", () => {
    expect(getMobileNumber(null)).toBeUndefined();
    expect(getMobileNumber("+39123")).toBeUndefined();
    expect(getMobileNumber([])).toBeUndefined();
    expect(getMobileNumber({ mobileNumber: 123 })).toBeUndefined();
    expect(getMobileNumber({ mobileNumber: "   " })).toBeUndefined();
    expect(getMobileNumber({ mobileNumber: "not a formatted phone" })).toBe(
      "not a formatted phone",
    );
  });

  it("creates a conservative best-effort phone lookup key", () => {
    expect(normalizePhoneNumberForMatching("+39 333 123 4567")).toBe("393331234567");
    expect(normalizePhoneNumberForMatching("0039 333 123 4567")).toBe("393331234567");
    expect(normalizePhoneNumberForMatching("333-123-4567")).toBe("3331234567");
    expect(normalizePhoneNumberForMatching(null)).toBeUndefined();
    expect(normalizePhoneNumberForMatching("123456")).toBeUndefined();
    expect(normalizePhoneNumberForMatching("1".repeat(16))).toBeUndefined();
  });

  it("indexes normalized phone lookups", () => {
    expect(USER_INDEXES).toHaveLength(4);
    expect(USER_INDEXES).toContainEqual({ key: { mobileNumberNormalized: 1 } });
  });
});
