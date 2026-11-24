import type { NotificationDto, NotificationListResponse } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NotificationsRoute from "@/app/(tabs)/notifications/page";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { renderWithI18n } from "@/test-utils";
import { messages as italian } from "../../../../../../messages/it.js";

const API = "https://notification-inbox-fixtures.test";
const auth = vi.hoisted(() => ({
  userId: "owner",
  sessionId: "owner-session",
  loaded: true,
  signedIn: true,
  getToken: vi.fn<() => Promise<string>>(),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: auth.signedIn ? auth.userId : null,
    sessionId: auth.signedIn ? auth.sessionId : null,
    isLoaded: auth.loaded,
    isSignedIn: auth.signedIn,
    getToken: auth.getToken,
  }),
}));
const first: NotificationDto = {
  id: "111111111111111111111111",
  kind: "follow",
  title: "First notification",
  description: "A player is now following you.",
  href: "/profiles/friend-one",
  readAt: null,
  createdAt: "2030-06-02T10:00:00.000Z",
};
const second: NotificationDto = {
  ...first,
  id: "222222222222222222222222",
  title: "Second notification",
  href: "/profiles/friend-two",
  createdAt: "2030-06-01T10:00:00.000Z",
};
const invitation: NotificationDto = {
  ...first,
  id: "333333333333333333333333",
  kind: "group_invitation",
  title: "Group invitation",
  href: "/groups/44444444-4444-4444-8444-444444444444",
  requiresResponse: true,
};
let client: QueryClient;
let visibility: ReturnType<typeof installBrowserIntersections>;
let notes: NotificationDto[];
let nextCursor: string | null;
let readStatus: number;
let nextStatus: number;
let writeStatus: number;
let pendingRead: Promise<Response> | undefined;
let pendingWrite: Promise<Response> | undefined;
const reads: URL[] = [];
const writes: { method: string; path: string }[] = [];
function list(url: URL, actor: string): NotificationListResponse {
  const owned = actor === "owner" ? notes : [];
  const next = url.searchParams.has("cursor");
  return {
    notifications: next ? owned.slice(1) : nextCursor ? owned.slice(0, 1) : owned,
    unreadCount: owned.filter((row) => !row.readAt).length,
    nextCursor: next ? null : nextCursor,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.userId = "owner";
  auth.sessionId = "owner-session";
  auth.loaded = auth.signedIn = true;
  auth.getToken.mockImplementation(async () => `token-for-${auth.userId}`);
  notes = [first];
  nextCursor = null;
  readStatus = nextStatus = writeStatus = 200;
  pendingRead = pendingWrite = undefined;
  reads.length = writes.length = 0;
  visibility = installBrowserIntersections();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toMatch(/^Bearer token-for-(owner|replacement)$/);
      const actor = authorization?.slice("Bearer token-for-".length) ?? "";
      const method = init?.method ?? "GET";
      if (method === "GET" && url.pathname === "/api/notifications") {
        reads.push(url);
        if (pendingRead) return pendingRead;
        const status = url.searchParams.has("cursor") ? nextStatus : readStatus;
        return Response.json(
          status === 200 ? list(url, actor) : { error: "Fixture inbox unavailable" },
          {
            status,
          },
        );
      }
      if (
        !["PATCH", "DELETE"].includes(method) ||
        !/^\/api\/notifications(?:\/[a-f\d]{24})?$/.test(url.pathname)
      )
        throw new Error(`Unexpected inbox request: ${method} ${url.pathname}`);
      writes.push({ method, path: url.pathname });
      const response = pendingWrite
        ? await pendingWrite
        : Response.json({ success: writeStatus === 200 }, { status: writeStatus });
      if (response.ok) {
        const id = url.pathname.split("/")[3];
        if (method === "DELETE") notes = id ? notes.filter((row) => row.id !== id) : [];
        else
          notes = notes.map((row) =>
            (!id || row.id === id) && !row.requiresResponse
              ? { ...row, readAt: "2030-06-03T10:00:00.000Z" }
              : row,
          );
        if (!notes.length) nextCursor = null;
      }
      return response;
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function Fixture() {
  return (
    <>
      <header></header>
      <QueryClientProvider client={client}>
        <NotificationsRoute />
      </QueryClientProvider>
    </>
  );
}
function mount() {
  return renderWithI18n(<Fixture />);
}
function article(title: string) {
  const row = screen.getByText(title).closest("article");
  if (!row) throw new Error(`Expected actual notification article: ${title}`);
  return row;
}

it("distinguishes a pending inbox from empty, exposes the real read error and retries explicitly", async () => {
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending inbox read");
  };
  pendingRead = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  mount();
  expect(screen.getByRole("status", { name: "Loading notifications" })).toBeVisible();
  expect(screen.queryByText("No notifications yet")).toBeNull();
  await act(() => finish(Response.json({ error: "Fixture unavailable" }, { status: 503 })));
  expect(await screen.findByText("Could not load notifications")).toBeVisible();
  pendingRead = undefined;
  notes = [];
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled();
  expect(reads).toHaveLength(2);
});

it("loads from the actual intersection observer, keeps rows during a pending page and retries that failed cursor", async () => {
  notes = [first, second];
  nextCursor = second.id;
  mount();
  await screen.findByText(first.title);
  await waitFor(() => expect(visibility.observedTargetCount).toBeGreaterThan(0));
  act(() => visibility.intersect(false));
  expect(reads).toHaveLength(1);
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending inbox page");
  };
  pendingRead = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  act(() => {
    visibility.intersect();
    visibility.intersect();
  });
  await waitFor(() => expect(reads).toHaveLength(2));
  expect(screen.getByText(first.title)).toBeVisible();
  expect(screen.queryByText(second.title)).toBeNull();
  await act(() => finish(Response.json({ error: "Fixture page unavailable" }, { status: 400 })));
  const retry = await screen.findByRole("button", { name: "Could not load notifications. Retry" });
  expect(screen.getByText(first.title)).toBeVisible();
  pendingRead = undefined;
  fireEvent.click(retry);
  expect(await screen.findByText(second.title)).toBeVisible();
  expect(screen.getByText(first.title)).toBeVisible();
  expect(reads.map((url) => url.searchParams.get("cursor"))).toEqual([null, second.id, second.id]);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it("marks ordinary navigation read but keeps invitation navigation separate from explicit consent", async () => {
  notes = [first, invitation];
  mount();
  await screen.findByText(first.title);
  fireEvent.click(within(article(invitation.title)).getByRole("link"));
  expect(writes).toEqual([]);
  fireEvent.click(within(article(first.title)).getByRole("link"));
  await waitFor(() =>
    expect(writes).toEqual([{ method: "PATCH", path: `/api/notifications/${first.id}` }]),
  );
  await waitFor(() =>
    expect(within(article(first.title)).queryByRole("button", { name: "Mark as read" })).toBeNull(),
  );
  expect(
    within(article(invitation.title)).getByRole("button", { name: "Mark as read" }),
  ).toBeEnabled();
});

it("marks the whole ordinary inbox read, then deletes one row only after separate confirmation", async () => {
  notes = [first, second];
  mount();
  await screen.findByText(first.title);
  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  await waitFor(() => expect(writes).toEqual([{ method: "PATCH", path: "/api/notifications" }]));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull(),
  );
  fireEvent.click(
    within(article(first.title)).getByRole("button", { name: "Delete notification" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Delete notification?" });
  expect(writes).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete notification" }));
  await waitFor(() => expect(screen.queryByText(first.title)).toBeNull());
  expect(screen.getByText(second.title)).toBeVisible();
  await waitFor(() =>
    expect(writes.at(-1)).toEqual({ method: "DELETE", path: `/api/notifications/${first.id}` }),
  );
});

it("retains the real inbox on bulk-delete cancellation and empties it only after confirmed deletion", async () => {
  mount();
  await screen.findByText(first.title);
  fireEvent.click(screen.getByRole("button", { name: "Delete all notifications" }));
  let dialog = await screen.findByRole("dialog", { name: "Delete all notifications?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(writes).toEqual([]);
  expect(screen.getByText(first.title)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Delete all notifications" }));
  dialog = await screen.findByRole("dialog", { name: "Delete all notifications?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete all notifications" }));
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  await waitFor(() => expect(writes).toEqual([{ method: "DELETE", path: "/api/notifications" }]));
  expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled();
});

it("scopes pending read state to one row and restores its unread action after a refused write", async () => {
  notes = [first, second];
  mount();
  await screen.findByText(first.title);
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending read mutation");
  };
  pendingWrite = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  fireEvent.click(within(article(first.title)).getByRole("button", { name: "Mark as read" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(
    within(article(first.title)).getByRole("button", { name: "Delete notification" }),
  ).toBeDisabled();
  expect(
    within(article(second.title)).getByRole("button", { name: "Delete notification" }),
  ).toBeEnabled();
  expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled();
  await act(() => finish(Response.json({ error: "Fixture read rejected" }, { status: 400 })));
  expect(
    await within(article(first.title)).findByRole("button", { name: "Mark as read" }),
  ).toBeEnabled();
  expect(screen.getByText(second.title)).toBeVisible();
  expect(writes).toHaveLength(1);
});

it.each(["userId", "sessionId"] as const)(
  "does not transfer real destructive consent to a changed %s",
  async (field) => {
    const view = mount();
    await screen.findByText(first.title);
    fireEvent.click(screen.getByRole("button", { name: "Delete all notifications" }));
    await screen.findByRole("dialog", { name: "Delete all notifications?" });
    const previous = auth[field];
    auth[field] = "replacement";
    view.rerender(<Fixture />);
    expect(screen.queryByRole("dialog")).toBeNull();
    auth[field] = previous;
    view.rerender(<Fixture />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes).toEqual([]);
  },
);

it.each([
  [false, false],
  [true, false],
])(
  "keeps the disabled private inbox from requesting data before auth loaded/signed-in is %s/%s",
  async (loaded, signedIn) => {
    auth.loaded = loaded;
    auth.signedIn = signedIn;
    mount();
    expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled();
    expect(auth.getToken).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  },
);

it("requests the Italian inbox locale and renders its actual localized empty controls", async () => {
  notes = [];
  const i18n = setupI18n({ locale: "it", messages: { it: italian } });
  renderWithI18n(
    <I18nProvider i18n={i18n}>
      <Fixture />
    </I18nProvider>,
  );
  expect(await screen.findByText("Nessuna notifica")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Notifiche" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Elimina tutte le notifiche" })).toBeDisabled();
  expect(reads[0].searchParams.get("locale")).toBe("it");
});
