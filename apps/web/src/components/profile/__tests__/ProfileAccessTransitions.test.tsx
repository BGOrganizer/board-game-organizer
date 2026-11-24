import type {
  ProfileActivity,
  ProfileActivityPage,
  ProfileRatingHistory,
  ProfileView,
} from "@board-game-organizer/schemas";
import {
  bggAccountQuery,
  clearSessionQueryCache,
  profileActivitiesQuery,
  profileViewKeys,
  profileViewQuery,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import UserProfilePage from "@/app/(tabs)/profiles/[userId]/page";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { renderWithI18n } from "@/test-utils";
import { ProfileActivities } from "../ProfileActivities";
import { ProfilePlayer } from "../ProfilePlayer";

const boundary = vi.hoisted(() => {
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://profile-access-transitions.test";
  return { previousApi, viewer: "viewer", getToken: vi.fn<() => Promise<string | null>>() };
});
afterAll(() => {
  if (boundary.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApi;
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: boundary.viewer,
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
const API = "https://profile-access-transitions.test";
const options = () => ({
  apiUrl: API,
  userId: boundary.viewer,
  enabled: true,
  getToken: boundary.getToken,
});
const viewKey = () => JSON.stringify([API, boundary.viewer, "subject"]);
const game = { id: 1, name: "Private strategy game", imageUrl: null };
const history: ProfileRatingHistory = {
  game,
  rating: 512,
  delta: 2,
  stats: { gamesPlayed: 8, gamesWon: 2, winRate: 25 },
  points: [
    { ordinal: 7, rating: 510, delta: 10 },
    { ordinal: 8, rating: 512, delta: 2 },
  ],
  nextCursor: null,
};
const subject: ProfileView = {
  id: "subject",
  name: "Subject Player",
  username: "subject-player",
  avatarUrl: null,
  social: { friends: 1, followers: 2, following: 3 },
  player: { gamesPlayed: 8, gamesWon: 2, winRate: 25 },
};
const activity = (index: number): ProfileActivity => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  kind: "played",
  occurredAt: "2030-06-03T12:00:00.000Z",
  outcome: "won",
  context: `Private table ${index}`,
  href: `/events/example/tables/table-${index}`,
  visibility: "authorized",
});
let client: QueryClient;
let gamesStatus: number, historyStatus: number, subjectStatus: number;
let pendingHistory: Promise<Response> | undefined;
const reads: { url: URL; viewer: string }[] = [];
let intersections: ReturnType<typeof installBrowserIntersections>;
beforeEach(() => {
  vi.clearAllMocks();
  boundary.viewer = "viewer";
  boundary.getToken.mockImplementation(async () => `token-${boundary.viewer}`);
  useAppStore.getState().clearProfileViews();
  gamesStatus = historyStatus = subjectStatus = 200;
  pendingHistory = undefined;
  reads.length = 0;
  intersections = installBrowserIntersections();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      const authorization = new Headers(init?.headers).get("authorization");
      const viewer =
        authorization === "Bearer token-viewer"
          ? "viewer"
          : authorization === "Bearer token-replacement"
            ? "replacement"
            : "invalid";
      expect(viewer).not.toBe("invalid");
      reads.push({ url, viewer });
      if (url.pathname === "/api/profiles/subject/games")
        return Response.json(
          gamesStatus === 200
            ? {
                items:
                  viewer === "viewer"
                    ? [game]
                    : [{ id: 2, name: "Replacement game", imageUrl: null }],
                nextCursor: null,
              }
            : { error: "Games unavailable" },
          { status: gamesStatus },
        );
      if (url.pathname === "/api/profiles/subject/games/1")
        return (
          pendingHistory ??
          Response.json(historyStatus === 200 ? history : { error: "History unavailable" }, {
            status: historyStatus,
          })
        );
      if (url.pathname === "/api/profiles/subject")
        return Response.json(subjectStatus === 200 ? subject : { error: "Profile unavailable" }, {
          status: subjectStatus,
        });
      if (url.pathname === "/api/profiles/subject/activities")
        return Response.json({ items: [activity(viewer === "viewer" ? 1 : 99)], nextCursor: null });
      throw new Error(`Unexpected profile transition request: ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  useAppStore.getState().clearProfileViews();
  vi.unstubAllGlobals();
});
function Fixture({ player = false }: { player?: boolean }) {
  return (
    <QueryClientProvider client={client}>
      {player ? (
        <ProfilePlayer userId="subject" viewKey={viewKey()} />
      ) : (
        <ProfileActivities userId="subject" />
      )}
    </QueryClientProvider>
  );
}
function selectInitially() {
  useAppStore.getState().setProfileView(viewKey(), { gameId: 1 });
}
function gamesKey() {
  return [...profileViewKeys.root(options()), "games", "subject", ""];
}
function ratingKey() {
  return [...profileViewKeys.root(options()), "rating", "subject", 1];
}

it.each(["games", "history"])(
  "revokes previously rendered private rating data after an authoritative %s denial, preserving unrelated subjects",
  async (source) => {
    selectInitially();
    const unrelatedKey = [...profileViewKeys.root(options()), "view", "unrelated"];
    const unrelated = { ...subject, id: "unrelated", name: "Unrelated player" };
    client.setQueryData(unrelatedKey, unrelated);
    renderWithI18n(<Fixture player />);
    expect(await screen.findByText("Current rating: 512")).toBeVisible();
    if (source === "games") gamesStatus = 403;
    else historyStatus = 403;
    await act(async () =>
      client.invalidateQueries({
        queryKey: source === "games" ? gamesKey() : ratingKey(),
        exact: true,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load rating history");
    expect(screen.queryByText("Current rating: 512")).toBeNull();
    expect(screen.queryByRole("img", { name: "OpenSkill rating history" })).toBeNull();
    await waitFor(() => expect(client.getQueryData(ratingKey())).toBeNull());
    expect(client.getQueryData(unrelatedKey)).toBe(unrelated);
    expect(screen.getByRole("button", { name: "Clear board game selection" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
    expect(useAppStore.getState().profileViews[viewKey()]?.gameId).toBeNull();
  },
);

it("retains usable cached ratings during a transient refresh error and retries the selected sources explicitly", async () => {
  selectInitially();
  renderWithI18n(<Fixture player />);
  await screen.findByText("Current rating: 512");
  gamesStatus = 503;
  await act(async () => client.invalidateQueries({ queryKey: gamesKey(), exact: true }));
  const alert = await screen.findByRole("alert");
  expect(screen.getByText("Current rating: 512")).toBeVisible();
  expect(screen.getByRole("img", { name: "OpenSkill rating history" })).toBeVisible();
  gamesStatus = 200;
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByText("Current rating: 512")).toBeVisible();
  expect(reads.filter(({ url }) => url.pathname.endsWith("/games/1"))).toHaveLength(2);
});

it("isolates a replacement account's selector from an earlier account's pending rating completion", async () => {
  let finish: (response: Response) => void = () => {};
  pendingHistory = new Promise((resolve) => {
    finish = resolve;
  });
  selectInitially();
  const originalView = viewKey();
  const view = renderWithI18n(<Fixture player />);
  await waitFor(() =>
    expect(reads.some(({ url }) => url.pathname.endsWith("/games/1"))).toBe(true),
  );
  boundary.viewer = "replacement";
  view.rerender(<Fixture player />);
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  expect(await screen.findByRole("option", { name: "Replacement game" })).toBeVisible();
  await act(async () => finish(Response.json(history)));
  expect(screen.queryByText("Current rating: 512")).toBeNull();
  expect(screen.queryByRole("option", { name: game.name })).toBeNull();
  expect(useAppStore.getState().profileViews[originalView]?.gameId).toBe(1);
  expect(useAppStore.getState().profileViews[viewKey()]?.gameId ?? null).toBeNull();
});

it("revokes activity rows when the authoritative profile metadata read denies access", async () => {
  renderWithI18n(<Fixture />);
  expect(await screen.findByRole("link", { name: "Private table 1" })).toBeVisible();
  subjectStatus = 403;
  await act(async () =>
    client.invalidateQueries({
      queryKey: profileViewQuery(options(), "subject").queryKey,
      exact: true,
    }),
  );
  expect(await screen.findByText("Profile unavailable")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Private table 1" })).toBeNull();
  expect(screen.queryByText("No activities yet")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it("reveals retained activity pages progressively through the real observer without refetching or replacing authoritative pages", async () => {
  const first: ProfileActivityPage = {
    items: Array.from({ length: 10 }, (_, index) => activity(index + 1)),
    nextCursor: "cached-next",
  };
  const second: ProfileActivityPage = { items: [activity(11), activity(12)], nextCursor: null };
  const key = profileActivitiesQuery(options(), "subject", undefined, 10).queryKey;
  const data = { pages: [first, second], pageParams: ["", "cached-next"] };
  client.setQueryData(key, data);
  client.setQueryData(profileViewQuery(options(), "subject").queryKey, subject);
  const authoritative = client.getQueryData(key);
  renderWithI18n(<Fixture />);
  await screen.findByRole("link", { name: "Private table 10" });
  expect(screen.queryByRole("link", { name: "Private table 11" })).toBeNull();
  await waitFor(() => expect(intersections.observedTargetCount).toBeGreaterThan(0));
  await act(async () => intersections.intersect(false));
  expect(screen.queryByRole("link", { name: "Private table 11" })).toBeNull();
  await act(async () => intersections.intersect());
  expect(await screen.findByRole("link", { name: "Private table 12" })).toBeVisible();
  expect(client.getQueryData(key)).toBe(authoritative);
  expect(reads).toHaveLength(0);
});

it("scopes activity filters and returned rows to the current authenticated viewer", async () => {
  useAppStore.getState().setProfileView(viewKey(), { activityKind: "played" });
  const view = renderWithI18n(<Fixture />);
  await screen.findByRole("link", { name: "Private table 1" });
  expect(
    reads.find(({ url }) => url.pathname.endsWith("/activities"))?.url.searchParams.get("kind"),
  ).toBe("played");
  boundary.viewer = "replacement";
  view.rerender(<Fixture />);
  expect(await screen.findByRole("link", { name: "Private table 99" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Private table 1" })).toBeNull();
  expect(
    reads
      .filter(({ url }) => url.pathname.endsWith("/activities"))
      .at(-1)
      ?.url.searchParams.has("kind"),
  ).toBe(false);
  expect(useAppStore.getState().profileViews[viewKey()]?.activityKind ?? "").toBe("");
});

it("keeps another player's published collection browsable when access to the viewer's BGG account is denied", async () => {
  const own = {
    id: 71,
    username: "private-viewer-bgg",
    avatarUrl: null,
    snapshot: "private-viewer-snapshot",
    syncedAt: "2030-06-01T10:00:00.000Z",
  };
  const collection = { snapshot: "published-subject-snapshot" };
  const requests: URL[] = [];
  let ownAllowed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-viewer");
      if (url.pathname === "/api/profiles/subject")
        return Response.json({ ...subject, collection });
      if (url.pathname === "/api/profiles/subject/activities")
        return Response.json({ items: [], nextCursor: null });
      if (url.pathname === "/api/bgg/account")
        return ownAllowed
          ? Response.json({ active: own, pending: null })
          : Response.json({ error: "Account unavailable" }, { status: 403 });
      if (url.pathname === "/api/bgg/collection")
        return Response.json({
          snapshot: collection.snapshot,
          items: [
            {
              ...game,
              name: "Published game",
              year: 2020,
              average: 7,
              rank: 57,
              minPlayMinutes: 20,
              maxPlayMinutes: 30,
              averageWeight: 2,
              categories: ["Strategy"],
              suggestedPlayers: null,
              source: "collection",
              userRating: null,
              isExpansion: false,
              wishlist: false,
            },
          ],
          nextCursor: null,
          counts: { withExpansions: 1, withoutExpansions: 1, wishlist: 0 },
        });
      throw new Error(`Unexpected published collection request: ${url.pathname}`);
    }),
  );
  renderWithI18n(
    <QueryClientProvider client={client}>
      {await UserProfilePage({ params: Promise.resolve({ userId: "subject" }) })}
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("tab", { name: "Collection" }));
  expect(await screen.findByText("Published game")).toBeVisible();
  const common = screen.getByRole("button", { name: "In common" });
  await waitFor(() => expect(common).toBeEnabled());
  ownAllowed = false;
  await act(() =>
    client.invalidateQueries({ queryKey: bggAccountQuery(options()).queryKey, exact: true }),
  );
  await waitFor(() => expect(common).toBeDisabled());
  expect(
    screen.getByText("Synchronize your BGG collection to find games in common."),
  ).toBeVisible();
  expect(screen.getByText("Published game")).toBeVisible();
  expect(screen.queryByText(own.username)).toBeNull();
  expect(
    requests
      .filter((url) => url.pathname === "/api/bgg/collection")
      .map((url) => [
        url.searchParams.get("subjectId"),
        url.searchParams.get("snapshot"),
        url.searchParams.get("commonSnapshot"),
      ]),
  ).toEqual([["subject", collection.snapshot, null]]);
});
