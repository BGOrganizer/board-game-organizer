import type { ContactUser, RelationshipRow } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type EffectCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { afterEach, beforeEach, vi } from "vitest";
import ContactsScreen from "@/app/(tabs)/contacts";
import { NativeTestProviders } from "@/test/NativeTestProviders";

const contactsBoundary = vi.hoisted(() => ({
  userId: "owner",
  authLoaded: true,
  signedIn: true,
  focused: true,
  token: "fixture-session-token" as string | null,
  parameter: undefined as string | undefined,
  getToken: vi.fn(),
  push: vi.fn(),
  setParams: vi.fn(),
  permission: { granted: false, status: "denied", canAskAgain: true, expires: "never" },
  permissionOnRequest: { granted: false, status: "denied", canAskAgain: true, expires: "never" },
  permissions: vi.fn(),
  requestPermissions: vi.fn(),
  readContacts: vi.fn(),
  storage: new Map<string, string>(),
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  report: vi.fn(),
}));

export { contactsBoundary };

vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId:
      contactsBoundary.authLoaded && contactsBoundary.signedIn ? contactsBoundary.userId : null,
    sessionId:
      contactsBoundary.authLoaded && contactsBoundary.signedIn
        ? `session-${contactsBoundary.userId}`
        : null,
    isLoaded: contactsBoundary.authLoaded,
    isSignedIn: contactsBoundary.signedIn,
    getToken: contactsBoundary.getToken,
  }),
}));
const router = {
  push: contactsBoundary.push,
  setParams: (value: { tab?: string }) => {
    contactsBoundary.setParams(value);
    contactsBoundary.parameter = value.tab;
  },
};
vi.mock("expo-router", () => ({
  useRouter: () => router,
  useLocalSearchParams: () => ({ tab: contactsBoundary.parameter }),
  // Router focus is an SDK boundary. Execute the real screen's subscribed
  // callback with real React effects rather than replacing its permission flow.
  useFocusEffect: (effect: EffectCallback) =>
    useEffect(() => (contactsBoundary.focused ? effect() : undefined), [effect]),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://contacts-interaction-fixtures.test" } } },
}));
vi.mock("expo-contacts", () => ({
  getPermissionsAsync: contactsBoundary.permissions,
  requestPermissionsAsync: contactsBoundary.requestPermissions,
  Contact: { getAllDetails: contactsBoundary.readContacts },
  ContactField: { FULL_NAME: "name", EMAILS: "emails", PHONES: "phones" },
  ContactsSortOrder: { GivenName: "givenName" },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: contactsBoundary.getSecret,
  setItemAsync: contactsBoundary.setSecret,
  deleteItemAsync: contactsBoundary.deleteSecret,
}));
vi.mock("@sentry/react-native", () => ({ captureException: contactsBoundary.report }));

export const contactsApi = "https://contacts-interaction-fixtures.test";
export type DeviceContact = {
  id: string;
  fullName: string;
  emails: { address: string }[];
  phones?: { number: string }[];
};
export const contactsFixture = {
  client: undefined as QueryClient | undefined,
  target: {} as ContactUser,
  relationships: new Map<string, RelationshipRow[]>(),
  relationshipStatus: new Map<string, number>(),
  nextRelationships: new Map<string, RelationshipRow[]>(),
  cursors: new Map<string, string>(),
  suggestions: [] as ContactUser[],
  nextSuggestions: [] as ContactUser[],
  suggestionsCursor: null as string | null,
  suggestionsStatus: 200,
  nextSuggestionsStatus: 200,
  searchStatus: 200,
  searchUsers: [] as ContactUser[],
  searchEmpty: false,
  actionStatus: 200,
  inviteStatus: 200,
  syncStatus: 200,
  devices: [] as DeviceContact[],
  registeredEmails: [] as string[],
  pendingInvite: undefined as Promise<Response> | undefined,
  pendingSync: undefined as Promise<Response> | undefined,
  pendingAction: undefined as Promise<Response> | undefined,
  reads: [] as URL[],
  writes: [] as {
    path: string;
    method: string;
    query: string;
    input: Record<string, unknown>;
    authorization: string | null;
  }[],
};
export const inviteLink = "https://api.board-game-organizer.com/invite/test-only-token";
const listeners = new Set<(state: AppStateStatus) => void>();
export function fixtureJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
export function fixtureUser(change: Partial<ContactUser> = {}): ContactUser {
  return {
    id: "target",
    name: "Target Player",
    username: "target-player",
    email: null,
    avatarUrl: null,
    presence: { online: true, lastActiveAt: "2030-01-01T00:00:00.000Z" },
    ...change,
  };
}
export function relationship(type: string, profile = contactsFixture.target) {
  const incoming = type === "pending" || type === "followers";
  const row = {
    fromUserId: incoming ? profile.id : contactsBoundary.userId,
    toUserId: incoming ? contactsBoundary.userId : profile.id,
    profile,
  };
  contactsFixture.relationships.set(type, [
    ...(contactsFixture.relationships.get(type) ?? []),
    row,
  ]);
  return row;
}
const attention = (targets: unknown[]) => ({
  asOf: "2030-01-01T00:00:00.000Z",
  unreadCount: 0,
  summary: {
    tables: 0,
    events: 0,
    groups: 0,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  },
  targets: targets.map((target) => ({
    target,
    count: 0,
    direct: 0,
    events: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  })),
});

