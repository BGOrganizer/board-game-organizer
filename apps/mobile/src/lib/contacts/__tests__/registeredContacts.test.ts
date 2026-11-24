import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  pendingRegisteredContacts,
  scanContactIdentifiers,
  warmRegisteredContacts,
} from "../registeredContacts";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  page: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("expo-contacts", () => ({
  getPermissionsAsync: mocks.permission,
  Contact: { getAllDetails: mocks.page },
  ContactField: { EMAILS: "emails", PHONES: "phones" },
  ContactsSortOrder: { GivenName: "givenName" },
}));
vi.mock("@board-game-organizer/shared", () => ({ syncContactsWithToken: mocks.sync }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue({ granted: true });
  mocks.page.mockResolvedValue([{ emails: [{ address: "friend@example.com" }] }]);
  mocks.sync.mockResolvedValue({
    registeredIdentifiers: { emails: ["friend@example.com"], phoneNumbers: [] },
  });
});

describe("registered contacts startup sync", () => {
  it("skips address book without consent", async () => {
    mocks.permission.mockResolvedValue({ granted: false });
    expect(
      await warmRegisteredContacts(
        "denied",
        "https://api.test",
        async () => "jwt",
        () => true,
      ),
    ).toBeNull();
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("shares ongoing scan and POST, then discards transient contact data", async () => {
    const getToken = vi.fn(async () => "jwt");
    const first = warmRegisteredContacts("user", "https://api.test", getToken, () => true);
    const second = warmRegisteredContacts("user", "https://api.test", getToken, () => true);
    expect(second).toBe(first);
    expect(await first).toEqual({
      submitted: { emails: ["friend@example.com"], phoneNumbers: [] },
      registered: { emails: ["friend@example.com"], phoneNumbers: [] },
    });
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await warmRegisteredContacts("user", "https://api.test", getToken, () => true);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("stops before POST when session ends during scan", async () => {
    let active = true;
    mocks.page.mockImplementation(async () => {
      active = false;
      return [];
    });
    expect(
      await warmRegisteredContacts(
        "stale",
        "https://api.test",
        async () => null,
        () => active,
      ),
    ).toBeNull();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not read even the first contact page if a previously requested permission returns after logout", async () => {
    let active = true;
    mocks.permission.mockImplementationOnce(async () => {
      active = false;
      return { granted: true };
    });
    expect(
      await warmRegisteredContacts(
        "signed-out-after-permission",
        "https://api.test",
        async () => "jwt",
        () => active,
      ),
    ).toBeNull();
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("scans pages while independently limiting emails and phone numbers to 1000 unique identifiers", async () => {
    let offset = 0;
    mocks.page.mockImplementation(async (_fields: unknown, options: { offset: number }) => {
      offset = options.offset;
      return offset < 1200
        ? Array.from({ length: 200 }, (_, index) => ({
            emails: [{ address: `friend${offset + index}@example.com` }],
            phones: [{ number: `+1 202 ${5_550_000 + offset + index}` }],
          }))
        : [];
    });
    const identifiers = await scanContactIdentifiers();
    expect(identifiers.emails).toHaveLength(1000);
    expect(identifiers.phoneNumbers).toHaveLength(1000);
    expect(identifiers.phoneNumbers.at(0)).toBe("12025550000");
    expect(identifiers.phoneNumbers.at(-1)).toBe("12025550999");
    expect(identifiers.phoneNumbers).not.toContain("12025551000");
    expect(mocks.page).toHaveBeenCalledTimes(7);
  });

  it("clears a failed scan so the same account can retry", async () => {
    mocks.page.mockRejectedValueOnce(new Error("Address book unavailable"));
    const scan = () =>
      warmRegisteredContacts(
        "retry",
        "https://api.test",
        async () => "jwt",
        () => true,
      );
    const failedScan = scan();
    expect(pendingRegisteredContacts("retry")).toBe(failedScan);
    await expect(failedScan).rejects.toThrow("Address book unavailable");
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(pendingRegisteredContacts("retry")).toBeUndefined();
    await expect(scan()).resolves.toMatchObject({ registered: { emails: ["friend@example.com"] } });
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith(
      "https://api.test",
      ["friend@example.com"],
      [],
      null,
      expect.any(Function),
    );
  });
});
