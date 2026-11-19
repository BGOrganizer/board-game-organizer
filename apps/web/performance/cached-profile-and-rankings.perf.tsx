import type {
  GroupLeaderboardResponse,
  ProfileActivity,
  ProfileActivityPage,
  ProfileRatingGames,
  ProfileRatingHistory,
  ProfileView,
} from "@board-game-organizer/schemas";
import {
  groupRecordKeys,
  profileActivitiesQuery,
  profileViewKeys,
  profileViewQuery,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { GroupLeaderboard } from "@/components/groups/GroupLeaderboard";
import { ProfileActivities } from "@/components/profile/ProfileActivities";
import { ProfilePlayer } from "@/components/profile/ProfilePlayer";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => {
  const apiUrl = "https://cached-render-fixtures.test";
  // GroupLeaderboard deliberately reads NEXT_PUBLIC configuration in its app
  // module, so establish the SDK/environment boundary before importing it.
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  return { apiUrl, getToken: vi.fn(async () => "cached-render-token") };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "viewer",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: boundary.apiUrl,
    userId: "viewer",
    enabled: true,
    getToken: boundary.getToken,
  }),
}));

const subjectId = "subject";
const groupId = "11111111-1111-4111-8111-111111111111";
const options = {
  apiUrl: boundary.apiUrl,
  userId: "viewer",
  enabled: true,
  getToken: boundary.getToken,
};
const viewKey = JSON.stringify([options.apiUrl, options.userId, subjectId]);
const chess = { id: 1, name: "Chess", imageUrl: null };
const games: ProfileRatingGames = {
  items: [chess, { id: 2, name: "Azul", imageUrl: null }],
  nextCursor: null,
};
const subject: ProfileView = {
  id: subjectId,
  name: "Subject Player",
  username: "subject-player",
  avatarUrl: null,
  social: { friends: 6, followers: 4, following: 3 },
  player: { gamesPlayed: 20, gamesWon: 5, winRate: 25 },
};
const history: ProfileRatingHistory = {
  game: chess,
  rating: 512,
  delta: 2,
  stats: subject.player,
  points: Array.from({ length: 20 }, (_, index) => ({
    ordinal: index + 1,
    rating: 474 + index * 2,
    delta: 2,
  })),
  nextCursor: null,
};
const activities: ProfileActivity[] = Array.from({ length: 8 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  kind: index % 2 ? "table_join" : "played",
  occurredAt: `2030-06-0${index + 1}T12:00:00.000Z`,
  outcome: "played",
  context: `Table ${index + 1}`,
  href: `/events/authorized-event/tables/table-${index + 1}`,
  visibility: "authorized",
}));
const rankingPlayer = (index: number): GroupLeaderboardResponse["players"][number] => ({
  userId: `ranker-${index}`,
  name: `Ranking Player ${index}`,
  username: `ranker-${index}`,
  avatarUrl: null,
  gamesPlayed: 8,
  gamesWon: 2,
  nd: 1,
  rating: 510 + index / 2,
  provisional: false,
  left: false,
  groupRole: "MEMBER",
});
const rankingPages = {
  pages: [
    {
      games: [],
      players: Array.from({ length: 10 }, (_, index) => rankingPlayer(index + 1)),
      nextCursor: 25,
    },
    {
      games: [],
      players: Array.from({ length: 10 }, (_, index) => rankingPlayer(index + 11)),
      nextCursor: null,
    },
  ] satisfies GroupLeaderboardResponse[],
  pageParams: [0, 25],
};
const ratingKey = [...profileViewKeys.root(options), "rating", subjectId, 1];
const rankingKey = [...groupRecordKeys.root(options), "rankings", groupId, "players", 1];
const activityQuery = profileActivitiesQuery(options, subjectId, undefined, 10);

