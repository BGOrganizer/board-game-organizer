import { URL } from "node:url";
import { notificationListKey } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react-native";
import { createContext, useContext, useMemo } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationBadgeSync } from "../NotificationBadgeSync";

const API = "https://badge-sync.fixture.test";
const boundary = vi.hoisted(() => ({
  token: vi.fn(),
  badge: vi.fn(),
  report: vi.fn(),
  permissions: vi.fn(),
  removePush: vi.fn(),
}));
type Session = {
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  sessionId: string | null;
};
const authenticated: Session = {
  loaded: true,
  signedIn: true,
  userId: "badge-owner",
  sessionId: "badge-session",
};
const SessionContext = createContext(authenticated);
vi.mock("@clerk/expo", () => ({
  useAuth: () => {
    const owner = useContext(SessionContext);
    return {
      isLoaded: owner.loaded,
      isSignedIn: owner.signedIn,
      userId: owner.userId,
      sessionId: owner.sessionId,
      getToken: boundary.token,
    };
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://badge-sync.fixture.test" } },
  },
}));
vi.mock("@sentry/react-native", () => ({ captureException: boundary.report }));
let received: (() => void) | undefined;
vi.mock("expo-notifications", () => ({
  setBadgeCountAsync: boundary.badge,
  getPermissionsAsync: boundary.permissions,
  addNotificationReceivedListener: (callback: () => void) => {
    received = callback;
    return { remove: boundary.removePush };
  },
}));

// Actual React, Lingui, session adapter, Query and shared sync hooks. HTTP,
// Clerk and OS badge/push/AppState ports only; this is not push-delivery proof.
let client: QueryClient;
let calls: {
  path: string;
  method: string;
  locale: string | null;
  body: unknown;
  authorization: string | null;
}[];
let unexpected: string[];
let unread: number;
let status: number;
let notificationGate: Promise<void> | undefined;
let foreground: ((state: AppStateStatus) => void) | undefined;
let removedAppState: ReturnType<typeof vi.fn<() => void>>;
function response(body: unknown, code = 200) {
  return new Response(JSON.stringify(body), {
    status: code,
    headers: { "Content-Type": "application/json" },
  });
}
async function http(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const method = init?.method ?? "GET";
  const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  const authorization = new Headers(init?.headers).get("Authorization");
  calls.push({
    path: url.pathname,
    method,
    locale: url.searchParams.get("locale"),
    body,
    authorization,
  });
  if (url.origin !== API || authorization !== "Bearer badge-token") {
    unexpected.push(`${method} ${url}`);
    throw new Error("Unowned badge request");
  }
  if (method === "PATCH" && url.pathname === "/api/profiles") return response(body);
  if (method === "GET" && url.pathname === "/api/notifications") {
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("navigation")).toBe("history");
    await notificationGate;
    if (init?.signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    return response({ notifications: [], unreadCount: unread, nextCursor: null }, status);
  }
  unexpected.push(`${method} ${url}`);
  throw new Error("Unexpected badge request");
}
function Fixture({
  session = authenticated,
  locale = "en",
}: {
  session?: Session;
  locale?: string;
}) {
  const i18n = useMemo(() => setupI18n({ locale, messages: { [locale]: {} } }), [locale]);
  return (
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <SessionContext value={session}>
          <NotificationBadgeSync />
        </SessionContext>
      </I18nProvider>
    </QueryClientProvider>
  );
}
const reads = () => calls.filter((call) => call.path === "/api/notifications");
beforeEach(() => {
  calls = [];
  unexpected = [];
  unread = 3;
  status = 200;
  notificationGate = undefined;
  foreground = undefined;
  received = undefined;
  boundary.token.mockReset().mockResolvedValue("badge-token");
  boundary.badge.mockReset().mockResolvedValue(true);
  boundary.report.mockReset();
  boundary.permissions.mockReset();
  boundary.removePush.mockReset();
  removedAppState = vi.fn<() => void>();
  vi.spyOn(AppState, "addEventListener").mockImplementation((event, callback) => {
    expect(event).toBe("change");
    foreground = callback;
    return { remove: removedAppState };
  });
  vi.stubGlobal("fetch", vi.fn(http));
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
});
afterEach(async () => {
  await cleanup();
  await client.cancelQueries();
  client.clear();
  expect(unexpected).toEqual([]);
  expect(boundary.permissions).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["it", "it-IT"])(
  "syncs actual %s locale and a three-item notification summary independently of push permission",
  async (locale) => {
    await render(<Fixture locale={locale} />);
    await waitFor(() => expect(boundary.badge).toHaveBeenCalledWith(3));
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/api/profiles",
          method: "PATCH",
          body: { preferredLanguage: "it" },
        }),
        expect.objectContaining({
          path: "/api/notifications",
          method: "GET",
          locale: "it",
        }),
      ]),
    );
    expect(boundary.token).toHaveBeenCalledTimes(2);
  },
);

