import type { NotificationDto, NotificationListResponse } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { createContext, useContext, useMemo } from "react";
import {
  AppState,
  type AppStateStatus,
  DeviceEventEmitter,
  Dimensions,
  Linking,
  StyleSheet,
} from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { NotificationBell } from "../NotificationBell";

const API = "https://notification-fixtures.test";
const EVENT = "11111111-1111-4111-8111-111111111111";
const TABLE = "22222222-2222-4222-8222-222222222222";
type PermissionStatus = "granted" | "denied" | "undetermined";
const boundary = vi.hoisted(() => ({
  permission: "denied" as PermissionStatus,
  promptResult: "denied" as PermissionStatus,
  canAskAgain: true,
  readPermission: vi.fn(),
  requestPermission: vi.fn(),
  token: vi.fn(),
  channel: vi.fn(async () => undefined),
  push: vi.fn(),
}));
const Session = createContext({
  userId: "owner",
  isSignedIn: true,
  isLoaded: true,
  getToken: async () => "fixture-owner",
});
vi.mock("@clerk/expo", () => ({ useAuth: () => useContext(Session) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://notification-fixtures.test" } },
  },
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: {
    GRANTED: "granted",
    DENIED: "denied",
    UNDETERMINED: "undetermined",
  },
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: boundary.readPermission,
  requestPermissionsAsync: boundary.requestPermission,
  getDevicePushTokenAsync: boundary.token,
  setNotificationChannelAsync: boundary.channel,
}));

function permission(status = boundary.permission, canAskAgain = boundary.canAskAgain) {
  return {
    status,
    granted: status === "granted",
    canAskAgain,
    expires: "never",
  };
}
function notice(index: number, patch: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: String(index).padStart(24, "0"),
    kind: "friend_request_accepted",
    title: `Friendship ${index}`,
    description: `Friendship accepted for user ${index}.`,
    href: "/contacts",
    readAt: null,
    createdAt: `2030-06-01T10:00:0${5 - index}.000Z`,
    ...patch,
  };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
let client: QueryClient;
const records = new Map<string, NotificationDto[]>();
const registrations: {
  owner: string;
  token: string;
  platform: string;
  locale: string;
}[] = [];
const writes: { owner: string; path: string }[] = [];
const appListeners = new Set<(state: AppStateStatus) => void>();
let listStatus = 200;
let listPending: Promise<Response> | undefined;
let oldRegistration: Promise<Response> | undefined;