let activeClient: QueryClient | undefined;
function currentClient() {
  if (!activeClient) throw new Error("Expected the current measured Query owner");
  return activeClient;
}
function renderCached(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  activeClient = client;
  useAppStore.getState().clearProfileViews();
  client.setQueryData(profileViewQuery(options, subjectId).queryKey, subject);
  client.setQueryData([...profileViewKeys.root(options), "games", subjectId, ""], {
    pages: [games],
    pageParams: [0],
  });
  client.setQueryData(ratingKey, { pages: [history], pageParams: [undefined] });
  const page: ProfileActivityPage = { items: activities, nextCursor: null };
  client.setQueryData(activityQuery.queryKey, { pages: [page], pageParams: [""] });
  client.setQueryData(profileActivitiesQuery(options, subjectId, "played", 10).queryKey, {
    pages: [{ ...page, items: activities.filter((activity) => activity.kind === "played") }],
    pageParams: [""],
  });
  client.setQueryData([...groupRecordKeys.root(options), "rankings", groupId, "games", ""], {
    pages: [{ games: [chess], players: [], nextCursor: null }],
    pageParams: [0],
  });
  client.setQueryData(rankingKey, rankingPages);
  return renderWithI18n(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function cleanupCached() {
  cleanup();
  activeClient?.clear();
  activeClient = undefined;
  useAppStore.getState().clearProfileViews();
}
configure({
  testingLibrary: { render: renderCached, cleanup: cleanupCached },
  runs: 10,
  warmupRuns: 1,
});
beforeEach(() => {
  vi.clearAllMocks();
  // These are authenticated cache-hit scenarios. An accidental read is a real
  // failure, rather than a fabricated API response or hidden network timing.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected network read in a cached-render scenario");
    }),
  );
});
afterEach(() => {
  cleanupCached();
  vi.unstubAllGlobals();
});
afterAll(() => vi.unstubAllEnvs());

