import type { ContactUser } from "@board-game-organizer/shared";
import { clearSessionQueryCache } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { renderWithI18n } from "@/test-utils";
import { SearchUserPage } from "../SearchUserPage";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "picker-owner" }) }));
const apiUrl = "https://friend-picker-flows.test";
const getToken = vi.fn<() => Promise<string | null>>();
const onSelect = vi.fn(),
  onClose = vi.fn();
const user = (id: string, change: Partial<ContactUser> = {}): ContactUser => ({
  id,
  name: `Player ${id}`,
  username: `player-${id}`,
  email: `${id}@example.test`,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  isFriend: true,
  ...change,
});
const friend = (id: string) => ({ fromUserId: "picker-owner", toUserId: id, profile: user(id) });
let client: QueryClient;
let initialStatus: number, nextStatus: number;
let pendingSearch: Promise<Response> | undefined;
let pendingFriendsPage: Promise<Response> | undefined;
const reads: { url: URL; token: string | null }[] = [];
let intersections: ReturnType<typeof installBrowserIntersections>;
beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue("current-picker-token");
  reads.length = 0;
  initialStatus = nextStatus = 200;
  pendingSearch = pendingFriendsPage = undefined;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  intersections = installBrowserIntersections();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(apiUrl);
      reads.push({ url, token: new Headers(init?.headers).get("authorization") });
      if (url.pathname === "/api/users/search")
        return (
          pendingSearch ??
          Response.json({
            users: [user("match"), user("stranger", { isFriend: false }), user("excluded")],
          })
        );
      if (url.pathname === "/api/relationships") {
        const next = url.searchParams.has("cursor");
        if (next && pendingFriendsPage) return pendingFriendsPage;
        const status = next ? nextStatus : initialStatus;
        return Response.json(
          status === 200
            ? { rows: [friend(next ? "second" : "first")], nextCursor: next ? null : "second-page" }
            : { error: "Unavailable fixture page" },
          { status },
        );
      }
      throw new Error(`Unexpected picker request: ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount(props: Partial<ComponentProps<typeof SearchUserPage>> = {}) {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <SearchUserPage
        apiUrl={apiUrl}
        token="obsolete-token"
        getToken={getToken}
        onSelect={onSelect}
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
}
function search(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Search users"), { target: { value } });
}
const searches = () => reads.filter(({ url }) => url.pathname === "/api/users/search");

it("filters the explicit group-member source by name or email, excludes existing invitees and returns only the chosen identity", () => {
  mount({
    members: [
      user("alice", { name: "Alice Player", email: "club@example.test" }),
      user("bob", { name: "Bob Player", username: null, email: null }),
      user("excluded"),
    ],
    excludeIds: ["excluded"],
  });
  expect(screen.getByRole("heading", { name: "Invite group members" })).toBeVisible();
  expect(screen.queryByText("Player excluded")).toBeNull();
  search("CLUB");
  expect(screen.getByText("Alice Player")).toBeVisible();
  expect(screen.queryByText("Bob Player")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add: Alice Player" }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({
    id: "alice",
    name: "Alice Player",
    username: "player-alice",
    email: "club@example.test",
    avatarUrl: null,
  });
  search("BOB PLAYER");
  expect(screen.getByText("Bob Player")).toBeVisible();
  expect(screen.queryByText("Alice Player")).toBeNull();
  search("missing");
  expect(screen.getByText("No users found")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByText("Bob Player")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(reads).toHaveLength(0);
  expect(getToken).not.toHaveBeenCalled();
});

it("keeps a denied friend list observable and retries explicitly with the fresh request token", async () => {
  initialStatus = 403;
  mount();
  expect(await screen.findByText("Could not load friends")).toBeVisible();
  expect(screen.queryByText("No users found")).toBeNull();
  initialStatus = 200;
  getToken.mockResolvedValue("rotated-picker-token");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Player first")).toBeVisible();
  expect(reads.at(-1)?.token).toBe("Bearer rotated-picker-token");
});

it("preserves loaded friends after a failed next page and retries only that cursor", async () => {
  nextStatus = 400;
  mount();
  await screen.findByText("Player first");
  await waitFor(() => expect(intersections.observedTargetCount).toBeGreaterThan(0));
  await act(async () => intersections.intersect());
  const retry = await screen.findByRole("button", { name: "Retry" });
  expect(screen.getByText("Player first")).toBeVisible();
  expect(screen.queryByText("No users found")).toBeNull();
  nextStatus = 200;
  fireEvent.click(retry);
  expect(await screen.findByText("Player second")).toBeVisible();
  expect(reads.map(({ url }) => url.searchParams.get("cursor"))).toEqual([
    null,
    "second-page",
    "second-page",
  ]);
});

it("debounces discovery for 300 ms, requires four trimmed characters and filters strangers and excluded friends", async () => {
  mount({ excludeIds: ["excluded"] });
  await screen.findByText("Player first");
  vi.useFakeTimers();
  search(" mat ");
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(searches()).toHaveLength(0);
  search(" match ");
  await act(async () => vi.advanceTimersByTimeAsync(299));
  expect(searches()).toHaveLength(0);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(searches()).toHaveLength(1);
  expect(searches()[0].url.searchParams.get("query")).toBe("match");
  expect(searches()[0].token).toBe("Bearer current-picker-token");
  expect(screen.getByText("Player match")).toBeVisible();
  expect(screen.queryByText("Player stranger")).toBeNull();
  expect(screen.queryByText("Player excluded")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByText("Player first")).toBeVisible();
});

it("does not publish an obsolete response after the query is cleared", async () => {
  let finish: (value: Response) => void = () => {};
  pendingSearch = new Promise((resolve) => {
    finish = resolve;
  });
  mount();
  await screen.findByText("Player first");
  search("matching");
  await waitFor(() => expect(searches()).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await act(async () => finish(Response.json({ users: [user("obsolete")] })));
  expect(screen.getByText("Player first")).toBeVisible();
  expect(screen.queryByText("Player obsolete")).toBeNull();
});

it("reports missing search authentication without sending an anonymous request and clears the error with the query", async () => {
  mount();
  await screen.findByText("Player first");
  getToken.mockResolvedValue(null);
  search("matching");
  expect(await screen.findByText("Search failed")).toBeVisible();
  expect(searches()).toHaveLength(0);
  expect(screen.queryByText("No users found")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.queryByText("Search failed")).toBeNull();
  expect(screen.getByText("Player first")).toBeVisible();
});

it("uses the supplied fallback token when no refresh callback is available", async () => {
  mount({ getToken: undefined, token: "fallback-picker-token" });
  await screen.findByText("Player first");
  search("matching");
  expect(await screen.findByText("Player match")).toBeVisible();
  expect(searches().map(({ token }) => token)).toEqual(["Bearer fallback-picker-token"]);
  expect(getToken).not.toHaveBeenCalled();
});

it("keeps visible friends and ignores duplicate intersection callbacks while paging", async () => {
  mount();
  await screen.findByText("Player first");
  await waitFor(() => expect(intersections.observedTargetCount).toBeGreaterThan(0));
  let finish: (response: Response) => void = () => {
    throw new Error("Expected a held next friend page");
  };
  pendingFriendsPage = new Promise((resolve) => {
    finish = resolve;
  });
  act(() => {
    intersections.intersect();
    intersections.intersect();
  });
  const cursors = () => reads.map(({ url }) => url.searchParams.get("cursor"));
  await waitFor(() => expect(cursors()).toEqual([null, "second-page"]));
  expect(screen.getByText("Player first")).toBeVisible();
  expect(screen.queryByText("No users found")).toBeNull();
  expect(screen.queryByText("Player second")).toBeNull();
  await act(() => finish(Response.json({ rows: [friend("second")], nextCursor: null })));
  expect(await screen.findByText("Player second")).toBeVisible();
  expect(cursors()).toEqual([null, "second-page"]);
});

it("does not display a failed search after clearing a request already in flight", async () => {
  let finish: (response: Response) => void = () => {
    throw new Error("Expected a held search");
  };
  pendingSearch = new Promise((resolve) => {
    finish = resolve;
  });
  mount();
  await screen.findByText("Player first");
  search("available");
  await waitFor(() => expect(searches()).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await act(() => finish(Response.json({ error: "Unavailable search" }, { status: 503 })));
  expect(screen.getByText("Player first")).toBeVisible();
  expect(screen.queryByText("Search failed")).toBeNull();
});
