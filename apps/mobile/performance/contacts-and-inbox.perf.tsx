import { URL } from "node:url";
import {
  type NotificationAttentionTarget,
  type NotificationDto,
  notificationAttentionTargetSchema,
} from "@board-game-organizer/schemas";
import {
  type ContactUser,
  contactSuggestionsKey,
  notificationsPageQuery,
  type RelationshipRow,
  relationshipListKey,
} from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { type EffectCallback, type ReactNode, useEffect } from "react";
import { Text, View } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import ContactsScreen from "@/app/(tabs)/contacts";
import NotificationsScreen from "@/app/notifications";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "fixture-owner"),
  push: vi.fn(),
  setParams: vi.fn(),
  permissions: vi.fn(async () => ({
    granted: false,
    status: "denied",
    canAskAgain: false,
    expires: "never",
  })),
  requestPermissions: vi.fn(),
  readContacts: vi.fn(),
  getSecret: vi.fn(async () => null),
  setSecret: vi.fn(async () => undefined),
  deleteSecret: vi.fn(async () => undefined),
  report: vi.fn(),
}));
const API = "https://social-performance-fixtures.test";
const options = {
  apiUrl: API,
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
  locale: "en" as const,
};
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "social-performance-owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://social-performance-fixtures.test" } } },
}));
const navigation = { setOptions: vi.fn() };
vi.mock("expo-router", () => ({
  useNavigation: () => navigation,
  useRouter: () => boundary,
  useLocalSearchParams: () => ({}),
  // Focus is an SDK boundary; screen subscription/effect logic remains real.
  useFocusEffect: (effect: EffectCallback) => useEffect(effect, [effect]),
  Redirect: ({ href }: { href: string }) => <Text>{href}</Text>,
  Stack: {
    Screen: ({ options: config }: { options: { headerRight?: () => ReactNode } }) => (
      <View>{config.headerRight?.()}</View>
    ),
  },
}));
vi.mock("expo-contacts", () => ({
  getPermissionsAsync: boundary.permissions,
  requestPermissionsAsync: boundary.requestPermissions,
  Contact: { getAllDetails: boundary.readContacts },
  ContactField: { FULL_NAME: "name", EMAILS: "emails", PHONES: "phones" },
  ContactsSortOrder: { GivenName: "givenName" },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: boundary.getSecret,
  setItemAsync: boundary.setSecret,
  deleteItemAsync: boundary.deleteSecret,
}));
vi.mock("expo-notifications", () => ({}));
vi.mock("@sentry/react-native", () => ({ captureException: boundary.report }));

