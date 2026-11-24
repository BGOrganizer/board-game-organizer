import type { NotificationDto, NotificationListResponse } from "@board-game-organizer/schemas";
import { clearSessionQueryCache, notificationListKey } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { NotificationBell } from "../NotificationBell";

const sdk = vi.hoisted(() => {
  const config = {
    NEXT_PUBLIC_FIREBASE_API_KEY: "public-fixture-key",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fixture-project",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "fixture-sender",
    NEXT_PUBLIC_FIREBASE_APP_ID: "fixture-app",
  };
  const previous = Object.fromEntries(
    Object.keys(config).map((key) => [key, process.env[key]] as const),
  );
  Object.assign(process.env, config);
  return {
    previous,
    actor: "owner",
    loaded: true,
    signedIn: true,
    getToken: vi.fn<() => Promise<string | null>>(),
    push: vi.fn(),
    permission: vi.fn<() => Promise<NotificationPermission>>(),
    supported: vi.fn<() => Promise<boolean>>(),
    firebaseToken: vi.fn<(...parameters: unknown[]) => Promise<string>>(),
    registerWorker: vi.fn(),
    initializeApp: vi.fn(),
    messaging: { fixture: "messaging" },
  };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: sdk.signedIn ? sdk.actor : null,
    isLoaded: sdk.loaded,
    isSignedIn: sdk.signedIn,
    getToken: sdk.getToken,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: sdk.push }) }));
