import { describe, expect, it } from "vitest";
import { contactSyncPayload, contactTab } from "../contacts";

describe("contactTab", () => {
  it("selects valid string and array route parameters", () => {
    expect(contactTab("requests")).toBe("requests");
    expect(contactTab(["friends", "requests"])).toBe("friends");
  });

  it("falls back to following for absent or unknown tabs", () => {
    expect(contactTab(undefined)).toBe("following");
    expect(contactTab("unknown")).toBe("following");
  });
});

describe("contactSyncPayload", () => {
  it("collects unique emails and phone representations", () => {
    expect(
      contactSyncPayload([
        {
          emails: [
            { address: " User@Example.com " },
            { address: "not-an-email" },
            { address: null },
          ],
          phones: [{ number: " +39 333 123 4567 " }],
        },
        {
          emails: [{ address: "user@example.com" }],
          phones: [{ number: "+39 333 123 4567" }],
        },
        { emails: null, phones: null },
        { phones: [{}] },
        {},
      ]),
    ).toEqual({
      emails: ["user@example.com"],
      phoneNumbers: ["393331234567"],
    });
  });

  it("limits each payload list to API bounds", () => {
    const contacts = Array.from({ length: 1001 }, (_, index) => ({
      emails: [{ address: `user${index}@example.com` }],
      phones: [{ number: `+39${String(index).padStart(10, "0")}` }],
    }));

    const payload = contactSyncPayload(contacts);
    expect(payload.emails).toHaveLength(1000);
    expect(payload.phoneNumbers).toHaveLength(1000);
  });
});