beforeEach(async () => {
  await installNativePopoverMeasurements();
  vi.clearAllMocks();
  boundary.permission = "denied";
  boundary.promptResult = "denied";
  boundary.canAskAgain = true;
  boundary.readPermission.mockImplementation(async () => permission());
  boundary.requestPermission.mockImplementation(async () => {
    boundary.permission = boundary.promptResult;
    return permission();
  });
  boundary.token.mockResolvedValue({
    type: "fcm",
    data: "fixture-native-push-token",
  });
  records.clear();
  records.set("owner", []);
  records.set("other", [notice(1, { title: "Other account notification" })]);
  registrations.length = 0;
  writes.length = 0;
  appListeners.clear();
  listStatus = 200;
  listPending = oldRegistration = undefined;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  vi.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    const callback = listener as (state: AppStateStatus) => void;
    appListeners.add(callback);
    return { remove: () => appListeners.delete(callback) };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      const owner =
        new Headers(init?.headers).get("authorization")?.replace("Bearer fixture-", "") ?? "owner";
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/notifications" && method === "GET") {
        if (listPending) return listPending;
        if (listStatus !== 200)
          return json({ error: "Fixture notification read failed" }, listStatus);
        const all = records.get(owner) ?? [];
        const limit = Number(url.searchParams.get("limit"));
        expect(limit).toBe(3);
        const body: NotificationListResponse = {
          notifications: all.slice(0, limit),
          unreadCount: all.filter((item) => !item.readAt).length,
          nextCursor: all.length > limit ? all[limit - 1].id : null,
        };
        return json(body);
      }
      if (/^\/api\/notifications(?:\/[a-f\d]{24})?$/.test(url.pathname) && method === "PATCH") {
        writes.push({ owner, path: url.pathname });
        const id = url.pathname.split("/")[3];
        records.set(
          owner,
          (records.get(owner) ?? []).map((item) =>
            !item.requiresResponse && (!id || item.id === id)
              ? { ...item, readAt: "2030-06-01T11:00:00.000Z" }
              : item,
          ),
        );
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/api/push-subscriptions" && method === "POST") {
        registrations.push({ owner, ...JSON.parse(String(init?.body)) });
        return (
          (owner === "owner" ? oldRegistration : undefined) ?? new Response(null, { status: 204 })
        );
      }
      throw new Error(`Unexpected fixture endpoint: ${method} ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Fixture({
  owner = "owner",
  locale = "en",
  signedIn = true,
}: {
  owner?: string;
  locale?: "en" | "it";
  signedIn?: boolean;
}) {
  const session = useMemo(
    () => ({
      userId: owner,
      isSignedIn: signedIn,
      isLoaded: true,
      getToken: async () => `fixture-${owner}`,
    }),
    [owner, signedIn],
  );
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders locale={locale}>
        <Session value={session}>
          <NotificationBell />
        </Session>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function layoutInbox() {
  const dialogs = () =>
    screen.container.queryAll(
      (node) => node.props.role === "dialog" && typeof node.props.onLayout === "function",
    );
  await waitFor(() => expect(dialogs()).toHaveLength(1));
  const dialog = dialogs()[0];
  for (let pass = 0; pass < 2; pass++) {
    const style = StyleSheet.flatten(dialog.props.style);
    await fireEvent.layout(dialog, {
      x: typeof style.left === "number" ? style.left : 0,
      y: typeof style.top === "number" ? style.top : Dimensions.get("screen").height,
      width: 320,
      height: 360,
    });
  }
  await waitFor(() => expect(dialog).toBeVisible());
}
async function openBell() {
  await userEvent.setup().press(screen.getByTestId("notifications-button"));
  await layoutInbox();
}
async function closeBell() {
  await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
  await waitFor(() =>
    expect(screen.container.queryAll((node) => node.props.role === "dialog")).toHaveLength(0),
  );
}

it("waits for the native permission prompt before mounting an inbox, even after denial", async () => {
  let finish: (result: ReturnType<typeof permission>) => void = () => {};
  boundary.requestPermission.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render(<Fixture />);
  await waitFor(() => expect(boundary.readPermission).toHaveBeenCalled());
  await userEvent.setup().press(screen.getByTestId("notifications-button"));
  expect(boundary.requestPermission).toHaveBeenCalledOnce();
  expect(screen.container.queryAll((node) => node.props.role === "dialog")).toHaveLength(0);
  await act(() => finish(permission("denied", true)));
  await layoutInbox();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(boundary.token).not.toHaveBeenCalled();
  expect(registrations).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Open notification settings" })).toBeNull();
});

it("offers system settings after permanent permission denial while keeping the inbox usable", async () => {
  boundary.canAskAgain = false;
  const settings = vi.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await render(<Fixture />);
  await openBell();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(boundary.requestPermission).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Open notification settings" }));
  expect(settings).toHaveBeenCalledOnce();
});

it("registers granted native push once and keeps foreground checks and ordinary inbox reopening idempotent", async () => {
  boundary.permission = "granted";
  let finish: (value: { type: string; data: string }) => void = () => {};
  boundary.token.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render(<Fixture />);
  await waitFor(() => expect(boundary.token).toHaveBeenCalledOnce());
  await openBell();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(registrations).toHaveLength(0);
  await act(() => finish({ type: "fcm", data: "fixture-native-push-token" }));
  await waitFor(() =>
    expect(registrations).toEqual([
      {
        owner: "owner",
        token: "fixture-native-push-token",
        platform: "android",
        locale: "en",
      },
    ]),
  );
  await closeBell();
  await act(async () => {
    for (const callback of appListeners) callback("active");
  });
  await openBell();
  expect(boundary.token).toHaveBeenCalledOnce();
  expect(registrations).toHaveLength(1);
  await userEvent.setup().press(screen.getByRole("button", { name: "View all notifications" }));
  expect(boundary.push).toHaveBeenCalledWith("/notifications");
  expect(screen.container.queryAll((node) => node.props.role === "dialog")).toHaveLength(0);
});

it("shows only the newest three preview items and preserves their exact accented text", async () => {
  records.set("owner", [
    notice(1, {
      title: "Evento confermato",
      description: "L’evento è pronto: città e attività.",
    }),
    notice(2),
    notice(3),
    notice(4),
  ]);
  await render(<Fixture />);
  await waitFor(() => expect(screen.getByLabelText("Notifications: 4")).toBeOnTheScreen());
  await openBell();
  expect(screen.getByText("Evento confermato")).toBeVisible();
  expect(screen.getByText("L’evento è pronto: città e attività.")).toBeVisible();
  expect(screen.getByText("Friendship 3")).toBeVisible();
  expect(screen.queryByText("Friendship 4")).toBeNull();
  expect(writes).toHaveLength(0);
});

it.each([
  {
    protected: false,
    kind: "friend_request_accepted" as const,
    href: "/contacts",
    destination: "/contacts?tab=connections",
  },
  {
    protected: true,
    kind: "table_invitation" as const,
    href: `/events/${EVENT}/tables/${TABLE}`,
    destination: `/event/table?eventId=${EVENT}&tableId=${TABLE}`,
  },
])(
  "opens a notification without treating protected=$protected navigation as invitation consent",
  async (scenario) => {
    const item = notice(1, {
      kind: scenario.kind,
      href: scenario.href,
      requiresResponse: scenario.protected,
    });
    records.set("owner", [item]);
    await render(<Fixture />);
    await openBell();
    await userEvent.setup().press(
      await screen.findByRole("button", {
        name: `${item.title}. ${item.description}`,
      }),
    );
    expect(boundary.push).toHaveBeenCalledWith(scenario.destination);
    if (scenario.protected) expect(writes).toHaveLength(0);
    else
      await waitFor(() =>
        expect(writes).toEqual([{ owner: "owner", path: `/api/notifications/${item.id}` }]),
      );
    expect(screen.container.queryAll((node) => node.props.role === "dialog")).toHaveLength(0);
  },
);

it("reads eligible notices explicitly while pending invitations remain unread", async () => {
  records.set("owner", [
    notice(1),
    notice(2, {
      kind: "table_invitation",
      requiresResponse: true,
      href: `/events/${EVENT}/tables/${TABLE}`,
    }),
  ]);
  await render(<Fixture />);
  await openBell();
  expect(writes).toHaveLength(0);
  await userEvent
    .setup()
    .press(await screen.findByRole("button", { name: "Mark all as read", disabled: false }));
  await waitFor(() => expect(writes).toEqual([{ owner: "owner", path: "/api/notifications" }]));
  await waitFor(() =>
    expect(
      screen.getByLabelText("Notifications: 1", {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen(),
  );
  expect(records.get("owner")?.[0].readAt).not.toBeNull();
  expect(records.get("owner")?.[1].readAt).toBeNull();
});

it("distinguishes initial loading, an empty inbox and a failed background read", async () => {
  let finish: (response: Response) => void = () => {};
  listPending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await openBell();
  expect(screen.getByLabelText("Loading notifications")).toBeVisible();
  expect(screen.queryByText("No notifications yet")).toBeNull();
  await act(() => {
    listPending = undefined;
    finish(json({ notifications: [], unreadCount: 0, nextCursor: null }));
  });
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  listStatus = 503;
  await act(async () => {
    await client.refetchQueries({ queryKey: ["notifications", API, "owner"] });
  });
  expect(await screen.findByText("Could not load notifications")).toBeVisible();
  expect(screen.queryByText("No notifications yet")).toBeNull();
});

it("keeps token registration failures observable and lets a later bell opening recover", async () => {
  boundary.permission = "granted";
  boundary.token.mockRejectedValue(new Error("Fixture device token unavailable"));
  await render(<Fixture />);
  await waitFor(() => expect(boundary.token).toHaveBeenCalled());
  await openBell();
  expect(await screen.findByText("Could not enable push notifications")).toBeVisible();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  await closeBell();
  boundary.token.mockResolvedValue({
    type: "fcm",
    data: "recovered-fixture-push-token",
  });
  await openBell();
  await waitFor(() => expect(registrations).toHaveLength(1));
  expect(screen.queryByText("Could not enable push notifications")).toBeNull();
});

it("rejects a late old-account device token before registering the replacement account", async () => {
  boundary.permission = "granted";
  let finish: (value: { type: string; data: string }) => void = () => {};
  boundary.token.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await render(<Fixture />);
  await waitFor(() => expect(boundary.token).toHaveBeenCalledOnce());
  await view.rerender(<Fixture owner="other" />);
  await act(() => finish({ type: "fcm", data: "discarded-old-account-token" }));
  await waitFor(() =>
    expect(registrations).toEqual([
      {
        owner: "other",
        token: "fixture-native-push-token",
        platform: "android",
        locale: "en",
      },
    ]),
  );
  await openBell();
  expect(await screen.findByText("Other account notification")).toBeVisible();
  expect(registrations.some((item) => item.owner === "owner")).toBe(false);
});

it("updates the registered locale and keeps signed-out sessions from registering push", async () => {
  boundary.permission = "granted";
  const view = await render(<Fixture signedIn={false} />);
  await waitFor(() => expect(boundary.readPermission).toHaveBeenCalled());
  expect(registrations).toHaveLength(0);
  expect(boundary.token).not.toHaveBeenCalled();
  await view.rerender(<Fixture />);
  await waitFor(() => expect(registrations).toHaveLength(1));
  await view.rerender(<Fixture locale="it" />);
  await waitFor(() => expect(registrations.map((item) => item.locale)).toEqual(["en", "it"]));
  expect(screen.getByRole("button", { name: "Notifiche" })).toBeOnTheScreen();
});

it("keeps the inbox usable and exposes a rejected native permission prompt without registering push", async () => {
  boundary.requestPermission.mockRejectedValueOnce(new Error("Native permission prompt failed"));
  await render(<Fixture />);
  await waitFor(() => expect(boundary.readPermission).toHaveBeenCalled());
  await openBell();
  expect(await screen.findByText("Could not enable push notifications")).toBeVisible();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(boundary.requestPermission).toHaveBeenCalledOnce();
  expect(boundary.token).not.toHaveBeenCalled();
  expect(registrations).toHaveLength(0);
  expect(writes).toHaveLength(0);
  await closeBell();
  await openBell();
  expect(boundary.requestPermission).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Could not enable push notifications")).toBeNull();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
});

it("does not register a native token if OS permission becomes denied between the refresh and registration", async () => {
  boundary.readPermission.mockResolvedValueOnce(permission("granted", false));
  boundary.permission = "denied";
  boundary.canAskAgain = false;
  await render(<Fixture />);
  await waitFor(() => expect(boundary.readPermission).toHaveBeenCalledTimes(2));
  await openBell();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(screen.getByRole("button", { name: "Open notification settings" })).toBeEnabled();
  expect(boundary.requestPermission).not.toHaveBeenCalled();
  expect(boundary.token).not.toHaveBeenCalled();
  expect(registrations).toHaveLength(0);
});

it("serializes an account switch behind an in-flight server receipt and updates only the current registration", async () => {
  boundary.permission = "granted";
  let finish!: (response: Response) => void;
  oldRegistration = new Promise((resolve) => {
    finish = resolve;
  });
  const view = await render(<Fixture />);
  await waitFor(() =>
    expect(registrations.map((registration) => registration.owner)).toEqual(["owner"]),
  );
  await view.rerender(<Fixture owner="other" locale="it" />);
  expect(registrations.map((registration) => registration.owner)).toEqual(["owner"]);
  await act(() => finish(new Response(null, { status: 204 })));
  await waitFor(() => {
    expect(registrations.map(({ owner, locale }) => [owner, locale])).toEqual([
      ["owner", "en"],
      ["other", "it"],
    ]);
  });
  await openBell();
  expect(await screen.findByText("Other account notification")).toBeVisible();
  expect(registrations).toHaveLength(2);
});

it("reports a native foreground permission failure while keeping the current inbox available", async () => {
  await render(<Fixture />);
  await waitFor(() => expect(boundary.readPermission).toHaveBeenCalledOnce());
  await openBell();
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  boundary.readPermission.mockRejectedValueOnce(new Error("Native permissions unavailable"));
  await act(async () => {
    for (const listener of appListeners) listener("background");
  });
  expect(boundary.readPermission).toHaveBeenCalledOnce();
  await act(async () => {
    for (const listener of appListeners) listener("active");
  });
  expect(await screen.findByText("Could not enable push notifications")).toBeVisible();
  expect(screen.getByText("No notifications yet")).toBeVisible();
  expect(registrations).toEqual([]);
});

it("allows the current account to register after the previous account's in-flight registration fails", async () => {
  boundary.permission = "granted";
  let reply: (response: Response) => void = () => {};
  oldRegistration = new Promise<Response>((resolve) => {
    reply = resolve;
  });
  const view = await render(<Fixture />);
  await waitFor(() => expect(registrations.map(({ owner }) => owner)).toEqual(["owner"]));
  await view.rerender(<Fixture owner="other" />);
  expect(registrations.map(({ owner }) => owner)).toEqual(["owner"]);
  await act(async () => reply(json({ error: "PUSH_UNAVAILABLE" }, 503)));
  await waitFor(() => expect(registrations.map(({ owner }) => owner)).toEqual(["owner", "other"]));
  await openBell();
  expect(await screen.findByText("Other account notification")).toBeVisible();
  expect(screen.queryByText("Could not enable push notifications")).toBeNull();
});