// Firebase and the browser worker/permission surface are external I/O. The app's
// webPush adapter, NotificationBell and all shared Query/mutation hooks stay real.
vi.mock("firebase/app", () => ({
  getApps: () => [],
  getApp: () => ({ name: "fixture" }),
  initializeApp: sdk.initializeApp,
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: () => sdk.messaging,
  isSupported: sdk.supported,
  getToken: sdk.firebaseToken,
}));
const API = "https://notification-bell-requests.test";
const first: NotificationDto = {
  id: "111111111111111111111111",
  kind: "follow",
  title: "First notification",
  description: "A player now follows you.",
  href: "/profiles/friend",
  readAt: null,
  createdAt: "2030-06-02T10:00:00.000Z",
};
const second: NotificationDto = {
  ...first,
  id: "222222222222222222222222",
  title: "Second notification",
  href: "/profiles/another",
  createdAt: "2030-06-01T10:00:00.000Z",
};
const invitation: NotificationDto = {
  ...first,
  id: "333333333333333333333333",
  kind: "group_invitation",
  title: "Pending group invitation",
  href: "/groups/44444444-4444-4444-8444-444444444444",
  requiresResponse: true,
};
const replacement: NotificationDto = {
  ...first,
  id: "555555555555555555555555",
  title: "Replacement account notice",
  href: "/profiles/replacement-friend",
};
const workerRegistration = { scope: "https://web.test/" };
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
let client: QueryClient;
let notes: NotificationDto[];
let pendingInbox: Promise<Response> | undefined;
let readStatus: number, writeStatus: number;
const reads: URL[] = [];
const notificationWrites: string[] = [];
const pushWrites: { actor: string; body: unknown }[] = [];
function page(actor = "owner"): NotificationListResponse {
  const owned = actor === "owner" ? notes : [replacement];
  return {
    notifications: owned,
    unreadCount: owned.filter((note) => !note.readAt).length,
    nextCursor: null,
  };
}
function listKey(actor = sdk.actor) {
  return notificationListKey({ apiUrl: API, userId: actor, locale: "en" }, 3);
}
beforeEach(() => {
  vi.clearAllMocks();
  sdk.actor = "owner";
  sdk.loaded = sdk.signedIn = true;
  sdk.getToken.mockImplementation(async () => `token-${sdk.actor}`);
  sdk.permission.mockResolvedValue("granted");
  sdk.supported.mockResolvedValue(true);
  sdk.firebaseToken.mockResolvedValue("browser-fcm-fixture-token");
  sdk.initializeApp.mockReturnValue({ name: "fixture" });
  sdk.registerWorker.mockResolvedValue(workerRegistration);
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_VAPID_KEY", "public-fixture-vapid");
  vi.stubGlobal("Notification", { permission: "denied", requestPermission: sdk.permission });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: sdk.registerWorker },
  });
  notes = [first];
  pendingInbox = undefined;
  readStatus = writeStatus = 200;
  reads.length = notificationWrites.length = pushWrites.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      const authorization = new Headers(init?.headers).get("authorization");
      const actor =
        authorization === "Bearer token-owner"
          ? "owner"
          : authorization === "Bearer token-replacement"
            ? "replacement"
            : "invalid";
      expect(actor).not.toBe("invalid");
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/profiles" && method === "PATCH")
        return Response.json({ preferredLanguage: "en" });
      if (url.pathname === "/api/push-subscriptions" && method === "POST") {
        pushWrites.push({ actor, body: JSON.parse(String(init?.body)) });
        return Response.json({ success: true });
      }
      if (url.pathname === "/api/notifications" && method === "GET") {
        reads.push(url);
        if (pendingInbox && actor === "owner") return pendingInbox;
        return Response.json(readStatus === 200 ? page(actor) : { error: "Inbox unavailable" }, {
          status: readStatus,
        });
      }
      if (/^\/api\/notifications(?:\/[a-f\d]{24})?$/.test(url.pathname) && method === "PATCH") {
        notificationWrites.push(url.pathname);
        if (writeStatus === 200) {
          const id = url.pathname.split("/")[3];
          notes = notes.map((note) =>
            (!id || note.id === id) && !note.requiresResponse
              ? { ...note, readAt: "2030-06-03T12:00:00.000Z" }
              : note,
          );
        }
        return Response.json({ success: writeStatus === 200 }, { status: writeStatus });
      }
      throw new Error(`Unexpected bell request: ${method} ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalServiceWorker)
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
  else Reflect.deleteProperty(navigator, "serviceWorker");
});
afterAll(() => {
  for (const [key, value] of Object.entries(sdk.previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>
  );
}
function mount() {
  return renderWithI18n(<Fixture />);
}
async function openBell() {
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  return screen.findByRole("menu", { name: "Notifications" });
}

it.each([
  [false, false],
  [true, false],
])(
  "does not read or sync a private inbox before loaded/signed-in %s/%s",
  async (loaded, signedIn) => {
    sdk.loaded = loaded;
    sdk.signedIn = signedIn;
    mount();
    await openBell();
    expect(screen.getByText("Loading notifications")).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "View all notifications" }));
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith("/notifications");
    expect(sdk.getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("keeps pending and failed inbox states distinct from empty, and accepts a fresh Query recovery without reading notices", async () => {
  let finish: (response: Response) => void = () => {};
  pendingInbox = new Promise((resolve) => {
    finish = resolve;
  });
  mount();
  await openBell();
  expect(await screen.findByText("Loading notifications")).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Loading notifications" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.queryByText("No notifications yet")).toBeNull();
  await act(async () => finish(Response.json({ error: "Inbox unavailable" }, { status: 400 })));
  expect(await screen.findByText("Could not load notifications")).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Could not load notifications" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.queryByText("No notifications yet")).toBeNull();
  pendingInbox = undefined;
  notes = [];
  await act(async () => client.invalidateQueries({ queryKey: listKey(), exact: true }));
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(screen.queryByText("Could not load notifications")).toBeNull();
  expect(notificationWrites).toHaveLength(0);
});

it("loads the real three-item preview and keeps opening/closing it free of implicit notice acknowledgments", async () => {
  notes = [first, second, invitation];
  mount();
  await openBell();
  await screen.findByText(invitation.title);
  expect(reads).toHaveLength(1);
  expect(reads[0].searchParams.get("limit")).toBe("3");
  expect(reads[0].searchParams.get("navigation")).toBe("history");
  expect(reads[0].searchParams.get("locale")).toBe("en");
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await openBell();
  await screen.findByText(first.title);
  expect(notificationWrites).toHaveLength(0);
  expect(sdk.permission).not.toHaveBeenCalled();
  expect(sdk.registerWorker).not.toHaveBeenCalled();
});

it.each([false, true])(
  "opens the current notice destination while preserving invitation consent (invitation=%s)",
  async (pendingInvitation) => {
    const note = pendingInvitation ? invitation : first;
    notes = [note];
    mount();
    await openBell();
    fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(note.title) }));
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith(note.href);
    if (pendingInvitation) expect(notificationWrites).toHaveLength(0);
    else {
      await waitFor(() => expect(notificationWrites).toEqual([`/api/notifications/${note.id}`]));
      await waitFor(() =>
        expect(
          client.getQueryData<{ pages: NotificationListResponse[] }>(listKey())?.pages[0]
            .notifications[0].readAt,
        ).not.toBeNull(),
      );
    }
  },
);

it("marks ordinary notices read through the real owned mutation while keeping pending invitation consent unread", async () => {
  notes = [first, second, invitation];
  mount();
  await openBell();
  await screen.findByText(invitation.title);
  fireEvent.click(screen.getByRole("menuitem", { name: "Mark all as read" }));
  await waitFor(() => expect(notificationWrites).toEqual(["/api/notifications"]));
  await waitFor(() =>
    expect(
      client.getQueryData<{ pages: NotificationListResponse[] }>(listKey())?.pages[0].unreadCount,
    ).toBe(1),
  );
  expect(
    client
      .getQueryData<{ pages: NotificationListResponse[] }>(listKey())
      ?.pages[0].notifications.find((note) => note.id === invitation.id)?.readAt,
  ).toBeNull();
});

it("rolls back a rejected read receipt without fabricating a successful acknowledgment or blocking deliberate navigation", async () => {
  writeStatus = 400;
  mount();
  await openBell();
  fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(first.title) }));
  await waitFor(() =>
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.status === "error"),
    ).toBe(true),
  );
  expect(
    client.getQueryData<{ pages: NotificationListResponse[] }>(listKey())?.pages[0].notifications[0]
      .readAt,
  ).toBeNull();
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith(first.href);
});

it("keeps a late previous-account inbox result out of the currently open preview", async () => {
  let finish: (response: Response) => void = () => {};
  pendingInbox = new Promise((resolve) => {
    finish = resolve;
  });
  const view = mount();
  await openBell();
  await waitFor(() => expect(reads).toHaveLength(1));
  sdk.actor = "replacement";
  view.rerender(<Fixture />);
  expect(await screen.findByText(replacement.title)).toBeVisible();
  await act(async () => finish(Response.json(page("owner"))));
  expect(screen.queryByText(first.title)).toBeNull();
  expect(screen.getByText(replacement.title)).toBeVisible();
  expect(notificationWrites).toHaveLength(0);
});

it("coalesces explicit permission and granted-state registration through the actual Firebase adapter and owned push request", async () => {
  vi.stubGlobal("Notification", { permission: "default", requestPermission: sdk.permission });
  const view = mount();
  await openBell();
  expect(sdk.permission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Enable push notifications" }));
  await waitFor(() => expect(pushWrites).toHaveLength(1));
  expect(pushWrites[0]).toEqual({
    actor: "owner",
    body: { token: "browser-fcm-fixture-token", platform: "web", locale: "en" },
  });
  expect(sdk.permission).toHaveBeenCalledOnce();
  expect(sdk.registerWorker).toHaveBeenCalledExactlyOnceWith("/firebase-messaging-sw.js");
  expect(sdk.firebaseToken).toHaveBeenCalledExactlyOnceWith(sdk.messaging, {
    serviceWorkerRegistration: workerRegistration,
    vapidKey: "public-fixture-vapid",
  });
  view.rerender(<Fixture />);
  expect(pushWrites).toHaveLength(1);
  expect(notificationWrites).toHaveLength(0);
});

it("shows an unsupported browser push failure through the real adapter without sending a subscription", async () => {
  vi.stubGlobal("Notification", { permission: "default", requestPermission: sdk.permission });
  sdk.supported.mockResolvedValue(false);
  mount();
  await openBell();
  fireEvent.click(screen.getByRole("menuitem", { name: "Enable push notifications" }));
  expect(await screen.findByText("Could not enable push notifications")).toBeVisible();
  expect(pushWrites).toHaveLength(0);
  expect(sdk.registerWorker).not.toHaveBeenCalled();
});

it("does not register an old account's pending Firebase result after the session owner changes", async () => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: sdk.permission });
  let finish: (token: string) => void = () => {};
  sdk.firebaseToken.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = mount();
  await waitFor(() => expect(sdk.firebaseToken).toHaveBeenCalledOnce());
  sdk.actor = "replacement";
  view.rerender(<Fixture />);
  await act(async () => finish("old-owner-fcm-token"));
  await waitFor(() => expect(pushWrites).toHaveLength(1));
  expect(pushWrites[0]).toEqual({
    actor: "replacement",
    body: { token: "browser-fcm-fixture-token", platform: "web", locale: "en" },
  });
  expect(sdk.permission).not.toHaveBeenCalled();
});

it.each([
  { label: "unavailable browser API", absent: true },
  { label: "explicit browser denial", absent: false },
])("keeps notifications available after $label without registering push", async ({ absent }) => {
  vi.stubGlobal(
    "Notification",
    absent ? undefined : { permission: "default", requestPermission: sdk.permission },
  );
  sdk.permission.mockResolvedValueOnce("denied");
  mount();
  await openBell();
  expect(await screen.findByText(first.title)).toBeVisible();
  if (!absent) {
    fireEvent.click(screen.getByRole("menuitem", { name: "Enable push notifications" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(sdk.permission).toHaveBeenCalledOnce();
    await openBell();
    expect(await screen.findByText(first.title)).toBeVisible();
  }
  expect(screen.queryByRole("menuitem", { name: "Enable push notifications" })).toBeNull();
  expect(sdk.firebaseToken).not.toHaveBeenCalled();
  expect(sdk.registerWorker).not.toHaveBeenCalled();
  expect(pushWrites).toEqual([]);
  expect(notificationWrites).toEqual([]);
});

it("continues with the new account's authorized push registration after the previous promise rejects", async () => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: sdk.permission });
  let rejectOld: (error: Error) => void = () => {
    throw new Error("Expected a pending previous account Firebase operation");
  };
  sdk.firebaseToken.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
  );
  const view = mount();
  await waitFor(() => expect(sdk.firebaseToken).toHaveBeenCalledOnce());
  sdk.actor = "replacement";
  view.rerender(<Fixture />);
  await act(() => rejectOld(new Error("Previous browser push registration failed")));
  await waitFor(() => expect(pushWrites).toHaveLength(1));
  expect(pushWrites[0]).toEqual({
    actor: "replacement",
    body: { token: "browser-fcm-fixture-token", platform: "web", locale: "en" },
  });
  expect(await screen.findByLabelText("Notifications: 1")).toBeVisible();
  expect(notificationWrites).toEqual([]);
});
