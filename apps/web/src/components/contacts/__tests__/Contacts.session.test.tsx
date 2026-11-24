import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ContactsPage from "@/app/(tabs)/contacts/page";
import { renderWithI18n } from "@/test-utils";
import { Contacts } from "../Contacts";

const auth = vi.hoisted(() => ({
  loaded: true,
  signedIn: true,
  token: "initial-token" as string | null,
  getToken: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("next/headers", () => ({
  headers: () => new Headers({ "accept-language": "en-US" }),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: auth.loaded,
    isSignedIn: auth.signedIn,
    userId: auth.signedIn ? "owner" : null,
    getToken: auth.getToken,
  }),
}));
const summary = {
  tables: 0,
  events: 0,
  groups: 0,
  contacts: 0,
  sections: { connections: 0, requests: 0, search: 0 },
};
let client: QueryClient;
let presenceStatus: number;
let inaccessibleRequests: boolean;
const searches: { query: string | null; authorization: string | null }[] = [];
const heartbeats: { authorization: string | null; status: unknown; bypass: string | null }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  auth.loaded = auth.signedIn = true;
  auth.token = "initial-token";
  auth.getToken.mockImplementation(async () => auth.token);
  presenceStatus = 200;
  inaccessibleRequests = false;
  heartbeats.length = searches.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://contacts-session-fixtures.test");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS", "session-fixture-bypass");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe("https://contacts-session-fixtures.test");
      if (url.pathname === "/api/users/presence") {
        heartbeats.push({
          authorization: new Headers(init?.headers).get("authorization"),
          status: JSON.parse(String(init?.body)),
          bypass: url.searchParams.get("x-vercel-protection-bypass"),
        });
        return Response.json(
          { success: presenceStatus === 200, lastActiveAt: "2030-06-01T10:00:00.000Z" },
          { status: presenceStatus },
        );
      }
      if (url.pathname === "/api/relationships") {
        const type = url.searchParams.get("type");
        const rows =
          inaccessibleRequests && (type === "pending" || type === "sent")
            ? [{ fromUserId: "unknown-source", toUserId: "unknown-target", profile: null }]
            : [];
        return Response.json({ rows, nextCursor: null });
      }
      if (url.pathname === "/api/users/search") {
        searches.push({
          query: url.searchParams.get("query"),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return Response.json({ users: [] });
      }
      if (url.pathname === "/api/users/suggestions")
        return Response.json({ users: [], hasContacts: false, nextCursor: null });
      if (url.pathname === "/api/notifications/attention") {
        const targets = JSON.parse(
          url.searchParams.get("targets") ?? "[]",
        ) as NotificationAttentionTarget[];
        return Response.json({
          asOf: "2030-06-01T10:00:00.000Z",
          unreadCount: 0,
          summary,
          targets: targets.map((target) => ({
            target,
            count: 0,
            direct: 0,
            events: 0,
            sections: summary.sections,
          })),
        });
      }
      throw new Error(`Unexpected contacts session request: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function mount(content: ReactElement = <Contacts />) {
  return renderWithI18n(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

it.each([
  [false, false],
  [true, false],
])(
  "does not obtain a private session or send presence when auth loaded/signed-in is %s/%s",
  async (loaded, signedIn) => {
    auth.loaded = loaded;
    auth.signedIn = signedIn;
    mount();
    await advance(60_000);
    expect(auth.getToken).not.toHaveBeenCalled();
    expect(heartbeats).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("waits for an available session, uses fresh tokens for every heartbeat and survives heartbeat failures without losing the actual tabs", async () => {
  auth.token = null;
  const view = mount();
  await advance(0);
  expect(heartbeats).toEqual([]);
  auth.token = "ready-token";
  await advance(500);
  expect(heartbeats).toEqual([
    {
      authorization: "Bearer ready-token",
      status: { status: "online" },
      bypass: "session-fixture-bypass",
    },
  ]);
  expect(screen.getByRole("tab", { name: "Connections" })).toBeVisible();
  auth.token = "rotated-token";
  presenceStatus = 503;
  await advance(60_000);
  expect(heartbeats.at(-1)?.authorization).toBe("Bearer rotated-token");
  expect(heartbeats).toHaveLength(2);
  expect(screen.getByRole("tab", { name: "Connections" })).toBeVisible();
  auth.token = null;
  await advance(60_000);
  expect(heartbeats).toHaveLength(2);
  auth.getToken.mockRejectedValue(new Error("Fixture session temporarily unavailable"));
  await advance(60_000);
  expect(heartbeats).toHaveLength(2);
  auth.getToken.mockImplementation(async () => "recovered-token");
  presenceStatus = 200;
  await advance(60_000);
  expect(heartbeats.at(-1)?.authorization).toBe("Bearer recovered-token");
  expect(heartbeats).toHaveLength(3);
  view.unmount();
  await advance(60_000);
  expect(heartbeats).toHaveLength(3);
});

it("ignores a session token resolving after the Contacts screen has unmounted", async () => {
  let finish: (token: string) => void = () => {
    throw new Error("Expected pending session token");
  };
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  auth.getToken.mockReturnValue(pending);
  const view = mount();
  await advance(0);
  expect(auth.getToken).toHaveBeenCalled();
  view.unmount();
  await act(() => finish("late-session-token"));
  await advance(60_000);
  expect(heartbeats).toEqual([]);
});

it("sends a pending Contacts search only after the session token becomes available", async () => {
  auth.token = null;
  mount(await ContactsPage());
  fireEvent.click(screen.getByRole("tab", { name: "Search" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search users by name or email" }), {
    target: { value: "friends" },
  });
  await advance(310);
  expect(searches).toEqual([]);
  expect(heartbeats).toEqual([]);
  auth.token = "newly-available";
  await advance(200);
  await advance(310);
  expect(searches).toEqual([{ query: "friends", authorization: "Bearer newly-available" }]);
  expect(heartbeats.at(-1)?.authorization).toBe("Bearer newly-available");
});

it("stops waiting for a missing Contacts token after the retry limit and avoids network writes", async () => {
  auth.token = null;
  mount();
  await advance(5_100);
  const tokenCalls = auth.getToken.mock.calls.length;
  expect(tokenCalls).toBeGreaterThanOrEqual(11);
  await advance(5_000);
  expect(auth.getToken).toHaveBeenCalledTimes(tokenCalls);
  expect(heartbeats).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: "Connections" })).toBeVisible();
});

it("does not continue an armed token retry after leaving Contacts", async () => {
  auth.token = null;
  const view = mount();
  await advance(10);
  expect(auth.getToken).toHaveBeenCalled();
  view.unmount();
  const tokenCalls = auth.getToken.mock.calls.length;
  await advance(1_000);
  expect(auth.getToken).toHaveBeenCalledTimes(tokenCalls);
  expect(heartbeats).toEqual([]);
});

it("keeps Contacts usable after an initial rejected authentication read without a presence write", async () => {
  auth.getToken.mockRejectedValue(new Error("Session offline"));
  mount();
  await advance(1_000);
  expect(heartbeats).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: "Connections" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Search" })).toBeVisible();
});

it("excludes the identities and actions of unprojected pending and sent relationship rows", async () => {
  inaccessibleRequests = true;
  mount();
  await advance(20);
  fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
  await advance(20);
  expect(screen.getByRole("tabpanel", { name: "Requests" })).toBeVisible();
  expect(screen.queryByText("unknown-source")).toBeNull();
  expect(screen.queryByText("unknown-target")).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept friend request" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancel friend request" })).toBeNull();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === "/api/relationships")
      .map((url) => url.searchParams.get("type")),
  ).toEqual(expect.arrayContaining(["pending", "sent"]));
});

it("ignores a rejected token for a Contacts screen that has already been closed", async () => {
  let reject: (error: Error) => void = () => {
    throw new Error("Expected pending session token");
  };
  auth.getToken.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const view = mount();
  await advance(0);
  expect(auth.getToken).toHaveBeenCalled();
  view.unmount();
  await act(() => reject(new Error("Late token failure")));
  const tokenCalls = auth.getToken.mock.calls.length;
  await advance(60_000);
  expect(auth.getToken).toHaveBeenCalledTimes(tokenCalls);
  expect(heartbeats).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