it("does not read or sync private data after sign-out and clears the native badge", async () => {
  await render(
    <Fixture
      locale="it-IT"
      session={{
        ...authenticated,
        signedIn: false,
        userId: null,
        sessionId: null,
      }}
    />,
  );
  await waitFor(() => expect(boundary.badge).toHaveBeenCalledExactlyOnceWith(0));
  expect(calls).toEqual([]);
  expect(boundary.token).not.toHaveBeenCalled();
  expect(foreground).toBeUndefined();
  expect(received).toBeUndefined();
});

it("waits for Clerk restoration before reading, syncing or mutating the OS badge", async () => {
  const view = await render(<Fixture session={{ ...authenticated, loaded: false }} />);
  expect(calls).toEqual([]);
  expect(boundary.badge).not.toHaveBeenCalled();
  expect(boundary.token).not.toHaveBeenCalled();
  await view.rerender(<Fixture />);
  await waitFor(() => expect(boundary.badge).toHaveBeenCalledWith(3));
});

it("preserves the existing OS badge while the first authoritative summary is unresolved", async () => {
  let release!: () => void;
  notificationGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await render(<Fixture />);
  await waitFor(() => expect(reads()).toHaveLength(1));
  expect(boundary.badge).not.toHaveBeenCalled();
  await act(() => release());
  await waitFor(() => expect(boundary.badge).toHaveBeenCalledExactlyOnceWith(3));
});

it("does not turn an initial remote summary failure into a fabricated zero badge", async () => {
  status = 503;
  await render(<Fixture />);
  await waitFor(() =>
    expect(
      client.getQueryState(
        notificationListKey({ apiUrl: API, userId: authenticated.userId, locale: "en" }, 3),
      )?.status,
    ).toBe("error"),
  );
  expect(boundary.badge).not.toHaveBeenCalled();
  expect(reads()).toHaveLength(1);
});

it("forwards rejected OS badge updates to the actual Sentry boundary", async () => {
  const failure = new Error("Native badge unavailable");
  boundary.badge.mockRejectedValue(failure);
  await render(<Fixture />);
  await waitFor(() => expect(boundary.report).toHaveBeenCalledWith(failure));
});

it("updates its badge from an authoritative notification cache receipt without another HTTP read", async () => {
  await render(<Fixture />);
  await waitFor(() => expect(boundary.badge).toHaveBeenCalledWith(3));
  await act(() =>
    client.setQueryData(
      notificationListKey({ apiUrl: API, userId: authenticated.userId, locale: "en" }, 3),
      {
        pages: [{ notifications: [], unreadCount: 1, nextCursor: null }],
        pageParams: [undefined],
      },
    ),
  );
  await waitFor(() => expect(boundary.badge).toHaveBeenLastCalledWith(1));
  expect(reads()).toHaveLength(1);
});

it("refreshes on foreground entry and received notifications, but not inactive/background transitions", async () => {
  await render(<Fixture />);
  await waitFor(() => expect(boundary.badge).toHaveBeenCalledWith(3));
  await act(() => {
    foreground?.("inactive");
    foreground?.("background");
  });
  expect(reads()).toHaveLength(1);
  unread = 2;
  await act(() => foreground?.("active"));
  await waitFor(() => expect(boundary.badge).toHaveBeenLastCalledWith(2));
  expect(reads()).toHaveLength(2);
  unread = 1;
  await act(() => received?.());
  await waitFor(() => expect(boundary.badge).toHaveBeenLastCalledWith(1));
  expect(reads()).toHaveLength(3);
});

it("rebinds locale-owned reads and background preference sync without duplicate OS listeners", async () => {
  const view = await render(<Fixture />);
  await waitFor(() => expect(boundary.badge).toHaveBeenCalledWith(3));
  await view.rerender(<Fixture locale="it" />);
  await waitFor(() =>
    expect(
      calls.some(
        (call) =>
          call.method === "PATCH" &&
          JSON.stringify(call.body) === JSON.stringify({ preferredLanguage: "it" }),
      ),
    ).toBe(true),
  );
  await waitFor(() => expect(reads().map((call) => call.locale)).toEqual(["en", "it"]));
  expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
  expect(boundary.removePush).not.toHaveBeenCalled();
});

it("removes foreground and push subscriptions on sign-out and final unmount", async () => {
  const view = await render(<Fixture />);
  await waitFor(() => expect(boundary.badge).toHaveBeenCalledWith(3));
  await view.rerender(
    <Fixture
      session={{
        ...authenticated,
        signedIn: false,
        userId: null,
        sessionId: null,
      }}
    />,
  );
  expect(removedAppState).toHaveBeenCalledOnce();
  expect(boundary.removePush).toHaveBeenCalledOnce();
  await waitFor(() => expect(boundary.badge).toHaveBeenLastCalledWith(0));
  await view.unmount();
  expect(removedAppState).toHaveBeenCalledOnce();
  expect(boundary.removePush).toHaveBeenCalledOnce();
});
