import { act, screen, waitFor } from "@testing-library/react-native";
import { Linking, Share } from "react-native";
import { expect, it, vi } from "vitest";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  ContactsFixture,
  contactPress,
  contactsApi,
  contactsBoundary,
  contactsFixture,
  contactsReady,
  contactTab,
  fixtureJson,
  fixtureUser,
  foregroundContacts,
  inviteLink,
  renderContacts,
} from "./contactsScreenFixture";

const grant = () => {
  contactsBoundary.permission = {
    granted: true,
    status: "granted",
    canAskAgain: true,
    expires: "never",
  };
};
function devices() {
  contactsFixture.devices = [
    {
      id: "registered",
      fullName: "Registered Device Name",
      emails: [{ address: "registered@example.test" }],
    },
    {
      id: "unregistered",
      fullName: "Unregistered Friend",
      emails: [{ address: "unregistered@example.test" }],
    },
  ];
  contactsFixture.registeredEmails = ["registered@example.test"];
}
const syncWrites = () =>
  contactsFixture.writes.filter((write) => write.path === "/api/contacts/sync");
const invites = () => contactsFixture.writes.filter((write) => write.path === "/api/invites");
async function deviceTab() {
  await contactTab("device");
}
async function consent() {
  await contactPress("Add contacts");
  await contactPress("Yes");
}

it("requires explicit in-app consent before a user-triggered native request and respects cancellation", async () => {
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(screen.getByText("Allow address book access to find your friends here.")).toBeVisible();
  await contactPress("Add contacts");
  expect(
    screen.getByText("Allow Board Game Organizer to access your contacts to find your friends?"),
  ).toBeVisible();
  expect(contactsBoundary.requestPermissions).not.toHaveBeenCalled();
  await contactPress("Cancel");
  expect(contactsBoundary.requestPermissions).not.toHaveBeenCalled();
  expect(contactsBoundary.readContacts).not.toHaveBeenCalled();
  expect(syncWrites()).toHaveLength(0);
});

it("records a denied native request without opening settings or reading the address book", async () => {
  const settings = vi.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await renderContacts();
  await contactsReady();
  await deviceTab();
  await consent();
  await waitFor(() => expect(contactsBoundary.storage.get("contacts_denials")).toBe("1"));
  expect(contactsBoundary.requestPermissions).toHaveBeenCalledOnce();
  expect(settings).not.toHaveBeenCalled();
  expect(contactsBoundary.readContacts).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Add contacts" })).toBeEnabled();
});

it("opens settings after repeated denials and refreshes actual OS permission on foreground, including revocation", async () => {
  contactsBoundary.storage.set("contacts_denials", "2");
  const settings = vi.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  devices();
  await renderContacts();
  await contactsReady();
  await deviceTab();
  await consent();
  await waitFor(() => expect(settings).toHaveBeenCalledOnce());
  expect(contactsBoundary.requestPermissions).not.toHaveBeenCalled();
  grant();
  await foregroundContacts();
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
  expect(contactsBoundary.storage.has("contacts_denials")).toBe(false);
  expect(screen.queryByRole("button", { name: "Add contacts" })).toBeNull();
  contactsBoundary.permission = {
    granted: false,
    status: "denied",
    canAskAgain: false,
    expires: "never",
  };
  await foregroundContacts();
  await waitFor(() => expect(screen.queryByText("Unregistered Friend")).toBeNull());
  expect(screen.getByRole("button", { name: "Add contacts" })).toBeEnabled();
  expect(
    contactsFixture.client?.getQueryData(["device-contacts", contactsApi, "owner"]),
  ).toBeUndefined();
});

it("requests an undetermined native permission once on actual route focus and retains denial state", async () => {
  contactsBoundary.permission = {
    granted: false,
    status: "undetermined",
    canAskAgain: true,
    expires: "never",
  };
  await renderContacts();
  await contactsReady();
  await waitFor(() => expect(contactsBoundary.requestPermissions).toHaveBeenCalledOnce());
  await contactTab("search");
  await contactTab("connections");
  expect(contactsBoundary.requestPermissions).toHaveBeenCalledOnce();
  expect(contactsBoundary.readContacts).not.toHaveBeenCalled();
});

