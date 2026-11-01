import type {
  NotificationAttentionCount,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { notificationAttentionQuery, notificationListKey } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Contacts } from "@/components/contacts/Contacts";
import { NotificationNavigationBadge } from "@/components/notifications/NotificationNavigationBadge";
import { renderWithI18n } from "@/test-utils";

const mutations = vi.hoisted(() => ({ mutate: vi.fn(), isError: false, isPending: false }));
const getToken = async () => "fresh";
const options = { apiUrl: "https://api.test", userId: "user_1", getToken };
const user = {
  id: "user_2",
  name: "Target User",
  email: "target@example.com",
  avatarUrl: null,
  presence: { online: true, lastActiveAt: "2026-01-01T00:00:00.000Z" },
  isFollowing: true,
  isFriend: false,
  blockedByMe: false,
  blockedMe: false,
};
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken, userId: "user_1", isLoaded: true, isSignedIn: true }),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  resolveApiUrl: () => "https://api.test",
  reportPresence: vi.fn(async () => undefined),
  useContacts: () => {
    const page = {
      data: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    };
    return {
      friends: page,
      following: { ...page, data: [{ fromUserId: "user_1", toUserId: user.id, profile: user }] },
      followers: page,
      blocked: page,
      pending: { ...page, data: [{ fromUserId: user.id, toUserId: "user_1", profile: user }] },
      sent: page,
      suggestions: { ...page, data: { users: [] } },
      search: { ...page, data: { users: [] } },
      runSearch: vi.fn(),
      isBusy: () => false,
      follow: mutations,
      unfollow: mutations,
      unfriend: mutations,
      friendRequest: mutations,
      cancelFriendRequest: mutations,
      acceptFriendRequest: mutations,
      rejectFriendRequest: mutations,
      block: mutations,
      unblock: mutations,
    };
  },
}));
const targets: NotificationAttentionTarget[] = [
  { kind: "contacts", id: "connections" },
  { kind: "contacts", id: "requests" },
  { kind: "contacts", id: "search" },
  { kind: "contact", id: "user_2" },
];
function source(): NotificationAttentionSnapshot {
  const row = (target: NotificationAttentionTarget, count: number): NotificationAttentionCount => ({
    target,
    count,
    direct: count,
    events: 0,
    sections:
      target.kind === "contact"
        ? { connections: 2, requests: 2, search: 0 }
        : {
            connections: target.id === "connections" ? 2 : 0,
            requests: target.id === "requests" ? 2 : 0,
            search: 0,
          },
  });
  return {
    asOf: "2027-01-01T00:00:00.000Z",
    unreadCount: 4,
    summary: {
      tables: 0,
      events: 0,
      groups: 0,
      contacts: 4,
      sections: { connections: 2, requests: 2, search: 0 },
    },
    targets: targets.map((target) =>
      row(target, target.kind === "contact" ? 4 : target.id === "search" ? 0 : 2),
    ),
  };
}
let client: QueryClient | undefined;
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("keeps main Contact entry unread, then clears only explicit inner section and its row/main badges before HTTP", async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(notificationAttentionQuery(options, targets).queryKey, source());
  const notifications = ["friend_request", "follow", "friend_request_accepted"].map(
    (kind, index) => ({
      id: String(index + 1).padStart(24, "0"),
      kind,
      title: "Fixture",
      description: "Fixture",
      href: "/contacts",
      readAt: null,
      createdAt: "2026-12-31T23:59:59.000Z",
      attention: {
        target: { kind: "contact", id: "user_2" },
        section: kind === "friend_request" ? "requests" : "connections",
      },
    }),
  );
  client.setQueryData(notificationListKey({ ...options, locale: "en" }, 3), {
    pages: [{ notifications, nextCursor: null, unreadCount: 4, attention: source().summary }],
    pageParams: [undefined],
  });
  let release!: (response: Response) => void;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json(source()),
  );
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider client={client}>
      <fieldset aria-label="Main Contacts">
        <NotificationNavigationBadge section="contacts" />
      </fieldset>
      <Contacts />
    </QueryClientProvider>,
  );
  await screen.findByText("Target User");
  const requests = screen.getByRole("tab", { name: /Requests/ }),
    connections = screen.getByRole("tab", { name: /Connections/ });
  expect(within(requests).getByRole("img", { name: "Notifications: 2" })).toBeTruthy();
  expect(within(connections).getByRole("img", { name: "Notifications: 2" })).toBeTruthy();
  expect(
    within(screen.getByLabelText("Main Contacts")).getByRole("img", { name: "Notifications: 4" }),
  ).toBeTruthy();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  fireEvent.click(requests);
  await waitFor(() => expect(release).toBeTypeOf("function"));
  expect(within(requests).queryByRole("img", { name: /Notifications:/ })).toBeNull();
  expect(within(connections).getByRole("img", { name: "Notifications: 2" })).toBeTruthy();
  expect(
    within(screen.getByLabelText("Main Contacts")).getByRole("img", { name: "Notifications: 2" }),
  ).toBeTruthy();
  expect(
    screen.getByText("Target User").closest("li")?.querySelector('[aria-label="Notifications: 2"]'),
  ).not.toBeNull();
  expect(mutations.mutate).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
  ).toEqual({ target: { kind: "contacts", id: "requests" }, through: source().asOf });
  await act(async () => release(Response.json({ error: "Denied" }, { status: 409 })));
  await waitFor(() =>
    expect(within(requests).getByRole("img", { name: "Notifications: 2" })).toBeTruthy(),
  );
  expect(mutations.mutate).not.toHaveBeenCalled();
});
