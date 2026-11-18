import type { NotificationDto, NotificationListResponse } from "@board-game-organizer/schemas";
import { notificationListKey } from "@board-game-organizer/shared";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationsPage } from "@/components/notifications/NotificationsPage";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const sdk = vi.hoisted(() => {
  const apiUrl = "https://notification-owner-render.test";
  const previous = {
    api: process.env.NEXT_PUBLIC_API_URL,
    firebase: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  };
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  // This cohort measures the inbox and bell, not an opt-in push registration.
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
  return {
    apiUrl,
    previous,
    getToken: vi.fn(async () => "fixture-notification-owner"),
    push: vi.fn(),
    permission: vi.fn(),
  };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: sdk.getToken,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: sdk.push }) }));

const original: NotificationDto[] = Array.from({ length: 22 }, (_, index) => ({
  id: String(index + 1).padStart(24, "0"),
  kind: "follow",
  title: `Cached notice ${index + 1}`,
  description: `Player ${index + 1} now follows you.`,
  href: `/profiles/player-${index + 1}`,
  readAt: null,
  createdAt: `2030-06-${String(25 - index).padStart(2, "0")}T10:00:00.000Z`,
}));
const invitation: NotificationDto = {
  ...original[21],
  kind: "group_invitation",
  title: "Pending private group invitation",
  description: "Choose explicitly whether to join the private group.",
  href: "/groups/44444444-4444-4444-8444-444444444444",
  requiresResponse: true,
};
const foreignData: InfiniteData<NotificationListResponse> = {
  pages: [
    {
      notifications: [{ ...original[0], title: "Other account private notice" }],
      unreadCount: 1,
      nextCursor: null,
    },
  ],
  pageParams: [undefined],
};
function deferred<T>() {
  let finish: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!finish) throw new Error("Expected a controlled notification response");
      finish(value);
    },
  };
}
let kind: "inbox" | "bell";
let client: QueryClient | undefined;
let notes: NotificationDto[];
let pendingWrite: ReturnType<typeof deferred<Response>>;
const reads: URL[] = [];
const writes: { method: string; path: string }[] = [];
const profileWrites: unknown[] = [];
const key = (limit: number, userId = "owner") =>
  notificationListKey({ apiUrl: sdk.apiUrl, userId, locale: "en" }, limit);