it("accepts a native grant, synchronizes identifiers only and separates registered accounts from inviteable names", async () => {
  devices();
  contactsFixture.suggestions = [
    fixtureUser({ id: "registered", name: "Registered Player", username: "registered-player" }),
  ];
  contactsBoundary.permissionOnRequest = {
    granted: true,
    status: "granted",
    canAskAgain: true,
    expires: "never",
  };
  await renderContacts();
  await contactsReady();
  await deviceTab();
  await consent();
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
  expect(screen.getByText("Registered Player")).toBeVisible();
  expect(screen.getByText("@registered-player")).toBeVisible();
  expect(screen.queryByText("Registered Device Name")).toBeNull();
  expect(syncWrites()).toHaveLength(1);
  expect(syncWrites()[0].input).toEqual({
    emails: ["registered@example.test", "unregistered@example.test"],
    phoneNumbers: [],
  });
  expect(JSON.stringify(syncWrites())).not.toContain("Unregistered Friend");
  expect(JSON.stringify(syncWrites())).not.toContain("Registered Device Name");
  expect(contactsBoundary.readContacts.mock.calls.some(([, page]) => page.limit === 200)).toBe(
    true,
  );
  expect(contactsBoundary.readContacts.mock.calls.some(([, page]) => page.limit === 40)).toBe(true);
});

it("creates the canonical invite only after the user action and shares its exact returned link", async () => {
  grant();
  devices();
  const share = vi.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  await renderContacts();
  await contactsReady();
  await deviceTab();
  await screen.findByText("Unregistered Friend");
  expect(invites()).toHaveLength(0);
  await contactPress("Send invite: Unregistered Friend");
  await waitFor(() => expect(share).toHaveBeenCalledExactlyOnceWith({ message: inviteLink }));
  expect(invites()).toHaveLength(1);
  expect(invites()[0].input).toEqual({});
});

