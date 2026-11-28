import { groupRecordMemberRoles } from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  groupRecordKeys,
  relationshipListKey,
} from "@board-game-organizer/shared";
import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { Linking, StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { Startup } from "../Startup";

const API = "https://startup-fixtures.test";
const boundary = vi.hoisted(() => ({
  hideSplash: vi.fn(),
  revealSplash: vi.fn(),
  report: vi.fn(),
  token: vi.fn(),
  permission: vi.fn(),
  requestPermission: vi.fn(),
  contacts: vi.fn(),
  badge: vi.fn(),
  removeNotifications: vi.fn(),
}));
type Session = {
  loaded: boolean;
  restored: boolean | undefined;
  active: boolean | undefined;
  userLoaded: boolean;
  userId: string | null;
  sessionId: string | null;
  mobileNumber: string | undefined;
  pathname: string;
  getToken?: () => Promise<string>;
};
const initialSession: Session = {
  loaded: true,
  restored: true,
  active: true,
  userLoaded: true,
  userId: "startup-owner",
  sessionId: "startup-session",
  mobileNumber: "fixture phone",
  pathname: "/groups",
};
const SessionContext = createContext(initialSession);
vi.mock("@clerk/expo", () => ({
  useAuth: (options?: { treatPendingAsSignedOut?: boolean }) => {
    const session = useContext(SessionContext);
    return {
      isLoaded: session.loaded,
      isSignedIn: options?.treatPendingAsSignedOut === false ? session.restored : session.active,
      userId: session.userId,
      sessionId: session.sessionId,
      getToken: session.getToken ?? boundary.token,
    };
  },
  useUser: () => {
    const session = useContext(SessionContext);
    return {
      isLoaded: session.userLoaded,
      user: { id: session.userId, unsafeMetadata: { mobileNumber: session.mobileNumber } },
    };
  },
}));
const navigation = {
  isReady: () => false,
  getRootState: () => undefined,
  addListener: () => () => {},
};
vi.mock("expo-router", () => ({
  usePathname: () => useContext(SessionContext).pathname,
  useNavigationContainerRef: () => navigation,
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://startup-fixtures.test" } } },
}));
// The existing native splash adapter is the device boundary. Startup, its
// animated React content, shared warmup workers and Query implementation are real.
vi.mock("@/lib/splash", () => ({
  hideStartupSplash: boundary.hideSplash,
  revealStartupSplash: boundary.revealSplash,
}));
vi.mock("@sentry/react-native", () => ({ captureException: boundary.report }));
vi.mock("expo-updates", () => ({
  isEnabled: false,
  checkAutomatically: "NEVER",
  UpdatesCheckAutomaticallyValue: { NEVER: "NEVER" },
}));
vi.mock("expo-contacts", () => ({
  getPermissionsAsync: boundary.permission,
  requestPermissionsAsync: boundary.requestPermission,
  ContactField: { FULL_NAME: "fullName", EMAILS: "emails", PHONES: "phones" },
  ContactsSortOrder: { GivenName: "givenName" },
  Contact: { getAllDetails: boundary.contacts },
}));
vi.mock("expo-notifications", () => ({
  setBadgeCountAsync: boundary.badge,
  addNotificationReceivedListener: () => ({ remove: boundary.removeNotifications }),
}));

type HttpCall = { path: string; method: string; token: string | null; url: URL };
let client: QueryClient;
let calls: HttpCall[];
let unexpected: string[];
let tokenSequence: number;
let firstReadGate: Promise<void> | undefined;
let favoriteLocationsGate: Promise<void> | undefined;
let tableStatus: number;
const options = { apiUrl: API, userId: "startup-owner" };
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
async function syntheticHttp(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const path = url.pathname;
  const method = init?.method ?? "GET";
  const token = new Headers(init?.headers).get("Authorization");
  calls.push({ path, method, token, url });
  if (url.origin !== API || !token?.startsWith("Bearer fixture-")) {
    unexpected.push(`${method} ${url}`);
    throw Error("Unowned startup request");
  }
  if (
    method === "GET" &&
    ["/api/tables", "/api/groups", "/api/events", "/api/profiles"].includes(path)
  ) {
    await firstReadGate;
    return path === "/api/profiles"
      ? response({ id: "startup-owner", name: "Startup owner", preferredLanguage: "en" })
      : response({ items: [], nextCursor: null }, path === "/api/tables" ? tableStatus : 200);
  }
  if (method === "GET" && path === "/api/locations/favorites") {
    await favoriteLocationsGate;
    return response({ items: [], nextCursor: null });
  }
  if (method === "GET" && path === "/api/bgg/account")
    return response({ active: null, pending: null });
  if (method === "GET" && path === "/api/notifications")
    return response({ notifications: [], unreadCount: 0, nextCursor: null });
  if (method === "GET" && path === "/api/relationships")
    return response({ rows: [], nextCursor: null });
  if (method === "GET" && path === "/api/users/suggestions")
    return response({ users: [], hasContacts: false, nextCursor: null });
  if (method === "PATCH" && path === "/api/profiles") {
    const body = JSON.parse(String(init?.body));
    if (
      !Object.keys(body).every((key) => key === "preferredLanguage") ||
      !["en", "it"].includes(body.preferredLanguage)
    ) {
      unexpected.push("Unexpected profile mutation");
      throw Error("Unexpected profile mutation");
    }
    return response(body);
  }
  if (method === "POST" && path === "/api/contacts/sync")
    return response({ registeredIdentifiers: { emails: [], phoneNumbers: [] } });
  unexpected.push(`${method} ${url}`);
  throw Error("Unexpected startup request");
}
function Fixture({
  session = initialSession,
  restoring = false,
  notification = null,
  notificationPending = false,
  locale = "en",
  startedAt,
}: {
  session?: Session;
  restoring?: boolean;
  notification?: string | null;
  notificationPending?: boolean;
  locale?: "en" | "it";
  startedAt: number;
}) {
  return (
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={restoring}>
        <NativeTestProviders locale={locale}>
          <SessionContext value={session}>
            <Startup
              startedAt={startedAt}
              initialNotificationHref={notificationPending ? undefined : notification}
            />
          </SessionContext>
        </NativeTestProviders>
      </IsRestoringProvider>
    </QueryClientProvider>
  );
}
function splashHost() {
  const hosts = screen.container.queryAll(
    (node) =>
      node.props.pointerEvents === "none" &&
      typeof node.props.onLayout === "function" &&
      StyleSheet.flatten(node.props.style)?.zIndex === 100,
  );
  expect(hosts).toHaveLength(1);
  return hosts[0];
}

beforeEach(() => {
  calls = [];
  unexpected = [];
  tokenSequence = 0;
  tableStatus = 200;
  firstReadGate = undefined;
  favoriteLocationsGate = undefined;
  boundary.hideSplash.mockReset();
  boundary.revealSplash.mockReset();
  boundary.report.mockReset();
  boundary.token.mockReset().mockImplementation(async () => `fixture-${++tokenSequence}`);
  boundary.permission.mockReset().mockResolvedValue({ granted: false });
  boundary.requestPermission.mockReset();
  boundary.contacts.mockReset().mockResolvedValue([]);
  boundary.badge.mockReset().mockResolvedValue(true);
  boundary.removeNotifications.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal("fetch", vi.fn(syntheticHttp));
  vi.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => {
    await client.cancelQueries();
    client.clear();
  });
  expect(unexpected).toEqual([]);
  expect(boundary.requestPermission).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("gates real priority reads on authentication, owned restoration and the initial link", async () => {
  const link = pending<string | null>(),
    reads = pending<void>();
  vi.mocked(Linking.getInitialURL).mockReturnValueOnce(link.promise);
  firstReadGate = reads.promise;
  const startedAt = Date.now();
  const view = await render(
    <Fixture startedAt={startedAt} session={{ ...initialSession, loaded: false }} />,
  );
  await fireEvent.layout(splashHost(), { x: 0, y: 0, width: 390, height: 844 });
  expect(boundary.revealSplash).toHaveBeenCalledOnce();
  expect(calls).toEqual([]);
  await view.rerender(<Fixture startedAt={startedAt} restoring />);
  expect(calls).toEqual([]);
  await view.rerender(<Fixture startedAt={startedAt} notificationPending />);
  expect(calls).toEqual([]);
  await act(() => link.resolve(null));
  expect(calls).toEqual([]);
  await view.rerender(<Fixture startedAt={startedAt} />);
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls.map((call) => call.path)).toEqual(["/api/tables", "/api/groups", "/api/events"]);
  expect(boundary.hideSplash).not.toHaveBeenCalled();
  expect(boundary.permission).not.toHaveBeenCalled();
  await act(() => reads.resolve());
  await waitFor(() => expect(boundary.hideSplash).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(client.getQueryData(relationshipListKey(API, "startup-owner", "blocked"))).toBeDefined(),
  );
  expect(client.getQueryData(["profile", API, "startup-owner"])).toMatchObject({
    id: "startup-owner",
  });
  expect(client.getQueryData(eventRecordKeys.tables(options, null))).toMatchObject({
    pages: [{ items: [], nextCursor: null }],
  });
  const group = calls.find((call) => call.path === "/api/groups");
  expect(group?.url.searchParams.get("type")).toBe("PRIVATE");
  expect(group?.url.searchParams.get("roles")).toBe("administrator,moderator,member,pending");
  expect(calls.every((call) => !call.url.searchParams.has("cursor"))).toBe(true);
  expect(new Set(calls.map((call) => call.token)).size).toBe(calls.length);
  expect(boundary.contacts).not.toHaveBeenCalled();
});

it.each(["signed-out", "onboarding"] as const)(
  "releases %s immediately without authenticated warmup",
  async (mode) => {
    const session =
      mode === "signed-out"
        ? { ...initialSession, restored: false, active: false, userId: null, sessionId: null }
        : { ...initialSession, mobileNumber: undefined };
    await render(<Fixture startedAt={Date.now()} session={session} />);
    await waitFor(() => expect(boundary.hideSplash).toHaveBeenCalledOnce());
    expect(
      calls.some((call) => ["/api/tables", "/api/groups", "/api/events"].includes(call.path)),
    ).toBe(false);
    expect(boundary.permission).not.toHaveBeenCalled();
    if (mode === "signed-out") expect(calls).toEqual([]);
  },
);

it("keeps a cached deep link ahead of list warmups until its actual route settles", async () => {
  vi.mocked(Linking.getInitialURL).mockResolvedValue("bgo-dev:///group/deep-link-group");
  client.setQueryData(groupRecordKeys.detail(options, "deep-link-group"), {
    id: "deep-link-group",
    name: "Cached group",
  });
  const startedAt = Date.now();
  const view = await render(<Fixture startedAt={startedAt} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(boundary.hideSplash).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
  await view.rerender(
    <Fixture
      startedAt={startedAt}
      session={{ ...initialSession, pathname: "/group/deep-link-group" }}
    />,
  );
  await waitFor(() => expect(boundary.hideSplash).toHaveBeenCalledOnce());
  expect(client.getQueryData(groupRecordKeys.detail(options, "deep-link-group"))).toMatchObject({
    name: "Cached group",
  });
  await waitFor(() => expect(calls.some((call) => call.path === "/api/groups")).toBe(true));
});

it("uses the original five-second budget even while authentication and deep-link promises remain pending", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const link = pending<string | null>();
  vi.mocked(Linking.getInitialURL).mockReturnValueOnce(link.promise);
  const view = await render(
    <Fixture startedAt={Date.now() - 4900} session={{ ...initialSession, loaded: false }} />,
  );
  splashHost();
  await act(() => vi.advanceTimersByTimeAsync(99));
  expect(boundary.hideSplash).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(boundary.hideSplash).toHaveBeenCalledOnce();
  expect(calls).toEqual([]);
  await view.unmount();
  await act(() => link.resolve("bgo:///group/late-private-link"));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(boundary.hideSplash).toHaveBeenCalledOnce();
  expect(calls).toEqual([]);
});

it("prioritizes a notification destination over a different initial URL and reacts to newly cached detail", async () => {
  vi.mocked(Linking.getInitialURL).mockResolvedValue("bgo:///group/unselected-link");
  await render(
    <Fixture
      startedAt={Date.now()}
      notification="/event/push-event?source=notification"
      session={{ ...initialSession, pathname: "/event/push-event" }}
    />,
  );
  expect(boundary.hideSplash).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
  await act(() =>
    client.setQueryData(eventRecordKeys.detail(options, "push-event"), {
      id: "push-event",
      name: "Authoritative event detail",
    }),
  );
  await waitFor(() => expect(boundary.hideSplash).toHaveBeenCalledOnce());
  expect(client.getQueryData(groupRecordKeys.detail(options, "unselected-link"))).toBeUndefined();
  await waitFor(() => expect(calls.some((call) => call.path === "/api/tables")).toBe(true));
});

it("retains a failed priority query as an observable error while allowing startup to finish", async () => {
  tableStatus = 503;
  await render(<Fixture startedAt={Date.now()} />);
  await waitFor(() => expect(boundary.hideSplash).toHaveBeenCalledOnce());
  expect(client.getQueryState(eventRecordKeys.tables(options, null))?.status).toBe("error");
  expect(client.getQueryData(eventRecordKeys.tables(options, null))).toBeUndefined();
  expect(
    client.getQueryData(
      groupRecordKeys.list(options, "mine", "", groupRecordMemberRoles, "PRIVATE"),
    ),
  ).toBeDefined();
});

it("falls back to the ordinary cached startup when the native initial URL lookup rejects", async () => {
  vi.mocked(Linking.getInitialURL).mockRejectedValueOnce(Error("Initial URL unavailable"));
  await render(<Fixture startedAt={Date.now()} />);
  await waitFor(() => expect(boundary.hideSplash).toHaveBeenCalledOnce());
  expect(client.getQueryData(["profile", API, "startup-owner"])).toMatchObject({
    id: "startup-owner",
  });
});

it("stops the priority worker continuation after unmount instead of warming later private datasets", async () => {
  const reads = pending<void>();
  firstReadGate = reads.promise;
  const view = await render(<Fixture startedAt={Date.now()} />);
  await waitFor(() => expect(calls).toHaveLength(3));
  await view.unmount();
  await act(() => reads.resolve());
  expect(calls).toHaveLength(3);
  expect(calls.some((call) => call.path === "/api/profiles")).toBe(false);
  expect(boundary.hideSplash).not.toHaveBeenCalled();
  expect(boundary.permission).not.toHaveBeenCalled();
});

it("refreshes locale-owned background data without restarting settled priority reads or contact sync", async () => {
  const startedAt = Date.now();
  const view = await render(<Fixture startedAt={startedAt} />);
  await waitFor(() =>
    expect(client.getQueryData(relationshipListKey(API, "startup-owner", "blocked"))).toBeDefined(),
  );
  const initialTables = calls.filter((call) => call.path === "/api/tables").length;
  await view.rerender(<Fixture startedAt={startedAt} locale="it" />);
  await waitFor(() =>
    expect(
      calls.some(
        (call) =>
          call.path === "/api/notifications" && call.url.searchParams.get("locale") === "it",
      ),
    ).toBe(true),
  );
  expect(calls.filter((call) => call.path === "/api/tables")).toHaveLength(initialTables);
  expect(calls.some((call) => call.path === "/api/contacts/sync")).toBe(false);
});

it("warms only granted native contacts pages and stores the actual registered-sync receipt", async () => {
  boundary.permission.mockResolvedValue({ granted: true });
  await render(<Fixture startedAt={Date.now()} />);
  await waitFor(() =>
    expect(client.getQueryData(["contact-sync", API, "startup-owner"])).toBeDefined(),
  );
  expect(boundary.contacts.mock.calls.map(([, page]) => page.limit).sort((a, b) => a - b)).toEqual([
    40, 200,
  ]);
  expect(client.getQueryData(["device-contacts", API, "startup-owner"])).toEqual([]);
  expect(client.getQueryData(["contact-sync", API, "startup-owner"])).toEqual({
    submitted: { emails: [], phoneNumbers: [] },
    registered: { emails: [], phoneNumbers: [] },
  });
  expect(calls.filter((call) => call.path === "/api/contacts/sync")).toHaveLength(1);
});

it("reports native permission failures without converting startup into a contacts prompt", async () => {
  const failure = Error("native contacts unavailable");
  boundary.permission.mockRejectedValue(failure);
  await render(<Fixture startedAt={Date.now()} />);
  await waitFor(() =>
    expect(boundary.report).toHaveBeenCalledWith(failure, {
      tags: { operation: "contacts.startup-page" },
    }),
  );
  await waitFor(() =>
    expect(boundary.report).toHaveBeenCalledWith(failure, {
      tags: { operation: "contacts.startup-sync" },
    }),
  );
  expect(boundary.contacts).not.toHaveBeenCalled();
  expect(boundary.hideSplash).toHaveBeenCalledOnce();
});

it("rejects late granted-contact callbacks after unmount without recreating private device data", async () => {
  const permission = pending<{ granted: boolean }>();
  boundary.permission.mockReturnValue(permission.promise);
  const view = await render(<Fixture startedAt={Date.now()} />);
  await waitFor(() => expect(boundary.permission).toHaveBeenCalledTimes(2));
  await view.unmount();
  await act(() => permission.resolve({ granted: true }));
  expect(boundary.contacts).not.toHaveBeenCalled();
  expect(client.getQueryData(["device-contacts", API, "startup-owner"])).toBeUndefined();
  expect(client.getQueryData(["contact-sync", API, "startup-owner"])).toBeUndefined();
  expect(boundary.removeNotifications).toHaveBeenCalledOnce();
});

it("does not restart settled startup work when Clerk supplies a new token getter for the same session", async () => {
  const startedAt = Date.now();
  const view = await render(<Fixture startedAt={startedAt} />);
  await waitFor(() => {
    expect(client.getQueryData(relationshipListKey(API, "startup-owner", "blocked"))).toBeDefined();
    expect(client.isFetching()).toBe(0);
  });
  const prior = calls.length;
  const permissionReads = boundary.permission.mock.calls.length;
  const freshToken = vi.fn(async () => "fixture-renewed");
  await view.rerender(
    <Fixture startedAt={startedAt} session={{ ...initialSession, getToken: freshToken }} />,
  );
  expect(calls).toHaveLength(prior);
  expect(freshToken).not.toHaveBeenCalled();
  expect(boundary.permission).toHaveBeenCalledTimes(permissionReads);
  expect(boundary.hideSplash).toHaveBeenCalled();
});

it("reveals the native startup overlay only once as its screen is laid out again", async () => {
  const view = await render(
    <Fixture startedAt={Date.now()} session={{ ...initialSession, loaded: false }} />,
  );
  const splash = splashHost();
  await fireEvent.layout(splash, { x: 0, y: 0, width: 390, height: 844 });
  await fireEvent.layout(splash, { x: 0, y: 0, width: 844, height: 390 });
  expect(boundary.revealSplash).toHaveBeenCalledOnce();
  expect(boundary.hideSplash).not.toHaveBeenCalled();
  await view.unmount();
});

it("ignores a failed initial link lookup received after the startup route unmounts", async () => {
  const link = pending<string | null>();
  vi.mocked(Linking.getInitialURL).mockReturnValueOnce(link.promise);
  const view = await render(<Fixture startedAt={Date.now()} />);
  expect(Linking.getInitialURL).toHaveBeenCalledOnce();
  expect(calls).toEqual([]);
  await view.unmount();
  await act(() => link.reject(Error("Initial URL provider disconnected")));
  expect(calls).toEqual([]);
  expect(boundary.hideSplash).not.toHaveBeenCalled();
  expect(boundary.permission).not.toHaveBeenCalled();
});

it("restarts an interrupted background warmup once account cache restoration settles", async () => {
  const gate = pending<void>();
  favoriteLocationsGate = gate.promise;
  const startedAt = Date.now() - 5000;
  const view = await render(<Fixture startedAt={startedAt} />);
  await waitFor(() =>
    expect(calls.some((call) => call.path === "/api/locations/favorites")).toBe(true),
  );
  await view.rerender(<Fixture startedAt={startedAt} restoring />);
  await act(() => gate.resolve());
  expect(calls.some((call) => call.path === "/api/bgg/account")).toBe(false);
  expect(boundary.hideSplash).toHaveBeenCalledOnce();
  await view.rerender(<Fixture startedAt={startedAt} />);
  await waitFor(() =>
    expect(client.getQueryData(relationshipListKey(API, "startup-owner", "blocked"))).toBeDefined(),
  );
  expect(calls.filter((call) => call.path === "/api/bgg/account")).toHaveLength(1);
  expect(boundary.hideSplash).toHaveBeenCalledOnce();
});
