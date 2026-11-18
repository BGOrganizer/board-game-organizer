import { type NotificationDto, notificationItemId } from "@board-game-organizer/schemas";
import { notificationsPageQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import type { NotificationResponse } from "expo-notifications";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PushNotificationRouter } from "../PushNotificationRouter";

const sdk = vi.hoisted(() => ({
  signedIn: true as boolean | undefined,
  auth: vi.fn(),
  getToken: vi.fn(async () => "fixture-owner"),
  push: vi.fn(),
  last: vi.fn(),
  clear: vi.fn(),
  listen: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({ useAuth: sdk.auth }));
const router = { push: sdk.push };
vi.mock("expo-router", () => ({ useRouter: () => router }));
vi.mock("expo-notifications", () => ({
  getLastNotificationResponseAsync: sdk.last,
  clearLastNotificationResponseAsync: sdk.clear,
  addNotificationResponseReceivedListener: sdk.listen,
}));
vi.mock("@sentry/react-native", () => ({ captureException: sdk.report }));

const eventId = "11111111-1111-4111-8111-111111111111";
const tableId = "22222222-2222-4222-8222-222222222222";
const pendingNotice: NotificationDto = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  kind: "table_invitation",
  title: "Table invitation",
  description: "Choose your preferences before accepting.",
  href: `/events/${eventId}/tables/${tableId}`,
  requiresResponse: true,
  readAt: null,
  createdAt: "2030-06-01T10:00:00.000Z",
};
const cacheKey = notificationsPageQuery(
  {
    apiUrl: "https://push-router-fixtures.test",
    userId: "owner",
    enabled: true,
    getToken: sdk.getToken,
    locale: "en",
  },
  20,
).queryKey;
const initial = vi.fn();
const fetch = vi.fn();
type Subscription = {
  receive: (response: NotificationResponse) => void;
  remove: ReturnType<typeof vi.fn>;
};
const subscriptions: Subscription[] = [];
const active = new Set<Subscription>();
let client: QueryClient;
let cached: unknown;

function response(data?: Record<string, unknown>): NotificationResponse {
  return {
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    notification: {
      date: Date.parse("2030-06-01T10:00:00.000Z"),
      request: {
        identifier: "owned-device-response",
        trigger: null,
        content: {
          title: "Push fixture",
          subtitle: null,
          body: "Open the current resource",
          categoryIdentifier: null,
          sound: null,
          data,
        },
      },
    },
  };
}
function deferred() {
  let resolve: (value: NotificationResponse | null) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<NotificationResponse | null>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function Fixture({
  onInitial = initial,
}: {
  onInitial?: (href: string | null | undefined) => void;
}) {
  return (
    <QueryClientProvider client={client}>
      <PushNotificationRouter onInitialResponse={onInitial} />
    </QueryClientProvider>
  );
}
async function emit(value: NotificationResponse) {
  // Expo delivers only to currently registered listeners; removal is a native SDK contract.
  await act(() => {
    for (const subscription of active) subscription.receive(value);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  sdk.signedIn = true;
  sdk.auth.mockImplementation(() => ({
    isSignedIn: sdk.signedIn,
    userId: "owner",
    sessionId: "owned-session",
    getToken: sdk.getToken,
  }));
  sdk.last.mockResolvedValue(null);
  sdk.clear.mockResolvedValue(undefined);
  active.clear();
  subscriptions.length = 0;
  sdk.listen.mockImplementation((receive: Subscription["receive"]) => {
    const subscription: Subscription = { receive, remove: vi.fn() };
    subscription.remove.mockImplementation(() => {
      active.delete(subscription);
    });
    subscriptions.push(subscription);
    active.add(subscription);
    return { remove: subscription.remove };
  });
  fetch.mockImplementation(async () => {
    throw new Error("Push routing must not make API or provider requests");
  });
  vi.stubGlobal("fetch", fetch);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(cacheKey, {
    pages: [{ notifications: [pendingNotice], unreadCount: 1, nextCursor: null }],
    pageParams: [undefined],
  });
  cached = client.getQueryData(cacheKey);
});
afterEach(() => {
  // Opening a push never accepts the invitation or even marks this pending notice read.
  expect(client.getQueryData(cacheKey)).toBe(cached);
  expect(fetch).not.toHaveBeenCalled();
  expect(sdk.getToken).not.toHaveBeenCalled();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([undefined, false])(
  "reports unresolved initial routing for isSignedIn=%s without subscribing or querying Expo",
  async (signedIn) => {
    sdk.signedIn = signedIn;
    await render(<Fixture />);
    expect(initial).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(sdk.last).not.toHaveBeenCalled();
    expect(sdk.listen).not.toHaveBeenCalled();
    expect(sdk.clear).not.toHaveBeenCalled();
    expect(sdk.push).not.toHaveBeenCalled();
    expect(sdk.auth).toHaveBeenCalledWith({ treatPendingAsSignedOut: false });
  },
);

it("reports a settled empty initial response while keeping the actual live listener active", async () => {
  await render(<Fixture />);
  await waitFor(() => expect(initial).toHaveBeenCalledExactlyOnceWith(null));
  expect(sdk.last).toHaveBeenCalledOnce();
  expect(sdk.listen).toHaveBeenCalledOnce();
  expect(active.size).toBe(1);
  expect(sdk.clear).not.toHaveBeenCalled();
  expect(sdk.push).not.toHaveBeenCalled();
});

it("routes a pending table invitation through the real helper and clears only the OS's consumed initial response", async () => {
  sdk.last.mockResolvedValue(
    response({ href: pendingNotice.href, kind: pendingNotice.kind, requiresResponse: true }),
  );
  await render(<Fixture />);
  const href = `/event/table?eventId=${eventId}&tableId=${tableId}`;
  await waitFor(() => expect(initial).toHaveBeenCalledExactlyOnceWith(href));
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith(href);
  await waitFor(() => expect(sdk.clear).toHaveBeenCalledOnce());
  expect(sdk.report).not.toHaveBeenCalled();
});

it.each([
  { data: { href: "/contacts", kind: "friend_request" }, href: "/contacts?tab=requests" },
  {
    data: { href: "https://untrusted.invalid/groups/private", kind: "group_invitation" },
    href: "/notifications",
  },
  {
    data: {
      href: `/groups/${eventId}`,
      kind: "group_membership_updated",
      attentionItemId: notificationItemId(eventId, "member", "guest"),
    },
    href: `/group/${eventId}?tab=members&attention=${encodeURIComponent(notificationItemId(eventId, "member", "guest"))}`,
  },
])(
  "routes a live response to $href without treating it as initial readiness or notification consent",
  async ({ data, href }) => {
    await render(<Fixture />);
    await waitFor(() => expect(initial).toHaveBeenCalledExactlyOnceWith(null));
    await emit(response(data));
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith(href);
    expect(initial).toHaveBeenCalledExactlyOnceWith(null);
    expect(sdk.clear).not.toHaveBeenCalled();
  },
);

it("settles initial readiness and reports the actual Expo read failure without navigating", async () => {
  const error = new Error("Native notification response unavailable");
  sdk.last.mockRejectedValue(error);
  await render(<Fixture />);
  await waitFor(() => expect(initial).toHaveBeenCalledExactlyOnceWith(null));
  expect(sdk.report).toHaveBeenCalledExactlyOnceWith(error);
  expect(sdk.push).not.toHaveBeenCalled();
  expect(sdk.clear).not.toHaveBeenCalled();
});

it("reports an OS-clear failure after the initial destination has already been dispatched", async () => {
  const error = new Error("Native initial response clear failed");
  sdk.last.mockResolvedValue(response({ href: "/contacts", kind: "friend_request_accepted" }));
  sdk.clear.mockRejectedValue(error);
  await render(<Fixture />);
  await waitFor(() => expect(sdk.report).toHaveBeenCalledExactlyOnceWith(error));
  expect(initial.mock.calls).toEqual([["/contacts?tab=connections"], [null]]);
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith("/contacts?tab=connections");
  expect(sdk.clear).toHaveBeenCalledOnce();
});

it("disposes the listener and ignores a late initial result after unmount", async () => {
  const pending = deferred();
  sdk.last.mockReturnValue(pending.promise);
  const view = await render(<Fixture />);
  await view.unmount();
  expect(subscriptions[0].remove).toHaveBeenCalledOnce();
  expect(active.size).toBe(0);
  await act(() => pending.resolve(response({ href: "/groups" })));
  await emit(response({ href: "/contacts" }));
  expect(initial).not.toHaveBeenCalled();
  expect(sdk.push).not.toHaveBeenCalled();
  expect(sdk.clear).not.toHaveBeenCalled();
  expect(sdk.report).not.toHaveBeenCalled();
});

it("ignores a late initial rejection after cleanup rather than reporting an error for a disposed owner", async () => {
  const pending = deferred();
  sdk.last.mockReturnValue(pending.promise);
  const view = await render(<Fixture />);
  await view.unmount();
  await act(() => pending.reject(new Error("Late native response failure")));
  expect(initial).not.toHaveBeenCalled();
  expect(sdk.report).not.toHaveBeenCalled();
  expect(subscriptions[0].remove).toHaveBeenCalledOnce();
});

it("waits for sign-in, cancels the previous response epoch on logout and starts a new subscription on sign-in", async () => {
  sdk.signedIn = undefined;
  const view = await render(<Fixture />);
  expect(initial).toHaveBeenCalledExactlyOnceWith(undefined);
  const old = deferred();
  sdk.last.mockReturnValueOnce(old.promise);
  sdk.signedIn = true;
  await view.rerender(<Fixture />);
  expect(active.size).toBe(1);
  sdk.signedIn = false;
  await view.rerender(<Fixture />);
  expect(subscriptions[0].remove).toHaveBeenCalledOnce();
  expect(active.size).toBe(0);
  await act(() => old.resolve(response({ href: "/groups" })));
  expect(initial.mock.calls).toEqual([[undefined], [undefined]]);
  expect(sdk.push).not.toHaveBeenCalled();
  expect(sdk.clear).not.toHaveBeenCalled();
  sdk.signedIn = true;
  await view.rerender(<Fixture />);
  await waitFor(() => expect(initial).toHaveBeenLastCalledWith(null));
  expect(sdk.last).toHaveBeenCalledTimes(2);
  expect(active.size).toBe(1);
});

it("replaces a changed readiness callback's subscription without allowing its older initial promise to dispatch", async () => {
  const old = deferred();
  sdk.last.mockReturnValueOnce(old.promise);
  const replacement = vi.fn();
  const view = await render(<Fixture />);
  await view.rerender(<Fixture onInitial={replacement} />);
  await waitFor(() => expect(replacement).toHaveBeenCalledExactlyOnceWith(null));
  expect(subscriptions[0].remove).toHaveBeenCalledOnce();
  expect(active.size).toBe(1);
  await act(() => old.resolve(response({ href: "/groups" })));
  expect(initial).not.toHaveBeenCalled();
  expect(sdk.push).not.toHaveBeenCalled();
  expect(sdk.clear).not.toHaveBeenCalled();
  await view.unmount();
  expect(subscriptions[1].remove).toHaveBeenCalledOnce();
});

it("keeps one listener and one initial lookup across an unrelated rerender with stable SDK/router callbacks", async () => {
  const view = await render(<Fixture />);
  await waitFor(() => expect(initial).toHaveBeenCalledExactlyOnceWith(null));
  await view.rerender(<Fixture />);
  expect(sdk.last).toHaveBeenCalledOnce();
  expect(sdk.listen).toHaveBeenCalledOnce();
  expect(subscriptions[0].remove).not.toHaveBeenCalled();
  await emit(response());
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith("/notifications");
});