it("disables duplicate invite generation while pending and keeps a failed invite observable/retryable", async () => {
  grant();
  devices();
  let finish: (response: Response) => void = () => {};
  contactsFixture.pendingInvite = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const share = vi.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  await renderContacts();
  await contactsReady();
  await deviceTab();
  await screen.findByText("Unregistered Friend");
  await contactPress("Send invite: Unregistered Friend");
  await waitFor(() => expect(invites()).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Send invite: Unregistered Friend" })).toBeDisabled();
  await contactPress("Send invite: Unregistered Friend");
  expect(invites()).toHaveLength(1);
  await act(() => finish(fixtureJson({ error: "Fixture invite rejected" }, 400)));
  expect(await screen.findByText("Could not create the invite. Try again.")).toBeVisible();
  expect(share).not.toHaveBeenCalled();
  contactsFixture.pendingInvite = undefined;
  await contactPress("Send invite: Unregistered Friend");
  await waitFor(() => expect(share).toHaveBeenCalledOnce());
});

it("does not turn a cancelled/failed native share sheet into a failed invite or duplicate backend write", async () => {
  grant();
  devices();
  vi.spyOn(Share, "share").mockRejectedValue(new Error("Fixture share dismissed"));
  await renderContacts();
  await contactsReady();
  await deviceTab();
  await screen.findByText("Unregistered Friend");
  await contactPress("Send invite: Unregistered Friend");
  await waitFor(() => expect(invites()).toHaveLength(1));
  expect(screen.queryByText("Could not create the invite. Try again.")).toBeNull();
});

it("retains explicit read failure diagnostics and retries a failed native address-book scan", async () => {
  grant();
  devices();
  contactsBoundary.readContacts.mockRejectedValueOnce(
    new Error("Fixture native contacts unavailable"),
  );
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(
    await screen.findByRole("button", { name: "Could not synchronize contacts. Retry" }),
  ).toBeVisible();
  expect(syncWrites()).toHaveLength(0);
  expect(contactsBoundary.report).toHaveBeenCalledWith(expect.any(Error), {
    tags: { operation: "contacts.sync", stage: "read" },
  });
  await contactPress("Could not synchronize contacts. Retry");
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
});

it("keeps a rejected sync distinct from a native read failure and retries the real sync mutation", async () => {
  grant();
  devices();
  contactsFixture.syncStatus = 503;
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(
    await screen.findByRole("button", { name: "Could not synchronize contacts. Retry" }),
  ).toBeVisible();
  expect(contactsBoundary.report).toHaveBeenCalledWith(expect.any(Error), {
    tags: { operation: "contacts.sync", stage: "request" },
  });
  contactsFixture.syncStatus = 200;
  await contactPress("Could not synchronize contacts. Retry");
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
  expect(syncWrites()).toHaveLength(2);
});

it("uses an account-owned warm sync snapshot without reuploading identifiers or scanning them again", async () => {
  grant();
  devices();
  contactsFixture.client?.setQueryData(["contact-sync", contactsApi, "owner"], {
    submitted: {
      emails: ["registered@example.test", "unregistered@example.test"],
      phoneNumbers: [],
    },
    registered: { emails: ["registered@example.test"], phoneNumbers: [] },
  });
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
  expect(syncWrites()).toHaveLength(0);
  expect(contactsBoundary.readContacts.mock.calls.every(([, page]) => page.limit === 40)).toBe(
    true,
  );
});

it("backfills a native page containing no eligible invitees before publishing an empty result", async () => {
  grant();
  contactsFixture.devices = Array.from({ length: 41 }, (_, index) => ({
    id: `device-${index}`,
    fullName: `Device ${index + 1}`,
    emails: [{ address: `device${index}@example.test` }],
  }));
  contactsFixture.registeredEmails = contactsFixture.devices
    .slice(0, 40)
    .map((row) => row.emails[0].address);
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(await screen.findByText("Device 41")).toBeVisible();
  expect(screen.queryByText("Device 1")).toBeNull();
  expect(screen.queryByText("No contacts to invite")).toBeNull();
  expect(
    contactsBoundary.readContacts.mock.calls.some(
      ([, page]) => page.limit === 40 && page.offset === 40,
    ),
  ).toBe(true);
});

it("loads the next local contact page only after actual native list geometry reaches its end", async () => {
  grant();
  contactsFixture.devices = Array.from({ length: 41 }, (_, index) => ({
    id: `device-${index}`,
    fullName: `Device ${index + 1}`,
    emails: [{ address: `device${index}@example.test` }],
  }));
  await renderContacts();
  await contactsReady();
  await deviceTab();
  const first = await screen.findByRole("button", { name: "Send invite: Device 1" });
  expect(screen.queryByText("Device 41")).toBeNull();
  let list: typeof first | null = first;
  while (list && typeof list.props.onScroll !== "function") list = list.parent;
  if (!list) throw new Error("Expected the real native contact-list scroll host");
  await scrollNativeListToEnd(list, 2000);
  await waitFor(() =>
    expect(
      contactsBoundary.readContacts.mock.calls.some(
        ([, page]) => page.limit === 40 && page.offset === 40,
      ),
    ).toBe(true),
  );
  expect(
    contactsFixture.client?.getQueryData(["contact-sync", contactsApi, "owner"]),
  ).toBeDefined();
  expect(syncWrites()).toHaveLength(1);
});

it("keeps a failed native display page observable and retries it through an explicit resynchronization", async () => {
  grant();
  devices();
  contactsBoundary.readContacts.mockImplementation(
    async (_fields, page: { limit: number; offset: number }) => {
      if (page.limit === 40) throw new Error("Fixture native page unavailable");
      return contactsFixture.devices.slice(page.offset, page.offset + page.limit);
    },
  );
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(
    await screen.findByRole("button", { name: "Could not synchronize contacts. Retry" }),
  ).toBeVisible();
  expect(contactsBoundary.report).toHaveBeenCalledWith(expect.any(Error), {
    tags: { operation: "contacts.page" },
  });
  contactsBoundary.readContacts.mockImplementation(
    async (_fields, page: { limit: number; offset: number }) =>
      contactsFixture.devices.slice(page.offset, page.offset + page.limit),
  );
  await contactPress("Could not synchronize contacts. Retry");
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
});

it("shows a genuine exhausted empty device list without offering invitations or fabricating matches", async () => {
  grant();
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(await screen.findByText("No contacts to invite")).toBeVisible();
  expect(screen.queryByRole("button", { name: /^Send invite:/ })).toBeNull();
});

it("ignores a late native address-book result after the authenticated screen owner changes", async () => {
  grant();
  devices();
  let finish: (value: typeof contactsFixture.devices) => void = () => {};
  contactsBoundary.readContacts.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await renderContacts();
  await contactsReady();
  await waitFor(() => expect(contactsBoundary.readContacts).toHaveBeenCalled());
  contactsBoundary.userId = "other-owner";
  contactsBoundary.permission = {
    granted: false,
    status: "denied",
    canAskAgain: false,
    expires: "never",
  };
  await view.rerender(<ContactsFixture />);
  await act(() => finish(contactsFixture.devices));
  await deviceTab();
  expect(screen.queryByText("Unregistered Friend")).toBeNull();
  expect(screen.getByRole("button", { name: "Add contacts" })).toBeEnabled();
  expect(syncWrites()).toHaveLength(0);
});

const privateContactReads = () =>
  contactsFixture.reads.filter(
    (url) => url.pathname === "/api/relationships" || url.pathname === "/api/users/suggestions",
  );

it("keeps private contacts unread during pending auth, rejected token recovery and sign-out", async () => {
  contactsBoundary.authLoaded = false;
  contactsBoundary.getToken.mockRejectedValue(new Error("Session did not refresh"));
  const view = await renderContacts();
  expect(contactsBoundary.getToken).not.toHaveBeenCalled();
  expect(privateContactReads()).toEqual([]);

  contactsBoundary.authLoaded = true;
  await view.rerender(<ContactsFixture />);
  await waitFor(() => expect(contactsBoundary.getToken).toHaveBeenCalled());
  expect(privateContactReads()).toEqual([]);

  contactsBoundary.signedIn = false;
  await view.rerender(<ContactsFixture />);
  expect(privateContactReads()).toEqual([]);
});

it("drops a late token issued to a session that signed out during authentication", async () => {
  let finish: (token: string) => void = () => {};
  const pendingToken = new Promise<string>((resolve) => {
    finish = resolve;
  });
  contactsBoundary.getToken.mockImplementation(() => pendingToken);
  const view = await renderContacts();
  await waitFor(() => expect(contactsBoundary.getToken).toHaveBeenCalled());
  contactsBoundary.signedIn = false;
  await view.rerender(<ContactsFixture />);
  await act(() => finish("late-former-owner-token"));
  expect(privateContactReads()).toEqual([]);
  expect(contactsFixture.writes.filter(({ path }) => path === "/api/users/presence")).toEqual([]);
});

it("reuses native permission granted while the in-app consent prompt was open", async () => {
  devices();
  await renderContacts();
  await contactsReady();
  await deviceTab();
  await contactPress("Add contacts");
  grant();
  await contactPress("Yes");
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
  expect(contactsBoundary.requestPermissions).not.toHaveBeenCalled();
  expect(syncWrites()).toHaveLength(1);
});

it("waits for the same owner's in-flight startup synchronization instead of scanning or sending twice", async () => {
  grant();
  devices();
  let finish: (value: Response) => void = () => {};
  contactsFixture.pendingSync = new Promise((resolve) => {
    finish = resolve;
  });
  const { warmRegisteredContacts } = await import("@/lib/contacts/registeredContacts");
  const warming = warmRegisteredContacts(
    "owner",
    contactsApi,
    async () => "fixture-session-token",
    () => true,
  );
  await waitFor(() => expect(syncWrites()).toHaveLength(1));
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(screen.queryByText("Unregistered Friend")).toBeNull();
  await act(async () => {
    finish(
      fixtureJson({
        stored: 1,
        users: [],
        registeredIdentifiers: { emails: contactsFixture.registeredEmails, phoneNumbers: [] },
      }),
    );
    await warming;
  });
  expect(await screen.findByText("Unregistered Friend")).toBeVisible();
  expect(syncWrites()).toHaveLength(1);
  expect(
    contactsBoundary.readContacts.mock.calls.filter(([, page]) => page.limit === 200),
  ).toHaveLength(1);
});

it("drops a late address-book synchronization receipt after the current owner has changed", async () => {
  grant();
  devices();
  let finish: (value: Response) => void = () => {};
  contactsFixture.pendingSync = new Promise((resolve) => {
    finish = resolve;
  });
  const view = await renderContacts();
  await contactsReady();
  await waitFor(() => expect(syncWrites()).toHaveLength(1));
  contactsBoundary.userId = "different-owner";
  contactsBoundary.permission = {
    granted: false,
    status: "denied",
    canAskAgain: false,
    expires: "never",
  };
  await view.rerender(<ContactsFixture />);
  await act(() =>
    finish(
      fixtureJson({
        stored: 1,
        users: [],
        registeredIdentifiers: { emails: contactsFixture.registeredEmails, phoneNumbers: [] },
      }),
    ),
  );
  await deviceTab();
  expect(screen.getByRole("button", { name: "Add contacts" })).toBeEnabled();
  expect(screen.queryByText("Unregistered Friend")).toBeNull();
  expect(
    contactsFixture.client?.getQueryData(["contact-sync", contactsApi, "different-owner"]),
  ).toBeUndefined();
  expect(syncWrites()).toHaveLength(1);
});

it("keeps a failed first page of registered suggestions distinct from an exhausted address book", async () => {
  grant();
  contactsFixture.suggestionsStatus = 503;
  await renderContacts();
  await contactsReady();
  await deviceTab();
  expect(await screen.findByText("Could not load contacts")).toBeVisible();
  expect(screen.queryByText("No contacts to invite")).toBeNull();
});

it("retries failed server suggestions only on the explicit control and retains the first page", async () => {
  contactsFixture.suggestions = [
    fixtureUser({ id: "first-match", name: "First matched contact", username: "first-match" }),
  ];
  contactsFixture.nextSuggestions = [
    fixtureUser({ id: "second-match", name: "Next matched contact", username: "second-match" }),
  ];
  contactsFixture.suggestionsCursor = "next-contacts";
  contactsFixture.nextSuggestionsStatus = 503;
  await renderContacts();
  await contactsReady();
  await deviceTab();
  const first = await screen.findByText("First matched contact");
  let list: typeof first | null = first;
  while (list && typeof list.props.onScroll !== "function") list = list.parent;
  if (!list) throw new Error("Expected the real server-suggestion scroll host");
  const laterPages = () =>
    contactsFixture.reads.filter(
      (url) =>
        url.pathname === "/api/users/suggestions" &&
        url.searchParams.get("cursor") === "next-contacts",
    );
  expect(screen.queryByText("Next matched contact")).toBeNull();
  await scrollNativeListToEnd(list);
  expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
  expect(first).toBeVisible();
  expect(laterPages()).toHaveLength(1);
  await scrollNativeListToEnd(list, 1300);
  expect(laterPages()).toHaveLength(1);
  contactsFixture.nextSuggestionsStatus = 200;
  await contactPress("Retry");
  expect(await screen.findByText("Next matched contact")).toBeVisible();
  expect(first).toBeVisible();
  expect(laterPages()).toHaveLength(2);
});
