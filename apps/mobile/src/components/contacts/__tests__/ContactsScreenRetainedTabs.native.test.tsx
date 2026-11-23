import type { ContactUser } from "@board-game-organizer/shared";
import { useContacts, useInvites } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ContactsScreen from "@/app/(tabs)/contacts";
import { NativeTestProviders } from "@/test/NativeTestProviders";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://contacts-fixtures.test",
  parameter: undefined as string | string[] | undefined,
  getToken: vi.fn(async () => "fixture-token"),
  setParams: vi.fn(),
  push: vi.fn(),
  permissions: vi.fn(async () => ({
    granted: false,
    status: "denied",
    canAskAgain: true,
    expires: "never",
  })),
  requestPermissions: vi.fn(),
  readContacts: vi.fn(),
  readAttention: vi.fn(),
  presence: vi.fn(async () => undefined),
  models: new Map<string, ReturnType<typeof contactsModel>>(),
  invite: { isPending: false, isError: false, mutate: vi.fn() },
}));
const router = {
  push: boundary.push,
  setParams: (params: { tab: undefined }) => {
    boundary.setParams(params);
    boundary.parameter = params.tab;
  },
};
const Session = createContext({
  userId: "owner",
  sessionId: "session",
  isLoaded: true,
  isSignedIn: true,
  getToken: boundary.getToken,
});

// Platform/session and API hooks are boundaries. The screen, native lists,
// HeroUI tabs/inputs, retained panels, rows, badges and attention scope are real.
vi.mock("@clerk/expo", () => ({ useAuth: () => useContext(Session) }));
vi.mock("expo-router", () => ({
  useRouter: () => router,
  useLocalSearchParams: () => ({ tab: boundary.parameter }),
  // Focus/permission journeys have separate device acceptance. This suite owns
  // tab retention and consumes native permission state without prompting.
  useFocusEffect: () => undefined,
}));
vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { extra: { apiUrl: boundary.apiUrl } };
    },
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
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));
vi.mock("@sentry/react-native", () => ({ captureException: vi.fn() }));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  useContacts: vi.fn((...args: unknown[]) => boundary.models.get(String(args[4]))),
  useInvites: vi.fn(() => boundary.invite),
  useReadNotificationAttention: () => ({ read: boundary.readAttention, error: null }),
  reportPresence: boundary.presence,
}));

