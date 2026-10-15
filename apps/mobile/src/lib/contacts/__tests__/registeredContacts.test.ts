import { beforeEach, describe, expect, it, vi } from "vitest";
import { scanContactIdentifiers, warmRegisteredContacts } from "../registeredContacts";

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

  it("scans pages without sending more than 1000 identifiers", async () => {
    let offset = 0;
    mocks.page.mockImplementation(async (_fields: unknown, options: { offset: number }) => {
      offset = options.offset;
      return offset < 1200
        ? Array.from({ length: 200 }, (_, index) => ({
            emails: [{ address: `friend${offset + index}@example.com` }],
          }))
        : [];
    });
    const identifiers = await scanContactIdentifiers();
    expect(identifiers.emails).toHaveLength(1000);
    expect(mocks.page).toHaveBeenCalledTimes(7);
  });
});
