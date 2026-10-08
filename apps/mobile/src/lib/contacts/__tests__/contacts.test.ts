import type { ContactUser } from "@board-game-organizer/shared";
import { describe, expect, it } from "vitest";
import { contactSearchRows, contactSyncPayload, contactTab } from "../contacts";

describe("contactTab", () => {
  it("selects valid string and array route parameters", () => {
    expect(contactTab("requests")).toBe("requests");
    expect(contactTab(["friends", "requests"])).toBe("connections");
    expect(contactTab("blocked")).toBe("requests");
    expect(contactTab("suggestions")).toBe("search");
    expect(contactTab("search")).toBe("search");
  });

  it("falls back to connections for absent or unknown tabs", () => {
    expect(contactTab(undefined)).toBe("connections");
    expect(contactTab("unknown")).toBe("connections");
  });
});

describe("contactSearchRows", () => {
  const user = (id: string): ContactUser => ({
    id,
    name: id,
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
  });

  it("places registered contacts before unregistered device contacts after search results", () => {
    expect(
      contactSearchRows(
        [user("searched")],
        [user("registered")],
        [{ id: "device", name: "Device" }],
      ).map((row) => [row.kind, row.id]),
    ).toEqual([
      ["user", "user:searched"],
      ["device-header", "device-header"],
      ["bgo", "bgo:registered"],
      ["device", "device:device"],
    ]);
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
