import type { NotificationDto, NotificationListResponse } from "@board-game-organizer/schemas";
import { notificationListKey } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { NotificationResponse } from "expo-notifications";
import type { ReactNode } from "react";
import { Dimensions, StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationBadgeSync } from "@/components/notifications/NotificationBadgeSync";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationNavigationBadge } from "@/components/notifications/NotificationNavigationBadge";
import { PushNotificationRouter } from "@/components/notifications/PushNotificationRouter";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://notification-chrome-perf.test",
  token: async () => "notification-fixture-token",
  push: vi.fn(),
  badge: vi.fn(async (_count: number) => true),
  last: vi.fn(async (): Promise<NotificationResponse | null> => null),
  clear: vi.fn(async () => {}),
  receive: vi.fn(() => ({ remove: () => {} })),
  responses: vi.fn((_callback: (response: NotificationResponse) => void) => ({
    remove: vi.fn(),
  })),
  sentry: vi.fn(),
}));
const router = { push: boundary.push };
vi.mock("expo-router", () => ({ useRouter: () => router }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "notification-fixture-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));
vi.mock("@sentry/react-native", () => ({ captureException: boundary.sentry }));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ status: "denied", canAskAgain: false }),
  setBadgeCountAsync: boundary.badge,
  getLastNotificationResponseAsync: boundary.last,
  clearLastNotificationResponseAsync: boundary.clear,
  addNotificationReceivedListener: boundary.receive,
  addNotificationResponseReceivedListener: boundary.responses,
}));

const eventId = "11111111-1111-4111-8111-111111111111";
const tableId = "22222222-2222-4222-8222-222222222222";
const protectedNotice: NotificationDto = {
  id: "000000000000000000000001",
  kind: "table_invitation",
  title: "Pending table invitation",
  description: "Choose whether to join.",
  href: `/events/${eventId}/tables/${tableId}`,
  requiresResponse: true,
  readAt: null,
  createdAt: "2030-06-01T10:00:00.000Z",
};
const notificationKey = notificationListKey(
  { apiUrl: boundary.apiUrl, userId: "owner", locale: "en" },
  3,
);
const page = (unreadCount: number): NotificationListResponse => ({
  notifications: [protectedNotice],
  unreadCount,
  nextCursor: null,
  attention: {
    groups: 0,
    events: 0,
    tables: unreadCount,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  },
});
const state = (count: number) => ({ pages: [page(count)], pageParams: [undefined] });

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  };
}

async function openBell() {
  await userEvent.setup().press(screen.getByTestId("notifications-button"));
  const dialogs = () =>
    screen.container.queryAll(
      (node) => node.props.role === "dialog" && typeof node.props.onLayout === "function",
    );
  await waitFor(() => expect(dialogs()).toHaveLength(1));
  const dialog = dialogs()[0];
  // Provide the two actual native layout passes the controlled Popover anchor receives.
  for (let pass = 0; pass < 2; pass++) {
    const style = StyleSheet.flatten(dialog.props.style);
    await fireEvent.layout(dialog, {
      x: typeof style.left === "number" ? style.left : 0,
      y: typeof style.top === "number" ? style.top : Dimensions.get("screen").height,
      width: 320,
      height: 360,
    });
  }
  expect(dialog).toBeVisible();
}

beforeEach(installNativePopoverMeasurements);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("NotificationBell and NotificationNavigationBadge: open a pending invitation without acknowledging it", async () => {
  const client = createClient();
  const writes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      expect(url.origin).toBe(boundary.apiUrl);
      if ((init?.method ?? "GET") === "GET" && url.pathname === "/api/notifications") {
        return Response.json(page(1));
      }
      writes(init?.method ?? "GET", url.pathname);
      throw new Error(`Unexpected notification preview request: ${url.pathname}`);
    }),
  );
  try {
    const measured = await measureRenders(
      <>
        <NotificationBell />
        <NotificationNavigationBadge section="tables" />
      </>,
      {
        wrapper: providers(client),
        beforeEach: () => {
          client.clear();
          client.setQueryData(notificationKey, state(1));
          writes.mockClear();
          boundary.push.mockClear();
        },
        scenario: async () => {
          expect(screen.getByLabelText("Notifications: 1")).toBeOnTheScreen();
          expect(screen.getByLabelText("Needs attention")).toBeOnTheScreen();
          await openBell();
          const notice = await screen.findByRole("button", {
            name: `${protectedNotice.title}. ${protectedNotice.description}`,
          });
          expect(notice).toBeVisible();
          await userEvent.setup().press(notice);
          expect(boundary.push).toHaveBeenCalledExactlyOnceWith(
            `/event/table?eventId=${eventId}&tableId=${tableId}`,
          );
          expect(writes).not.toHaveBeenCalled();
          expect(client.getQueryData(notificationKey)).toMatchObject({
            pages: [{ notifications: [{ readAt: null }], unreadCount: 1 }],
          });
        },
      },
    );
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("NotificationBadgeSync: reconcile authoritative unread updates with the native badge", async () => {
  const client = createClient();
  const requests = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      expect(url.origin).toBe(boundary.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer notification-fixture-token",
      );
      if (init?.method === "PATCH" && url.pathname === "/api/profiles") {
        return Response.json(JSON.parse(String(init.body)));
      }
      requests(url.pathname);
      throw new Error(`Unexpected badge request: ${url.pathname}`);
    }),
  );
  try {
    const measured = await measureRenders(<NotificationBadgeSync />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        client.setQueryData(notificationKey, state(3));
        requests.mockClear();
        boundary.badge.mockClear();
      },
      scenario: async () => {
        await waitFor(() => expect(boundary.badge).toHaveBeenCalledExactlyOnceWith(3));
        await act(() => {
          client.setQueryData(notificationKey, state(1));
        });
        await waitFor(() => expect(boundary.badge).toHaveBeenLastCalledWith(1));
        expect(boundary.badge).toHaveBeenCalledTimes(2);
        expect(requests).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("PushNotificationRouter: resolve the current native response and route a foreground tap", async () => {
  const initial = vi.fn();
  const measured = await measureRenders(<PushNotificationRouter onInitialResponse={initial} />, {
    beforeEach: () => {
      initial.mockClear();
      boundary.responses.mockClear();
      boundary.push.mockClear();
    },
    scenario: async () => {
      await waitFor(() => expect(initial).toHaveBeenCalledExactlyOnceWith(null));
      expect(boundary.push).not.toHaveBeenCalled();
      expect(boundary.responses).toHaveBeenCalledOnce();
      const receive = boundary.responses.mock.calls[0][0];
      await act(() =>
        receive({
          actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
          notification: {
            date: Date.parse("2030-06-01T10:00:00.000Z"),
            request: {
              identifier: "owned-device-response",
              trigger: null,
              content: {
                title: "New request",
                subtitle: null,
                body: "Open the current contact request.",
                categoryIdentifier: null,
                sound: null,
                data: { href: "/contacts", kind: "friend_request" },
              },
            },
          },
        }),
      );
      expect(boundary.push).toHaveBeenCalledExactlyOnceWith("/contacts?tab=requests");
    },
  });
  expect(boundary.responses.mock.results[0].value.remove).toHaveBeenCalledOnce();
  assertRenderMeasurement(measured);
});
