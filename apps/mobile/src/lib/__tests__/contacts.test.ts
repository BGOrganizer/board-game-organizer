import { describe, expect, it } from "vitest";
import { contactSyncPayload } from "../contacts";

describe("contactSyncPayload", () => {
  it("collects unique emails and phone representations", () => {
    expect(
      contactSyncPayload([
        {
          emails: [{ email: " User@Example.com " }, { email: "not-an-email" }, { email: null }],
          phoneNumbers: [{ digits: "393331234567", number: " +39 333 123 4567 " }],
        },
        {
          emails: [{ email: "user@example.com" }],
          phoneNumbers: [{ digits: "393331234567" }],
        },
        { emails: null, phoneNumbers: null },
        { phoneNumbers: [{}] },
        {},
      ]),
    ).toEqual({
      emails: ["user@example.com"],
      phoneNumbers: ["393331234567"],
    });
  });

  it("limits each payload list to API bounds", () => {
    const contacts = Array.from({ length: 1001 }, (_, index) => ({
      emails: [{ email: `user${index}@example.com` }],
      phoneNumbers: [{ number: `+39${String(index).padStart(10, "0")}` }],
    }));

    const payload = contactSyncPayload(contacts);
    expect(payload.emails).toHaveLength(1000);
    expect(payload.phoneNumbers).toHaveLength(1000);
  });
});
