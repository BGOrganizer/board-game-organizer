import type { NotificationDto } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NotificationsScreen from "@/app/notifications";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";

const API = "https://notification-screen-fixtures.test";
const boundary = vi.hoisted(() => ({
  userId: "owner",
  isLoaded: true,
  isSignedIn: true,
  push: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    ...boundary,
    sessionId: `session-${boundary.userId}`,
    getToken: async () => `fixture-${boundary.userId}`,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: "https://notification-screen-fixtures.test" },
    },
  },
}));
// This screen uses only the pure destination helper, not OS push delivery.
vi.mock("expo-notifications", () => ({}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  Redirect: ({ href }: { href: string }) => <Text testID="router-redirect">{href}</Text>,
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => ReactNode } }) => (
      <View>{options.headerRight?.()}</View>
    ),
  },
}));

let client: QueryClient;
let rows: NotificationDto[];
let status = 200;
let writeStatus = 204;
let pending: Promise<Response> | undefined;
let pendingWrite: Promise<void> | undefined;
let unreadCountOverride: number | undefined;
let nextCursor: string | null;
const writes: { owner: string; method: string; path: string }[] = [];
const reads: URL[] = [];
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

beforeEach(() => {
  vi.clearAllMocks();
  boundary.userId = "owner";
  boundary.isLoaded = true;
  boundary.isSignedIn = true;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  rows = [];
  status = 200;
  writeStatus = 204;
  nextCursor = null;
  pending = undefined;
  pendingWrite = undefined;
  unreadCountOverride = undefined;
  writes.length = 0;
  reads.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      const method = init?.method ?? "GET";
      const token = new Headers(init?.headers).get("authorization");
      expect(token).toBe(`Bearer fixture-${boundary.userId}`);
      if (method === "GET" && url.pathname === "/api/notifications") {
        reads.push(url);
        if (pending) return pending;
        if (status !== 200)
          return Response.json({ error: "Fixture inbox unavailable" }, { status });
        const pageRows = url.searchParams.has("cursor") ? [notice(3)] : rows;
        return Response.json({
          notifications: pageRows,
          unreadCount: unreadCountOverride ?? rows.filter((item) => !item.readAt).length,
          nextCursor: url.searchParams.has("cursor") ? null : nextCursor,
        });
      }
      if (
        (method === "DELETE" || method === "PATCH") &&
        /^\/api\/notifications(?:\/[a-f\d]{24})?$/.test(url.pathname)
      ) {
        writes.push({ owner: boundary.userId, method, path: url.pathname });
        if (pendingWrite) await pendingWrite;
        if (writeStatus !== 204)
          return Response.json({ error: "Fixture write rejected" }, { status: writeStatus });
        const id = url.pathname.split("/")[3];
        rows =
          method === "DELETE"
            ? rows.filter((item) => id && item.id !== id)
            : rows.map((item) =>
                !item.requiresResponse && (!id || item.id === id)
                  ? { ...item, readAt: "2030-06-01T11:00:00.000Z" }
                  : item,
              );
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fixture endpoint: ${method} ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  await act(() => client.clear());
  vi.unstubAllGlobals();
});
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <NotificationsScreen />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const press = (name: string) => userEvent.setup().press(screen.getByRole("button", { name }));
const inboxRow = (index = 1) =>
  screen.getByRole("button", {
    name: `Connection ${index}. Friendship accepted for player ${index}.`,
  });

it("keeps initial pending data distinct from a successful empty inbox", async () => {
  let finish: (response: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.getByLabelText("Loading notifications")).toBeOnTheScreen();
  expect(screen.queryByText("No notifications yet")).toBeNull();
  expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled();
  await act(() => finish(Response.json({ notifications: [], unreadCount: 0, nextCursor: null })));
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled();
  // An authoritative later cursor or off-page unread summary still makes the
  // whole-inbox action available even when its current visible page is empty.
  pending = undefined;
  nextCursor = notice(1).id;
  await act(async () => {
    await client.refetchQueries({ queryKey: ["notifications", API, "owner"] });
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeEnabled(),
  );
  nextCursor = null;
  unreadCountOverride = 1;
  await act(async () => {
    await client.refetchQueries({ queryKey: ["notifications", API, "owner"] });
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeEnabled(),
  );
  expect(writes).toHaveLength(0);
});

it("redirects a signed-out session and performs no authenticated reads", async () => {
  boundary.isSignedIn = false;
  await render(<Fixture />);
  expect(screen.getByTestId("router-redirect")).toHaveTextContent(/^\/$/);
  expect(reads).toHaveLength(0);
});

it("shows a real read failure, keeps it distinct from empty and retries explicitly", async () => {
  status = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load notifications")).toBeVisible();
  expect(screen.queryByText("No notifications yet")).toBeNull();
  status = 200;
  rows = [notice(1)];
  await press("Try again");
  expect(await screen.findByText("Connection 1")).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("limit")).toBe("20");
  expect(reads.at(-1)?.searchParams.get("locale")).toBe("en");
  expect(writes).toHaveLength(0);
});

it("reads an informational notice on explicit opening and routes through the actual destination helper", async () => {
  rows = [notice(1)];
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  expect(writes).toHaveLength(0);
  await userEvent.setup().press(inboxRow());
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith("/contacts?tab=connections");
  await waitFor(() =>
    expect(writes).toEqual([
      {
        owner: "owner",
        method: "PATCH",
        path: `/api/notifications/${notice(1).id}`,
      },
    ]),
  );
});

it("does not turn opening a pending invitation into a response or generic read", async () => {
  const groupId = "11111111-1111-4111-8111-111111111111";
  rows = [
    notice(1, {
      kind: "group_invitation",
      title: "Group invitation",
      description: "Join our private group.",
      href: `/groups/${groupId}`,
      requiresResponse: true,
    }),
  ];
  await render(<Fixture />);
  await screen.findByText("Group invitation");
  await press("Group invitation. Join our private group.");
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith(`/group/${groupId}`);
  expect(writes).toHaveLength(0);
});

it("marks all informational notifications read only through the explicit action", async () => {
  rows = [notice(1), notice(2)];
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  await press("Mark all as read");
  await waitFor(() =>
    expect(writes).toContainEqual({
      owner: "owner",
      method: "PATCH",
      path: "/api/notifications",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull(),
  );
  expect(screen.getByText("Connection 1")).toBeVisible();
});

it("requires an explicit confirmation for one deletion and leaves cancellation reversible", async () => {
  rows = [notice(1)];
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  await press("Delete notification");
  expect(writes).toHaveLength(0);
  await press("Cancel");
  expect(inboxRow()).toBeVisible();
  await press("Delete notification");
  const dialog = screen.getByTestId("confirmation-dialog");
  await userEvent
    .setup()
    .press(within(dialog).getByRole("button", { name: "Delete notification" }));
  await waitFor(() =>
    expect(writes).toContainEqual({
      owner: "owner",
      method: "DELETE",
      path: `/api/notifications/${notice(1).id}`,
    }),
  );
  expect(await screen.findByText("No notifications yet")).toBeVisible();
});

it("confirms whole-inbox deletion separately and removes no item before consent", async () => {
  rows = [notice(1), notice(2)];
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  await press("Delete all notifications");
  expect(writes).toHaveLength(0);
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Delete all notifications",
    }),
  );
  await waitFor(() =>
    expect(writes).toContainEqual({
      owner: "owner",
      method: "DELETE",
      path: "/api/notifications",
    }),
  );
  expect(await screen.findByText("No notifications yet")).toBeVisible();
});

// HeroUI renders one visible toast and one opacity-zero measurement copy.
// Deliver only that public native Yoga boundary; retain the actual toast's
// animated styles and assert the user-facing copy is genuinely visible.
async function visibleFeedback(message: string) {
  const titles = await screen.findAllByText(message, {
    includeHiddenElements: true,
  });
  const measurementOwner = (title: (typeof titles)[number]) => {
    for (let node = title.parent; node; node = node.parent) {
      if (node.props.pointerEvents === "none" && typeof node.props.onLayout === "function")
        return node;
    }
    return null;
  };
  const measurements = titles.map(measurementOwner).filter((node) => node !== null);
  expect(measurements).toHaveLength(1);
  expect(measurements[0]).not.toBeVisible();
  await fireEvent.layout(measurements[0], {
    x: 0,
    y: 0,
    width: 350,
    height: 64,
  });
  const visible = titles.filter((title) => !measurementOwner(title));
  expect(visible).toHaveLength(1);
  await waitFor(() => expect(visible[0]).toBeVisible());
}

it("reconciles an uncertain server delete outcome before restoring its notification and warns against a blind retry", async () => {
  rows = [notice(1)];
  writeStatus = 503;
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  const beforeReads = reads.length;
  await press("Delete notification");
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Delete notification",
    }),
  );
  await visibleFeedback(
    "Could not verify whether this action was saved. Check the current state before retrying.",
  );
  await waitFor(() => expect(reads.length).toBeGreaterThan(beforeReads));
  expect(await screen.findByText("Connection 1")).toBeVisible();
  expect(screen.queryByText("Could not delete notification")).toBeNull();
  expect(screen.queryByText("No notifications yet")).toBeNull();
  expect(writes).toEqual([
    {
      owner: "owner",
      method: "DELETE",
      path: `/api/notifications/${notice(1).id}`,
    },
  ]);
});

