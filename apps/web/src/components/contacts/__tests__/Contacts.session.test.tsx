import type { NotificationAttentionTarget } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { Contacts } from "../Contacts";

const auth = vi.hoisted(() => ({
  loaded: true,
  signedIn: true,
  token: "initial-token" as string | null,
  getToken: vi.fn<() => Promise<string | null>>(),
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
const heartbeats: { authorization: string | null; status: unknown; bypass: string | null }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  auth.loaded = auth.signedIn = true;
  auth.token = "initial-token";
  auth.getToken.mockImplementation(async () => auth.token);
  presenceStatus = 200;
  heartbeats.length = 0;
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
      if (url.pathname === "/api/relationships")
        return Response.json({ rows: [], nextCursor: null });
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
function mount() {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <Contacts />
    </QueryClientProvider>,
  );
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
