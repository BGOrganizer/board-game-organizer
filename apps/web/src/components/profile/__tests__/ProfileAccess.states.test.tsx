import type { ProfileView } from "@board-game-organizer/schemas";
import { bggAccountQuery } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProfilePage from "@/app/(tabs)/profile/page";
import { renderWithI18n } from "@/test-utils";

const account = vi.hoisted(() => ({ signOut: vi.fn() }));
const options = {
  apiUrl: "https://profile-access-fixture.test",
  userId: "viewer",
  getToken: async () => "profile-fixture-token",
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: account.signOut }),
  useUser: () => ({
    isLoaded: true,
    user: { id: "viewer", createdAt: new Date("2020-06-10T10:00:00.000Z") },
  }),
}));
afterEach(() => {
  useAppStore.getState().clearProfileViews();
  vi.unstubAllGlobals();
});

it("keeps the public handle and logout available when private collection access is revoked", async () => {
  const profile = {
    id: options.userId,
    name: "",
    username: "sable",
    avatarUrl: null,
    social: { friends: 0, followers: 0, following: 0 },
    player: { gamesPlayed: 0, gamesWon: 0, winRate: null },
  } satisfies ProfileView;
  const active = {
    id: 123,
    username: "private-bgg-user",
    avatarUrl: null,
    snapshot: "fixture-collection",
    syncedAt: "2030-06-01T10:00:00.000Z",
  };
  let accepted = true;
  const requests = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    expect(url.origin).toBe(options.apiUrl);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer profile-fixture-token");
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname === `/api/profiles/${options.userId}`) return Response.json(profile);
    if (url.pathname === "/api/bgg/account") {
      return accepted
        ? Response.json({
            active,
            pending: null,
            lastAttempt: { status: "success", at: active.syncedAt },
          })
        : Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (url.pathname === "/api/bgg/collection")
      return Response.json({
        snapshot: active.snapshot,
        items: [],
        nextCursor: null,
        counts: { withExpansions: 0, withoutExpansions: 0, wishlist: 0 },
      });
    if (url.pathname.endsWith("/activities") || url.pathname.endsWith("/games"))
      return Response.json({ items: [], nextCursor: null });
    throw new Error(`Unexpected Profile endpoint ${url.pathname}`);
  });
  vi.stubGlobal("fetch", requests);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    renderWithI18n(
      <QueryClientProvider client={client}>
        <ProfilePage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("sable")).toBeVisible();
    expect(await screen.findByText("Collection up to date")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Player" }));
    expect(within(screen.getByRole("tabpanel", { name: "Player" })).getByText("—")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Collection" }));
    expect(screen.getByRole("tab", { name: "Collection", selected: true })).toBeVisible();
    accepted = false;
    await act(async () => {
      await client.refetchQueries({ queryKey: bggAccountQuery(options).queryKey, exact: true });
    });
    expect(await screen.findByRole("tab", { name: "Activities", selected: true })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Collection" })).toBeNull();
    expect(screen.queryByText(active.username)).toBeNull();
    expect(screen.getByText("sable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeVisible();
    expect(account.signOut).not.toHaveBeenCalled();
  } finally {
    client.clear();
  }
});

it("does not expose an internal account identifier when both public identity fields are absent", async () => {
  const profile: ProfileView = {
    id: options.userId,
    name: "",
    username: null,
    avatarUrl: null,
    social: { friends: 0, followers: 0, following: 0 },
    player: { gamesPlayed: 0, gamesWon: 0, winRate: null },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = new URL(input).pathname;
      if (path === `/api/profiles/${options.userId}`) return Response.json(profile);
      if (path === "/api/bgg/account") return Response.json({ active: null, pending: null });
      if (path.endsWith("/activities")) return Response.json({ items: [], nextCursor: null });
      throw new Error(`Unexpected Profile endpoint ${path}`);
    }),
  );
  renderWithI18n(<ProfilePage />);
  expect(await screen.findByText("Unknown")).toBeVisible();
  expect(screen.queryByText(options.userId)).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeVisible();
});