const alice: ContactUser = {
  id: "alice",
  name: "Alice Player",
  username: "alice",
  email: null,
  avatarUrl: null,
  presence: { online: true, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  isFriend: true,
};
const bob: ContactUser = {
  ...alice,
  id: "bob",
  name: "Bob Player",
  username: "bob",
  isFriend: false,
};
const discoverable: ContactUser = {
  ...alice,
  id: "alice-new",
  name: "Alice New Player",
  username: "alice-new",
  isFriend: false,
};
const friend: RelationshipRow = { fromUserId: "owner", toUserId: alice.id, profile: alice };
const request: RelationshipRow = { fromUserId: bob.id, toUserId: "owner", profile: bob };
const relationshipPage = (rows: RelationshipRow[]) => ({
  pages: [{ rows, nextCursor: null }],
  pageParams: [""],
});
function seedContacts(client: QueryClient) {
  for (const type of ["friends", "following", "followers", "pending", "sent", "blocked"] as const)
    client.setQueryData(
      relationshipListKey(API, "owner", type),
      relationshipPage(type === "friends" ? [friend] : type === "pending" ? [request] : []),
    );
  client.setQueryData(contactSuggestionsKey(API, "owner"), {
    pages: [{ users: [], hasContacts: false, nextCursor: null }],
    pageParams: [""],
  });
}
function attention(targets: NotificationAttentionTarget[]) {
  return {
    asOf: "2030-06-01T10:00:00.000Z",
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
  };
}
const notice = (index: number, patch: Partial<NotificationDto> = {}): NotificationDto => ({
  id: String(index).padStart(24, "0"),
  kind: "friend_request_accepted",
  title: `Connection ${index}`,
  description: `Friendship accepted for player ${index}.`,
  href: "/contacts",
  createdAt: "2030-06-01T10:00:00.000Z",
  readAt: null,
  ...patch,
});
const inbox = [
  notice(1),
  notice(2, {
    kind: "group_invitation",
    title: "Group invitation",
    description: "Join our private group.",
    href: "/groups/11111111-1111-4111-8111-111111111111",
    requiresResponse: true,
  }),
];
const inboxKey = notificationsPageQuery(options, 20).queryKey;
const inboxPage = (notifications: NotificationDto[]) => ({
  pages: [
    {
      notifications,
      unreadCount: notifications.filter((item) => !item.readAt).length,
      nextCursor: null,
    },
  ],
  pageParams: [undefined],
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["contacts", "inbox"] as const)(
  "actual %s screen: cached private state remains reactive and unconfirmed actions do not write",
  async (kind) => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    const writes: { method: string; path: string; body: unknown }[] = [];
    const searches: URL[] = [];
    const unexpectedReads: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (url.origin !== API) throw new Error(`Unexpected social fixture origin ${url.origin}`);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-owner");
        const method = init?.method ?? "GET";
        if (method !== "GET") {
          const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
          writes.push({ method, path: url.pathname, body });
          if (kind === "contacts" && method === "POST" && url.pathname === "/api/users/presence") {
            expect(body).toEqual({ status: "online" });
            return Response.json({ success: true, lastActiveAt: "2030-06-01T10:00:00.000Z" });
          }
          throw new Error(
            "No benchmark action consents to a relationship, inbox or attention mutation",
          );
        }
        if (kind === "contacts" && url.pathname === "/api/notifications/attention")
          return Response.json(
            attention(
              notificationAttentionTargetSchema
                .array()
                .parse(JSON.parse(url.searchParams.get("targets") ?? "[]")),
            ),
          );
        if (kind === "contacts" && url.pathname === "/api/users/search") {
          searches.push(url);
          return Response.json({ users: [alice, discoverable] });
        }
        unexpectedReads.push(url.pathname);
        throw new Error(`Unexpected canonical read outside the private cache ${url.pathname}`);
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
    try {
      const result = await measureRenders(
        kind === "contacts" ? <ContactsScreen /> : <NotificationsScreen />,
        {
          wrapper,
          beforeEach: () => {
            client.clear();
            vi.clearAllMocks();
            writes.length = searches.length = unexpectedReads.length = 0;
            if (kind === "contacts") seedContacts(client);
            else client.setQueryData(inboxKey, inboxPage(inbox));
          },
          scenario: async () => {
            if (kind === "contacts") {
              const friendHost = await screen.findByText("@alice");
              await waitFor(() =>
                expect(writes).toEqual([
                  { method: "POST", path: "/api/users/presence", body: { status: "online" } },
                ]),
              );
              await userEvent.setup().press(screen.getByTestId("top-tab-requests"));
              const requestHost = await screen.findByText("@bob");
              await userEvent.setup().press(screen.getByTestId("top-tab-search"));
              expect(
                await screen.findByRole("button", { name: "Contact search help" }),
              ).toBeVisible();
              const search = screen.getByPlaceholderText("Search users");
              await fireEvent(search, "focus");
              await fireEvent.changeText(search, "Alice");
              expect(await screen.findByText("@alice-new")).toBeVisible();
              expect(screen.queryByText("@alice")).toBeNull();
              expect(searches).toHaveLength(1);
              expect(searches[0].searchParams.get("query")).toBe("Alice");
              await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
              expect(screen.getByPlaceholderText("Search users")).toBe(search);
              expect(search).toHaveDisplayValue("");
              expect(searches).toHaveLength(1);
              await userEvent.setup().press(screen.getByTestId("top-tab-requests"));
              expect(screen.getByText("@bob")).toBe(requestHost);
              await userEvent.setup().press(screen.getByTestId("top-tab-connections"));
              expect(screen.getByText("@alice")).toBe(friendHost);
              await act(() =>
                client.setQueryData(
                  relationshipListKey(API, "owner", "friends"),
                  relationshipPage([
                    {
                      ...friend,
                      profile: { ...alice, name: "Updated Alice", username: "updated-alice" },
                    },
                  ]),
                ),
              );
              expect(await screen.findByText("@updated-alice")).toBe(friendHost);
              expect(screen.getByText("Updated Alice")).toBeVisible();
              expect(boundary.permissions).toHaveBeenCalled();
              expect(boundary.requestPermissions).not.toHaveBeenCalled();
              expect(boundary.readContacts).not.toHaveBeenCalled();
              expect(writes).toEqual([
                { method: "POST", path: "/api/users/presence", body: { status: "online" } },
              ]);
            } else {
              const first = await screen.findByRole("button", {
                name: "Connection 1. Friendship accepted for player 1.",
              });
              const pending = screen.getByRole("button", {
                name: "Group invitation. Join our private group.",
              });
              await userEvent
                .setup()
                .press(screen.getByTestId(`delete-notification-${inbox[0].id}`));
              expect(
                screen.getByText("This notification will be permanently deleted."),
              ).toBeVisible();
              expect(writes).toEqual([]);
              await userEvent.setup().press(
                within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
                  name: "Cancel",
                }),
              );
              expect(
                screen.getByRole("button", {
                  name: "Connection 1. Friendship accepted for player 1.",
                }),
              ).toBe(first);
              await act(() =>
                client.setQueryData(
                  inboxKey,
                  inboxPage([
                    {
                      ...inbox[0],
                      title: "Updated connection",
                      description: "The server refreshed this notice.",
                      readAt: "2030-06-01T11:00:00.000Z",
                    },
                    inbox[1],
                    notice(3),
                  ]),
                ),
              );
              expect(
                await screen.findByRole("button", {
                  name: "Updated connection. The server refreshed this notice.",
                }),
              ).toBe(first);
              expect(
                screen.getByRole("button", { name: "Group invitation. Join our private group." }),
              ).toBe(pending);
              expect(await screen.findByText("Connection 3")).toBeVisible();
              const firstRow = first.parent;
              if (!firstRow) throw new Error("Expected the real inbox card host");
              expect(
                within(firstRow).getByTestId(`delete-notification-${inbox[0].id}`),
              ).toBeTruthy();
              expect(
                within(firstRow).queryByTestId(`delete-notification-${inbox[1].id}`),
              ).toBeNull();
              expect(within(firstRow).queryByRole("button", { name: "Mark as read" })).toBeNull();
              expect(screen.getAllByRole("button", { name: "Mark as read" })).toHaveLength(2);
              expect(screen.getByRole("button", { name: "Mark all as read" })).toBeEnabled();
              expect(writes).toEqual([]);
              expect(
                client.getQueryData<{ pages: { notifications: NotificationDto[] }[] }>(inboxKey)
                  ?.pages[0].notifications[1],
              ).toEqual(inbox[1]);
            }
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(unexpectedReads).toEqual([]);
            expect(boundary.push).not.toHaveBeenCalled();
            expect(boundary.report).not.toHaveBeenCalled();
          },
        },
      );
      assertRenderMeasurement(result);
    } finally {
      client.clear();
    }
  },
);