beforeEach(() => {
  vi.clearAllMocks();
  contactsBoundary.userId = "owner";
  contactsBoundary.authLoaded = contactsBoundary.signedIn = true;
  contactsBoundary.focused = true;
  contactsBoundary.parameter = undefined;
  contactsBoundary.token = "fixture-session-token";
  contactsBoundary.getToken.mockImplementation(async () => contactsBoundary.token);
  contactsBoundary.permission = {
    granted: false,
    status: "denied",
    canAskAgain: true,
    expires: "never",
  };
  contactsBoundary.permissionOnRequest = { ...contactsBoundary.permission };
  contactsBoundary.permissions.mockImplementation(async () => contactsBoundary.permission);
  contactsBoundary.requestPermissions.mockImplementation(async () => {
    contactsBoundary.permission = { ...contactsBoundary.permissionOnRequest };
    return contactsBoundary.permission;
  });
  contactsBoundary.storage.clear();
  contactsBoundary.getSecret.mockImplementation(
    async (key: string) => contactsBoundary.storage.get(key) ?? null,
  );
  contactsBoundary.setSecret.mockImplementation(async (key: string, value: string) => {
    contactsBoundary.storage.set(key, value);
  });
  contactsBoundary.deleteSecret.mockImplementation(async (key: string) => {
    contactsBoundary.storage.delete(key);
  });
  contactsBoundary.readContacts.mockImplementation(
    async (_fields, { limit, offset }: { limit: number; offset: number }) =>
      contactsFixture.devices.slice(offset, offset + limit),
  );
  listeners.clear();
  vi.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
    const callback = listener as (state: AppStateStatus) => void;
    if (type === "change") listeners.add(callback);
    return {
      remove: () => {
        listeners.delete(callback);
      },
    };
  });
  contactsFixture.client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  contactsFixture.target = fixtureUser();
  contactsFixture.relationships.clear();
  contactsFixture.relationshipStatus.clear();
  contactsFixture.nextRelationships.clear();
  contactsFixture.cursors.clear();
  contactsFixture.suggestions = contactsFixture.nextSuggestions = [];
  contactsFixture.suggestionsCursor = null;
  contactsFixture.suggestionsStatus = contactsFixture.nextSuggestionsStatus = 200;
  contactsFixture.searchUsers = [];
  contactsFixture.searchStatus = 200;
  contactsFixture.searchEmpty = false;
  contactsFixture.actionStatus = contactsFixture.inviteStatus = contactsFixture.syncStatus = 200;
  contactsFixture.devices = [];
  contactsFixture.registeredEmails = [];
  contactsFixture.pendingInvite =
    contactsFixture.pendingSync =
    contactsFixture.pendingAction =
      undefined;
  contactsFixture.reads.length = contactsFixture.writes.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== contactsApi) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        contactsFixture.writes.push({
          path: url.pathname,
          method,
          query: url.search,
          input: body,
          authorization: new Headers(init?.headers).get("authorization"),
        });
        if (url.pathname === "/api/users/presence")
          return fixtureJson({ success: true, lastActiveAt: "2030-01-01T00:00:00.000Z" });
        if (url.pathname === "/api/notifications/attention")
          return fixtureJson({ snapshot: attention([body.target]), read: 0 });
        if (url.pathname === "/api/invites")
          return (
            contactsFixture.pendingInvite ??
            fixtureJson(
              contactsFixture.inviteStatus === 200
                ? {
                    token: "test-only-token",
                    link: inviteLink,
                    email: null,
                    expiresAt: "2030-01-08T00:00:00.000Z",
                  }
                : { error: "Fixture invite unavailable" },
              contactsFixture.inviteStatus,
            )
          );
        if (url.pathname === "/api/contacts/sync")
          return (
            contactsFixture.pendingSync ??
            fixtureJson(
              contactsFixture.syncStatus === 200
                ? {
                    stored: contactsFixture.registeredEmails.length,
                    users: [],
                    registeredIdentifiers: {
                      emails: contactsFixture.registeredEmails,
                      phoneNumbers: [],
                    },
                  }
                : { error: "Fixture sync unavailable" },
              contactsFixture.syncStatus,
            )
          );
        if (
          url.pathname === "/api/relationships" ||
          url.pathname.startsWith("/api/friend-requests/")
        )
          return (
            contactsFixture.pendingAction ??
            fixtureJson(
              { success: contactsFixture.actionStatus === 200 },
              contactsFixture.actionStatus,
            )
          );
        throw new Error(`Unexpected fixture write: ${url.pathname}`);
      }
      contactsFixture.reads.push(url);
      if (url.pathname === "/api/relationships") {
        const type = url.searchParams.get("type") ?? "";
        const status = contactsFixture.relationshipStatus.get(type) ?? 200;
        return fixtureJson(
          status === 200
            ? {
                rows:
                  (url.searchParams.has("cursor")
                    ? contactsFixture.nextRelationships
                    : contactsFixture.relationships
                  ).get(type) ?? [],
                nextCursor: url.searchParams.has("cursor")
                  ? null
                  : (contactsFixture.cursors.get(type) ?? null),
              }
            : { error: "Fixture relationship unavailable" },
          status,
        );
      }
      if (url.pathname === "/api/users/suggestions") {
        const next = url.searchParams.has("cursor");
        const status = next
          ? contactsFixture.nextSuggestionsStatus
          : contactsFixture.suggestionsStatus;
        return fixtureJson(
          status === 200
            ? {
                users: next ? contactsFixture.nextSuggestions : contactsFixture.suggestions,
                hasContacts: contactsFixture.registeredEmails.length > 0,
                nextCursor: next ? null : contactsFixture.suggestionsCursor,
              }
            : { error: "Fixture suggestion unavailable" },
          status,
        );
      }
      if (url.pathname === "/api/users/search")
        return fixtureJson(
          {
            users: contactsFixture.searchEmpty
              ? []
              : contactsFixture.searchUsers.length
                ? contactsFixture.searchUsers
                : [contactsFixture.target],
          },
          contactsFixture.searchStatus,
        );
      if (url.pathname === "/api/notifications/attention")
        return fixtureJson(attention(JSON.parse(url.searchParams.get("targets") ?? "[]")));
      throw new Error(`Unexpected fixture read: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  contactsFixture.client?.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

export function ContactsFixture() {
  if (!contactsFixture.client) throw new Error("Expected fixture Query client");
  return (
    <QueryClientProvider client={contactsFixture.client}>
      <NativeTestProviders>
        <ContactsScreen />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
export async function renderContacts() {
  return render(<ContactsFixture />);
}
export async function contactsReady() {
  await waitFor(() => {
    for (const type of ["pending", "sent", "friends", "following", "followers", "blocked"]) {
      if (
        contactsFixture.client?.getQueryState([
          "contacts",
          type,
          contactsApi,
          contactsBoundary.userId,
          "pages-v1",
        ])?.status !== "success"
      )
        throw new Error(`Waiting for actual ${type} query`);
    }
  });
}
export async function contactTab(tab: string) {
  await userEvent.setup().press(screen.getByTestId(`top-tab-${tab}`));
}
export async function contactPress(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
export async function changeContactsAppState(state: AppStateStatus) {
  await act(async () => {
    for (const listener of listeners) listener(state);
  });
}
export function socialWrites() {
  return contactsFixture.writes.filter(
    (write) =>
      write.path === "/api/relationships" || write.path.startsWith("/api/friend-requests/"),
  );
}