it("rolls back a definitively rejected delete before a delayed authoritative refresh and displays its specific failure", async () => {
  rows = [notice(1)];
  writeStatus = 400;
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  let finish!: (response: Response) => void;
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const beforeReads = reads.length;
  await press("Delete notification");
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Delete notification",
    }),
  );
  await visibleFeedback("Could not delete notification");
  expect(await screen.findByText("Connection 1")).toBeVisible();
  await waitFor(() => expect(reads.length).toBeGreaterThan(beforeReads));
  expect(screen.queryByText("No notifications yet")).toBeNull();
  expect(writes).toEqual([
    {
      owner: "owner",
      method: "DELETE",
      path: `/api/notifications/${notice(1).id}`,
    },
  ]);
  await act(() => finish(Response.json({ notifications: rows, unreadCount: 1, nextCursor: null })));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(inboxRow()).toBeVisible();
});

it("revokes an open deletion confirmation immediately when the session owner changes", async () => {
  rows = [notice(1)];
  const view = await render(<Fixture />);
  await screen.findByText("Connection 1");
  await press("Delete notification");
  expect(screen.getByTestId("confirmation-dialog")).toBeOnTheScreen();
  boundary.userId = "other-owner";
  rows = [];
  await view.rerender(<Fixture />);
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("retains existing rows when a page fails and retries that cursor only through its footer", async () => {
  rows = [notice(1)];
  nextCursor = notice(1).id;
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  status = 503;
  await press("Load more");
  expect(
    await screen.findByRole("button", {
      name: "Could not load notifications. Retry",
    }),
  ).toBeEnabled();
  expect(inboxRow()).toBeVisible();
  status = 200;
  await press("Could not load notifications. Retry");
  expect(await screen.findByText("Connection 3")).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe(notice(1).id);
});

it("closes explicit deletion consent before HTTP settles and suppresses native paging while that write owns the inbox", async () => {
  rows = [notice(1), notice(2)];
  nextCursor = notice(2).id;
  let finish: () => void = () => {};
  pendingWrite = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await screen.findByText("Connection 1");
  let list = inboxRow();
  while (list.parent && typeof list.props.onScroll !== "function") list = list.parent;
  await userEvent.setup().press(screen.getByTestId(`delete-notification-${notice(1).id}`));
  expect(writes).toHaveLength(0);
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Delete notification",
    }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    owner: "owner",
    method: "DELETE",
    path: `/api/notifications/${notice(1).id}`,
  });
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(screen.getByText("Connection 2")).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled(),
  );
  await scrollNativeListToEnd(list, 1800);
  expect(reads.some((url) => url.searchParams.has("cursor"))).toBe(false);
  await act(() => {
    pendingWrite = undefined;
    finish();
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeEnabled(),
  );
  expect(screen.getByText("Connection 2")).toBeVisible();
  await press("Load more");
  expect(await screen.findByText("Connection 3")).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe(notice(2).id);
  expect(writes).toHaveLength(1);
});