function user(name: string, id: string): ContactUser {
  return {
    id,
    name,
    username: name.toLowerCase().replaceAll(" ", ""),
    email: null,
    avatarUrl: null,
    presence: { online: true, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  };
}
function page<T>(data: T) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}
function contactsModel(owner: string) {
  const friend = { ...user(`Ada ${owner}`, `friend-${owner}`), isFriend: true };
  const requester = user(`Grace ${owner}`, `requester-${owner}`);
  const suggested = user(`Linus ${owner}`, `suggested-${owner}`);
  const searched = user(`Alex ${owner}`, `searched-${owner}`);
  const relationship = (profile: ContactUser) => ({
    fromUserId: owner,
    toUserId: profile.id,
    profile,
  });
  const mutation = () => ({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  });
  return {
    friends: page([relationship(friend)]),
    following: page([]),
    followers: page([]),
    blocked: page([]),
    pending: page([relationship(requester)]),
    sent: page([]),
    suggestions: page({ users: [suggested], hasContacts: true }),
    search: page({ users: [searched] }),
    knownConnectionIds: {
      friends: new Set([friend.id]),
      following: new Set(),
      followers: new Set(),
      blocked: new Set(),
    },
    runSearch: vi.fn(),
    friendRequestContext: vi.fn(),
    isBusy: () => false,
    follow: mutation(),
    unfollow: mutation(),
    unfriend: mutation(),
    friendRequest: mutation(),
    cancelFriendRequest: mutation(),
    acceptFriendRequest: mutation(),
    rejectFriendRequest: mutation(),
    block: mutation(),
    unblock: mutation(),
    syncContacts: mutation(),
  };
}

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  boundary.apiUrl = "https://contacts-fixtures.test";
  boundary.parameter = undefined;
  boundary.models.set("owner", contactsModel("owner"));
  boundary.models.set("other", contactsModel("other"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  // The real attention provider requests only synthetic fixture snapshots.
  // Reject all other endpoints so a fixture cannot silently contact a backend.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname !== "/api/notifications/attention")
        throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
      const targets = JSON.parse(url.searchParams.get("targets") ?? "[]");
      return new Response(
        JSON.stringify({
          asOf: "2030-06-01T10:00:00.000Z",
          unreadCount: 0,
          summary: {
            tables: 0,
            events: 0,
            groups: 0,
            contacts: 0,
            sections: { connections: 0, requests: 0, search: 0 },
          },
          targets: targets.map((target: unknown) => ({
            target,
            count: 0,
            direct: 0,
            events: 0,
            sections: { connections: 0, requests: 0, search: 0 },
          })),
        }),
        { headers: { "content-type": "application/json" } },
      );
    }),
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function Fixture({ owner = "owner" }: { owner?: string }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Session
          value={{
            userId: owner,
            sessionId: `session-${owner}`,
            isLoaded: true,
            isSignedIn: true,
            getToken: boundary.getToken,
          }}
        >
          <ContactsScreen />
        </Session>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function select(tab: string) {
  await fireEvent.press(screen.getByTestId(`top-tab-${tab}`));
  expect(screen.getByTestId(`top-tab-${tab}`)).toBeSelected();
  expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
}
function nativeScrollHost(node: ReturnType<typeof screen.getByText>) {
  let current: typeof node | null = node;
  while (current && typeof current.props.onScroll !== "function") current = current.parent;
  if (!current) throw new Error("Expected the actual native scroll host");
  return current;
}
const bottomScroll = {
  timeStamp: 1000,
  nativeEvent: {
    contentSize: { width: 390, height: 1000 },
    layoutMeasurement: { width: 390, height: 500 },
    contentOffset: { x: 0, y: 500 },
    zoomScale: 1,
  },
};

it("retains visited contact viewports, keeps tab semantics and shares one API/permission owner", async () => {
  const model = boundary.models.get("owner");
  if (!model) throw new Error("Missing owner fixture");
  model.pending.hasNextPage = true;
  await render(<Fixture />);
  await waitFor(() => expect(boundary.permissions).toHaveBeenCalledOnce());
  expect(screen.getByText("Ada owner")).toBeVisible();
  expect(screen.getByRole("button", { name: "Connections: Icon legend" })).toBeVisible();
  expect(screen.getByText("@adaowner")).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  const friendName = screen.getByText("Ada owner");
  const connections = nativeScrollHost(friendName);
  await select("requests");
  expect(screen.getByText("Grace owner")).toBeVisible();
  expect(screen.getByText("Section guide")).toBeVisible();
  expect(screen.getByRole("button", { name: "Requests: Icon legend" })).toBeVisible();
  expect(screen.queryByText("Ada owner")).toBeNull();
  const requestName = screen.getByText("Grace owner");
  const requestList = nativeScrollHost(requestName);
  const lateRequestScroll = requestList.props.onScroll;
  await select("device");
  expect(screen.getByText("Linus owner")).toBeVisible();
  expect(screen.queryByText("Device Contacts")).toBeNull();
  expect(screen.getByText("Section guide")).toBeVisible();
  expect(screen.getByRole("button", { name: "Contacts help" })).toBeVisible();
  await act(() => lateRequestScroll(bottomScroll));
  expect(model.pending.fetchNextPage).not.toHaveBeenCalled();
  await select("search");
  expect(screen.getByTestId("contact-search-input")).toBeVisible();
  expect(screen.getByText("Section guide")).toBeVisible();
  expect(screen.getByRole("button", { name: "Contact search help" })).toBeVisible();
  expect(screen.queryByText("Search users by name or email")).toBeNull();
  await fireEvent.changeText(screen.getByTestId("contact-search-input"), "Alex");
  expect(screen.getByText("Alex owner")).toBeVisible();
  await waitFor(() => expect(model.runSearch).toHaveBeenCalledWith("Alex"));
  await select("connections");
  expect(screen.getByText("Ada owner")).toBeVisible();
  expect(screen.getByText("Ada owner")).toBe(friendName);
  expect(nativeScrollHost(screen.getByText("Ada owner"))).toBe(connections);
  await select("requests");
  expect(screen.getByText("Grace owner")).toBe(requestName);
  expect(nativeScrollHost(screen.getByText("Grace owner"))).toBe(requestList);
  await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
  expect(model.pending.fetchNextPage).toHaveBeenCalledOnce();
  await select("search");
  expect(screen.getByTestId("contact-search-input")).toHaveDisplayValue("Alex");
  expect(boundary.permissions).toHaveBeenCalledOnce();
  expect(boundary.requestPermissions).not.toHaveBeenCalled();
  expect(boundary.readContacts).not.toHaveBeenCalled();
  expect(useContacts).toHaveBeenCalledTimes(vi.mocked(useInvites).mock.calls.length);
  expect(boundary.setParams).not.toHaveBeenCalled();
  expect(boundary.readAttention.mock.calls.map(([target]) => target.id)).toEqual([
    "requests",
    "search",
    "connections",
    "requests",
    "search",
  ]);
});

it("consumes repeated deep links while preserving local selection and retained input state", async () => {
  const view = await render(<Fixture />);
  for (const requested of ["requests", "requests", ["suggestions"], "blocked", "unknown"]) {
    boundary.parameter = requested;
    await view.rerender(<Fixture />);
    const selected =
      requested === "unknown"
        ? "connections"
        : requested === "blocked"
          ? "requests"
          : Array.isArray(requested)
            ? "device"
            : requested;
    expect(screen.getByTestId(`top-tab-${selected}`)).toBeSelected();
    expect(boundary.parameter).toBeUndefined();
    await view.rerender(<Fixture />);
    expect(screen.getByTestId(`top-tab-${selected}`)).toBeSelected();
    await select("search");
  }
  expect(boundary.setParams).toHaveBeenCalledTimes(5);
  expect(boundary.setParams).toHaveBeenLastCalledWith({ tab: undefined });
  await view.unmount();
  boundary.parameter = "device";
  await render(<Fixture />);
  expect(screen.getByTestId("top-tab-device")).toBeSelected();
  expect(boundary.parameter).toBeUndefined();
});

it("evicts every retained private viewport and draft when the API or account owner changes", async () => {
  const view = await render(<Fixture />);
  await select("requests");
  await select("search");
  await fireEvent.changeText(screen.getByTestId("contact-search-input"), "Alex");
  const oldSearch = screen.getByTestId("contact-search-input");
  const oldFriend = screen.getByText("Ada owner", { includeHiddenElements: true });
  await view.rerender(<Fixture owner="other" />);
  expect(screen.getByText("Ada other")).toBeVisible();
  expect(screen.queryByText("Ada owner", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText("Grace owner", { includeHiddenElements: true })).toBeNull();
  expect(oldSearch).not.toBeOnTheScreen();
  expect(oldFriend).not.toBeOnTheScreen();
  await select("search");
  expect(screen.getByTestId("contact-search-input")).toHaveDisplayValue("");
  const otherFriend = screen.getByText("Ada other", { includeHiddenElements: true });
  boundary.apiUrl = "https://other-contacts-fixtures.test";
  await view.rerender(<Fixture owner="other" />);
  expect(screen.getByText("Ada other")).toBeVisible();
  expect(otherFriend).not.toBeOnTheScreen();
  expect(boundary.permissions).toHaveBeenCalledTimes(3);
});
