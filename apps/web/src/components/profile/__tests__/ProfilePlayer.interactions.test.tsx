import type { ProfileRatingGames, ProfileRatingHistory } from "@board-game-organizer/schemas";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ProfilePlayer } from "../ProfilePlayer";

const API = "https://profile-player-fixtures.test";
const VIEW = JSON.stringify([API, "viewer", "subject"]);
const boundary = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://profile-player-fixtures.test",
    userId: "viewer",
    enabled: true,
    getToken: boundary.getToken,
  }),
}));
const chess = { id: 1, name: "Chess", imageUrl: null };
let games: ProfileRatingGames;
let history: ProfileRatingHistory;
let gamesStatus: number;
let historyStatus: number;
let pendingGames: Promise<Response> | undefined;
let pendingHistory: Promise<Response> | undefined;
const reads: URL[] = [];
let client: QueryClient;
const json = (data: unknown, status = 200) => Response.json(data, { status });
function deferredResponse() {
  let resolve: (response: Response) => void = () => {
    throw new Error("Expected the deferred request to have initialized");
  };
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.getState().clearProfileViews();
  boundary.getToken.mockResolvedValue("fresh-player-token");
  games = { items: [chess], nextCursor: null };
  history = {
    game: chess,
    rating: 512,
    delta: 2,
    stats: { gamesPlayed: 8, gamesWon: 2, winRate: 25 },
    points: [
      { ordinal: 7, rating: 510, delta: 10 },
      { ordinal: 8, rating: 512, delta: 2 },
    ],
    nextCursor: null,
  };
  gamesStatus = historyStatus = 200;
  pendingGames = pendingHistory = undefined;
  reads.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-player-token");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      reads.push(url);
      if (url.pathname === "/api/profiles/subject/games") {
        if (pendingGames) return pendingGames;
        return json(
          gamesStatus === 200
            ? url.searchParams.get("cursor") === "25"
              ? { items: [{ id: 2, name: "Azul", imageUrl: null }], nextCursor: null }
              : url.searchParams.get("query")
                ? { items: [], nextCursor: null }
                : games
            : { error: "Fixture games unavailable" },
          gamesStatus,
        );
      }
      if (url.pathname === "/api/profiles/subject/games/1") {
        if (pendingHistory) return pendingHistory;
        return json(
          historyStatus === 200
            ? url.searchParams.get("cursor") === "6"
              ? {
                  ...history,
                  rating: 1,
                  delta: -100,
                  points: [
                    { ordinal: 5, rating: 495, delta: -5 },
                    { ordinal: 6, rating: 500, delta: 5 },
                  ],
                  nextCursor: null,
                }
              : history
            : { error: "Fixture history unavailable" },
          historyStatus,
        );
      }
      throw new Error(`Unexpected player fixture path: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  useAppStore.getState().clearProfileViews();
  vi.unstubAllGlobals();
});
function mount() {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <ProfilePlayer userId="subject" viewKey={VIEW} />
    </QueryClientProvider>,
  );
}
async function openGames() {
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  return screen.findByRole("searchbox", { name: "Filter games" });
}
async function chooseChess() {
  await openGames();
  fireEvent.click(await screen.findByRole("option", { name: "Chess" }));
}
const gameReads = () => reads.filter((url) => url.pathname.endsWith("/games"));
const historyReads = () => reads.filter((url) => url.pathname.endsWith("/games/1"));

it("keeps initial game loading distinct from empty and retries a real read failure without fetching unselected history", async () => {
  const request = deferredResponse();
  pendingGames = request.promise;
  mount();
  expect(screen.queryByText("No rated games yet")).toBeNull();
  await act(() => request.resolve(json({ error: "Fixture unavailable" }, 503)));
  const alert = await screen.findByRole("alert");
  expect(within(alert).getByText("Could not load rating history")).toBeVisible();
  pendingGames = undefined;
  games = { items: [], nextCursor: null };
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No rated games yet")).toBeVisible();
  expect(gameReads()).toHaveLength(2);
  expect(historyReads()).toHaveLength(0);
});

it("retries failed game choices from the real selector's empty state", async () => {
  gamesStatus = 503;
  mount();
  await screen.findByRole("alert");
  await openGames();
  const choices = screen.getByRole("listbox");
  gamesStatus = 200;
  fireEvent.click(within(choices).getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("option", { name: "Chess" })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(gameReads()).toHaveLength(2);
});

it("retains game choices while an explicitly requested next page is pending and appends canonical options", async () => {
  games.nextCursor = 25;
  mount();
  await openGames();
  await screen.findByRole("option", { name: "Chess" });
  const request = deferredResponse();
  pendingGames = request.promise;
  fireEvent.click(screen.getByRole("button", { name: "Load more games" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Load more games" })).toBeDisabled(),
  );
  expect(screen.getByRole("option", { name: "Chess" })).toBeVisible();
  pendingGames = undefined;
  await act(() =>
    request.resolve(json({ items: [{ id: 2, name: "Azul", imageUrl: null }], nextCursor: null })),
  );
  expect(await screen.findByRole("option", { name: "Azul" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Chess" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
  expect(gameReads().at(-1)?.searchParams.get("cursor")).toBe("25");
});

it("keeps history pending distinct from failure and retries both selected sources while preserving the game", async () => {
  const request = deferredResponse();
  pendingHistory = request.promise;
  mount();
  await chooseChess();
  expect(screen.queryByText(/Current rating:/)).toBeNull();
  await act(() => request.resolve(json({ error: "Fixture unavailable" }, 503)));
  const alert = await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: /Chess Board game/ })).toBeVisible();
  pendingHistory = undefined;
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Current rating: 512")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(gameReads()).toHaveLength(2);
  expect(historyReads()).toHaveLength(2);
  expect(useAppStore.getState().profileViews[VIEW]?.gameId).toBe(1);
});

it("loads earlier ordinal history without replacing the current rating or latest delta with old-page metadata", async () => {
  history.nextCursor = 6;
  mount();
  await chooseChess();
  await screen.findByText("Current rating: 512");
  const request = deferredResponse();
  pendingHistory = request.promise;
  fireEvent.click(screen.getByRole("button", { name: "Earlier rated games" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Earlier rated games" })).toBeDisabled(),
  );
  expect(screen.getByText("Current rating: 512")).toBeVisible();
  pendingHistory = undefined;
  await act(() =>
    request.resolve(
      json({
        ...history,
        rating: 1,
        delta: -100,
        points: [
          { ordinal: 5, rating: 495, delta: -5 },
          { ordinal: 6, rating: 500, delta: 5 },
        ],
        nextCursor: null,
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Earlier rated games" })).toBeNull(),
  );
  expect(screen.getByText("Current rating: 512")).toBeVisible();
  expect(screen.getByText("Last rated game change: +2")).toBeVisible();
  expect(screen.queryByText("Current rating: 1")).toBeNull();
  expect(
    screen
      .getByRole("img", { name: "OpenSkill rating history" })
      .querySelector("polyline")
      ?.getAttribute("points")
      ?.split(" "),
  ).toHaveLength(4);
  expect(historyReads().at(-1)?.searchParams.get("cursor")).toBe("6");
});

it("shows truthful missing rating and delta, then reacts to fresh canonical negative and zero changes", async () => {
  history = { ...history, rating: null, delta: null, points: [] };
  mount();
  await chooseChess();
  expect(await screen.findByText("Current rating: Unknown")).toBeVisible();
  expect(screen.getByText("Last rated game change: —")).toBeVisible();
  expect(screen.getByText("Not enough ranked games for a chart")).toBeVisible();
  const key = ["profile", API, "viewer", "rating", "subject", 1];
  await act(() =>
    client.setQueryData(key, {
      pages: [{ ...history, rating: 499.5, delta: -0.5 }],
      pageParams: [undefined],
    }),
  );
  expect(await screen.findByText("Current rating: 499.5")).toBeVisible();
  expect(screen.getByText("Last rated game change: -0.5")).toBeVisible();
  await act(() =>
    client.setQueryData(key, {
      pages: [{ ...history, rating: 499.5, delta: 0 }],
      pageParams: [undefined],
    }),
  );
  expect(await screen.findByText("Last rated game change: +0")).toBeVisible();
});

it("debounces the scoped game filter and retains selected metadata from history when filtered choices exclude it", async () => {
  mount();
  await chooseChess();
  await screen.findByText("Current rating: 512");
  const input = await openGames();
  fireEvent.change(input, { target: { value: "Missing game" } });
  expect(gameReads().some((url) => url.searchParams.get("query") === "Missing game")).toBe(false);
  expect(await screen.findByText("No games found")).toBeVisible();
  expect(gameReads().at(-1)?.searchParams.get("query")).toBe("Missing game");
  expect(useAppStore.getState().profileViews[VIEW]?.gameId).toBe(1);
  expect(
    client.getQueryData(["profile", API, "viewer", "games", "subject", "Missing game"]),
  ).toMatchObject({ pages: [{ items: [] }] });
  // The actual modal Select hides its outside trigger from accessibility while open.
  // Dismiss it before verifying the selected history fallback through that trigger.
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Board game" })).toBeNull());
  expect(screen.getByRole("button", { name: /Chess Board game/ })).toBeVisible();
  expect(screen.getByText("Current rating: 512")).toBeVisible();
  expect(client.getQueryData(["profile", API, "viewer", "rating", "subject", 1])).toMatchObject({
    pages: [{ game: chess, rating: 512 }],
  });
  expect(await openGames()).toHaveValue("Missing game");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(await screen.findByRole("option", { name: "Chess" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("searchbox", { name: "Filter games" }), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Board game" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.queryByText("Current rating: 512")).toBeNull();
  expect(useAppStore.getState().profileViews[VIEW]?.gameId).toBeNull();
});