async function chooseChess() {
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Chess" }));
}
const cases: { name: string; element: ReactElement; scenario: () => Promise<void> }[] = [
  {
    name: "ProfilePlayer: cached game selection, clearing and repeated selection",
    element: <ProfilePlayer userId={subjectId} viewKey={viewKey} />,
    scenario: async () => {
      expect(screen.queryByText(/Current rating:/)).toBeNull();
      await chooseChess();
      expect(await screen.findByText("Current rating: 512")).toBeVisible();
      expect(screen.getByRole("img", { name: "OpenSkill rating history" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
      expect(screen.queryByText("Current rating: 512")).toBeNull();
      await chooseChess();
      expect(await screen.findByText("Current rating: 512")).toBeVisible();
      expect(useAppStore.getState().profileViews[viewKey]?.gameId).toBe(1);
    },
  },
  {
    name: "ProfilePlayer: authoritative cached rating update retains selection",
    element: <ProfilePlayer userId={subjectId} viewKey={viewKey} />,
    scenario: async () => {
      await chooseChess();
      await screen.findByText("Current rating: 512");
      act(() =>
        currentClient().setQueryData(ratingKey, {
          pages: [
            {
              ...history,
              rating: 520,
              delta: 8,
              stats: { ...history.stats, gamesPlayed: 21, winRate: (5 / 21) * 100 },
              points: [...history.points, { ordinal: 21, rating: 520, delta: 8 }],
            },
          ],
          pageParams: [undefined],
        }),
      );
      expect(await screen.findByText("Current rating: 520")).toBeVisible();
      expect(screen.getByText("Last rated game change: +8")).toBeVisible();
      expect(screen.getByRole("button", { name: /Chess Board game/ })).toBeVisible();
      expect(history.rating).toBe(512);
    },
  },
  {
    name: "ProfileActivities: cached type selection preserves authorized activity rows",
    element: <ProfileActivities userId={subjectId} />,
    scenario: async () => {
      const first = screen.getByRole("link", { name: "Table 1" });
      expect(screen.getAllByRole("link", { name: /^(?:Table \d+|New table)$/ })).toHaveLength(8);
      fireEvent.click(screen.getByRole("button", { name: /Activity type/ }));
      fireEvent.click(await screen.findByRole("option", { name: "Game played" }));
      expect(screen.getAllByRole("link", { name: /^(?:Table \d+|New table)$/ })).toHaveLength(4);
      expect(screen.getByRole("link", { name: "Table 1" })).toBe(first);
      expect(useAppStore.getState().profileViews[viewKey]?.activityKind).toBe("played");
      fireEvent.click(screen.getByRole("button", { name: /Activity type/ }));
      fireEvent.click(await screen.findByRole("option", { name: "All activity types" }));
      expect(screen.getAllByRole("link", { name: /^(?:Table \d+|New table)$/ })).toHaveLength(8);
      expect(useAppStore.getState().profileViews[viewKey]?.activityKind).toBe("");
    },
  },
  {
    name: "ProfileActivities: authoritative cached receipt appears without remount",
    element: <ProfileActivities userId={subjectId} />,
    scenario: async () => {
      const first = screen.getByRole("link", { name: "Table 1" });
      const received: ProfileActivity = {
        ...activities[0],
        id: "00000000-0000-4000-8000-000000000099",
        context: "New table",
        href: "/events/authorized-event/tables/new-table",
      };
      act(() =>
        currentClient().setQueryData(activityQuery.queryKey, {
          pages: [{ items: [received, ...activities], nextCursor: null }],
          pageParams: [""],
        }),
      );
      expect(await screen.findByRole("link", { name: "New table" })).toBeVisible();
      expect(screen.getByRole("link", { name: "Table 1" })).toBe(first);
      expect(screen.getAllByRole("link", { name: /^(?:Table \d+|New table)$/ })).toHaveLength(9);
    },
  },
  {
    name: "GroupLeaderboard: cached game selection and clear retains real ranked rows",
    element: <GroupLeaderboard groupId={groupId} />,
    scenario: async () => {
      await chooseChess();
      expect(screen.getByRole("grid", { name: "Group leaderboard" })).toBeVisible();
      expect(screen.getAllByRole("row")).toHaveLength(11);
      expect(screen.getByText("@ranker-1")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
      expect(screen.queryByRole("grid")).toBeNull();
      await chooseChess();
      expect(screen.getAllByRole("row")).toHaveLength(11);
      expect(screen.getByText("@ranker-1")).toBeVisible();
    },
  },
  {
    name: "GroupLeaderboard: authoritative cached ranking refresh keeps selected game",
    element: <GroupLeaderboard groupId={groupId} />,
    scenario: async () => {
      await chooseChess();
      const first = screen.getByText("@ranker-1");
      act(() =>
        currentClient().setQueryData(rankingKey, {
          ...rankingPages,
          pages: rankingPages.pages.map((page, index) =>
            index
              ? page
              : {
                  ...page,
                  players: page.players.map((player) =>
                    player.userId === "ranker-1" ? { ...player, rating: 536.25 } : player,
                  ),
                },
          ),
        }),
      );
      expect(await screen.findByText("536.25")).toBeVisible();
      expect(screen.getByText("@ranker-1")).toBe(first);
      expect(screen.getByRole("button", { name: /Chess Board game/ })).toBeVisible();
      expect(rankingPages.pages[0].players[0].rating).toBe(510.5);
    },
  },
  {
    name: "GroupLeaderboard: reveal retained ranking page without refetching canonical data",
    element: <GroupLeaderboard groupId={groupId} />,
    scenario: async () => {
      await chooseChess();
      expect(screen.queryByText("@ranker-11")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("@ranker-11")).toBeVisible();
      expect(screen.getAllByRole("row")).toHaveLength(21);
      expect(currentClient().getQueryData(rankingKey)).toBe(rankingPages);
      expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    },
  },
];

for (const { name, element, scenario } of cases) {
  test(name, async () => {
    const result = await measureRenders(element, {
      scenario: async () => {
        await scenario();
        expect(fetch).not.toHaveBeenCalled();
        expect(boundary.getToken).not.toHaveBeenCalled();
      },
    });
    // New names intentionally have no budget until two measured runs establish
    // actual stable counts. Reassure persists samples before this strict gate.
    assertRenderMeasurement(result, name);
  });
}