function activeClient() {
  if (!client) throw new Error("Expected the current measured notification owner");
  return client;
}
function page(cursor: string | null, limit: number): NotificationListResponse {
  const offset = cursor ? notes.findIndex((note) => note.id === cursor) + 1 : 0;
  const items = notes.slice(offset, offset + limit);
  return {
    notifications: items,
    unreadCount: notes.filter((note) => !note.readAt).length,
    nextCursor: offset + limit < notes.length ? (items.at(-1)?.id ?? null) : null,
  };
}
function cachedPages(limit: number): InfiniteData<NotificationListResponse> {
  const first = page(null, limit);
  return first.nextCursor && kind === "inbox"
    ? { pages: [first, page(first.nextCursor, limit)], pageParams: [undefined, first.nextCursor] }
    : { pages: [first], pageParams: [undefined] };
}
function renderOwner(element: ReactElement) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  reads.length = writes.length = profileWrites.length = 0;
  sdk.getToken.mockClear();
  sdk.push.mockClear();
  sdk.permission.mockClear();
  pendingWrite = deferred<Response>();
  notes =
    kind === "inbox"
      ? [...original.slice(0, 21), invitation]
      : [original[0], original[1], invitation];
  client.setQueryData(key(20), cachedPages(20));
  client.setQueryData(key(3), cachedPages(3));
  client.setQueryData(key(20, "other"), foreignData);
  client.setQueryData(key(3, "other"), foreignData);
  installBrowserIntersections();
  return renderWithI18n(
    <>
      <header>
        <div id="page-header-actions" />
      </header>
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </>,
  );
}
function cleanupOwner() {
  cleanup();
  client?.clear();
  client = undefined;
}
beforeEach(() => {
  vi.stubGlobal("Notification", { permission: "denied", requestPermission: sdk.permission });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(sdk.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fixture-notification-owner",
      );
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/profiles" && method === "PATCH") {
        const payload: unknown = JSON.parse(String(init?.body));
        profileWrites.push(payload);
        expect(payload).toEqual({ preferredLanguage: "en" });
        return Response.json({ preferredLanguage: "en" });
      }
      if (url.pathname === "/api/notifications" && method === "GET") {
        reads.push(url);
        expect(url.searchParams.get("navigation")).toBe("history");
        expect(url.searchParams.get("locale")).toBe("en");
        return Response.json(
          page(url.searchParams.get("cursor"), Number(url.searchParams.get("limit"))),
        );
      }
      if (method !== "PATCH" || url.pathname !== `/api/notifications/${original[0].id}`)
        throw new Error(`Unexpected notification request: ${method} ${url.pathname}`);
      writes.push({ method, path: url.pathname });
      const response = await pendingWrite.promise;
      if (response.ok)
        notes = notes.map((note) =>
          note.id === original[0].id ? { ...note, readAt: "2030-06-26T10:00:00.000Z" } : note,
        );
      return response;
    }),
  );
});
afterEach(() => {
  cleanupOwner();
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (sdk.previous.api === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = sdk.previous.api;
  if (sdk.previous.firebase === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  else process.env.NEXT_PUBLIC_FIREBASE_API_KEY = sdk.previous.firebase;
});
configure({
  testingLibrary: { render: renderOwner, cleanup: cleanupOwner },
  runs: 10,
  warmupRuns: 1,
});
function article(title: string) {
  const row = screen.getByText(title).closest("article");
  if (!(row instanceof HTMLElement))
    throw new Error(`Expected the actual notification article: ${title}`);
  return within(row);
}
function otherOwnerUnchanged() {
  expect(activeClient().getQueryData(key(20, "other"))).toBe(foreignData);
  expect(activeClient().getQueryData(key(3, "other"))).toBe(foreignData);
  expect(screen.queryByText("Other account private notice")).toBeNull();
}
function pendingInvitationUnchanged(limit: number) {
  const data = activeClient().getQueryData<InfiniteData<NotificationListResponse>>(key(limit));
  const current = data?.pages
    .flatMap((part) => part.notifications)
    .find((note) => note.id === invitation.id);
  expect(current).toMatchObject({ requiresResponse: true, readAt: null });
}

const inboxScenario =
  "NotificationsPage: cached paging and authoritative text stay reactive while explicit read failure rolls back before retry";
test(inboxScenario, async () => {
  kind = "inbox";
  const result = await measureRenders(<NotificationsPage />, {
    scenario: async () => {
      expect(await screen.findByText(original[0].title)).toBeVisible();
      expect(screen.queryByText(original[20].title)).toBeNull();
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Delete all notifications" }));
      const dialog = await screen.findByRole("dialog", { name: "Delete all notifications?" });
      expect(writes).toEqual([]);
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      const title = screen.getByText(original[0].title);
      notes = notes.map((note) =>
        note.id === original[0].id
          ? {
              ...note,
              title: "Updated authorized notice",
              description: "Authoritative UTF-8: città e attività.",
            }
          : note,
      );
      act(() => activeClient().setQueryData(key(20), cachedPages(20)));
      expect(await screen.findByText("Updated authorized notice")).toBe(title);
      expect(screen.getByText("Authoritative UTF-8: città e attività.")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText(original[20].title)).toBeVisible();
      expect(screen.getByText(invitation.title)).toBeVisible();
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
      fireEvent.click(
        article("Updated authorized notice").getByRole("button", { name: "Mark as read" }),
      );
      await waitFor(() => expect(writes).toHaveLength(1));
      expect(
        article("Updated authorized notice").getByRole("button", { name: "Delete notification" }),
      ).toBeDisabled();
      expect(
        article(original[1].title).getByRole("button", { name: "Delete notification" }),
      ).toBeEnabled();
      expect(screen.getByRole("button", { name: "Delete all notifications" })).toBeDisabled();
      await act(() =>
        pendingWrite.resolve(Response.json({ error: "Explicit read refused" }, { status: 400 })),
      );
      await waitFor(() =>
        expect(
          article("Updated authorized notice").getByRole("button", { name: "Mark as read" }),
        ).toBeEnabled(),
      );
      await waitFor(() => expect(activeClient().isFetching()).toBe(0));
      pendingInvitationUnchanged(20);
      pendingWrite = deferred<Response>();
      fireEvent.click(
        article("Updated authorized notice").getByRole("button", { name: "Mark as read" }),
      );
      await waitFor(() => expect(writes).toHaveLength(2));
      await act(() => pendingWrite.resolve(Response.json({ success: true })));
      await waitFor(() =>
        expect(
          article("Updated authorized notice").queryByRole("button", { name: "Mark as read" }),
        ).toBeNull(),
      );
      await waitFor(() =>
        expect(activeClient().isFetching() + activeClient().isMutating()).toBe(0),
      );
      expect(writes).toEqual([
        { method: "PATCH", path: `/api/notifications/${original[0].id}` },
        { method: "PATCH", path: `/api/notifications/${original[0].id}` },
      ]);
      expect(profileWrites).toEqual([]);
      pendingInvitationUnchanged(20);
      otherOwnerUnchanged();
    },
  });
  assertRenderMeasurement(result, inboxScenario);
});

const bellScenario =
  "NotificationBell: authoritative cached preview updates preserve pending decisions and navigate without implicit reads";
test(bellScenario, async () => {
  kind = "bell";
  const result = await measureRenders(<NotificationBell />, {
    scenario: async () => {
      await waitFor(() => expect(profileWrites).toEqual([{ preferredLanguage: "en" }]));
      await waitFor(() => expect(activeClient().isMutating()).toBe(0));
      expect(screen.getByLabelText("Notifications: 3")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
      let menu = await screen.findByRole("menu", { name: "Notifications" });
      expect(within(menu).getByText(original[0].title)).toBeVisible();
      expect(within(menu).getByText(invitation.title)).toBeVisible();
      fireEvent.keyDown(menu, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      notes = notes.map((note) =>
        note.id === original[0].id
          ? { ...note, title: "Server-refreshed preview", readAt: "2030-06-26T10:00:00.000Z" }
          : note,
      );
      act(() => activeClient().setQueryData(key(3), cachedPages(3)));
      expect(await screen.findByLabelText("Notifications: 2")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
      menu = await screen.findByRole("menu", { name: "Notifications" });
      expect(within(menu).getByText("Server-refreshed preview")).toBeVisible();
      expect(within(menu).queryByText(original[0].title)).toBeNull();
      fireEvent.click(within(menu).getByRole("menuitem", { name: new RegExp(invitation.title) }));
      expect(sdk.push).toHaveBeenCalledExactlyOnceWith(invitation.href);
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      pendingInvitationUnchanged(3);
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
      menu = await screen.findByRole("menu", { name: "Notifications" });
      fireEvent.click(within(menu).getByRole("menuitem", { name: "View all notifications" }));
      expect(sdk.push.mock.calls.map(([path]) => path)).toEqual([
        invitation.href,
        "/notifications",
      ]);
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
      expect(profileWrites).toEqual([{ preferredLanguage: "en" }]);
      expect(sdk.permission).not.toHaveBeenCalled();
      pendingInvitationUnchanged(3);
      otherOwnerUnchanged();
    },
  });
  assertRenderMeasurement(result, bellScenario);
});
