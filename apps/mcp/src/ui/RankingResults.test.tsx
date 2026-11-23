// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { RankingResults } from "./RankingResults";
import { TableFinalResults } from "./TableFinalResults";

const groupId = "cfda9b60-f22c-4fad-9aa6-8b9dd731441c";
const eventId = "915c0578-ab94-4907-9663-45cf9bf16aba";
const tableId = "3d55f3b6-0a6e-4585-8233-ed47efdb1d25";
const games = [{ id: 1, name: "Chess", imageUrl: null }];
const player = {
  userId: "user_player",
  name: "Ada Lovelace",
  username: "ada",
  avatarUrl: null,
  gamesPlayed: 5,
  gamesWon: 2,
  nd: 0,
  rating: 540,
  position: 1,
  provisional: false,
  left: false,
  groupRole: "MEMBER",
};
const i18n = setupI18n({ locale: "en" });
const call = vi.fn<App["callServerTool"]>();
const app = { callServerTool: call } as unknown as App;
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

function show(children: ReactNode) {
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </I18nProvider>,
  );
}

function response(operation: string, data: unknown) {
  return { content: [], structuredContent: { operation, data } };
}

beforeEach(() => {
  call.mockReset();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it("reuses the BGO game picker and compact rankings with scoped paging and sorting", async () => {
  const operation = "list_group_leaderboard";
  call.mockImplementation(async ({ arguments: args }) => {
    const query = args?.query as { cursor: number; direction?: string; gameId?: number };
    const name = query.direction === "asc" ? "claire" : query.cursor ? "nora" : "ada";
    const ranked = query.gameId ? [{ ...player, userId: name, username: name }] : [];
    return response(operation, {
      players: ranked,
      games: query.gameId ? [] : games,
      nextCursor: name === "ada" && query.gameId ? 1 : null,
    });
  });
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ games, players: [], nextCursor: null }}
      input={{ params: { groupId }, query: { limit: 1 } }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Chess" }));
  expect(await screen.findByText("@ada")).toBeVisible();
  expect(screen.queryByText("Ada Lovelace")).toBeNull();
  expect(screen.getByText("Accepted member")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Game statistics: @ada/ }));
  expect(screen.getByText("Wins")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("@nora")).toBeVisible();
  expect(screen.getByText("@ada")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
  expect(await screen.findByText("@claire")).toBeVisible();
  expect(screen.queryByText("@nora")).toBeNull();
  expect(call).toHaveBeenCalledWith(
    {
      name: operation,
      arguments: {
        params: { groupId },
        query: { cursor: 1, limit: 1, gameId: 1, sort: "rating", direction: "desc" },
      },
    },
    { signal: expect.any(AbortSignal) },
  );
  expect(call).toHaveBeenCalledWith(
    {
      name: operation,
      arguments: {
        params: { groupId },
        query: { cursor: 0, limit: 1, gameId: 1, sort: "rating", direction: "asc" },
      },
    },
    { signal: expect.any(AbortSignal) },
  );
});

it("shows a global ranking immediately with its selected game and clears back to the catalog", async () => {
  const operation = "list_global_leaderboard";
  call.mockResolvedValue(response(operation, { games, players: [], nextCursor: null }));
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ games: [], players: [player], nextCursor: null }}
      input={{ query: { gameId: 1 } }}
    />,
  );
  expect(screen.getByText("@ada")).toBeVisible();
  expect(screen.getByText("Global")).toBeVisible();
  await screen.findByRole("button", { name: /Chess Board game/ });
  fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.getByText("Choose a game to see the leaderboard")).toBeVisible();
  expect(call).toHaveBeenCalledOnce();
  expect(call).toHaveBeenCalledWith(
    {
      name: operation,
      arguments: { query: { limit: 25, cursor: 0 } },
    },
    { signal: expect.any(AbortSignal) },
  );
});

it("searches rated games without losing the open BGO select", async () => {
  const operation = "list_global_leaderboard";
  call.mockResolvedValue(
    response(operation, {
      games: [{ id: 2, name: "Cascadia", imageUrl: null }],
      players: [],
      nextCursor: null,
    }),
  );
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ games, players: [], nextCursor: null }}
      input={undefined}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  await screen.findByRole("option", { name: "Chess" });
  const search = screen.getByRole("searchbox", { name: "Search board games" });
  fireEvent.change(search, { target: { value: "casc" } });
  expect(await screen.findByRole("option", { name: "Cascadia" })).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Search board games" })).toHaveValue("casc");
  expect(call).toHaveBeenCalledWith(
    {
      name: operation,
      arguments: { query: { limit: 25, cursor: 0, query: "casc" } },
    },
    { signal: expect.any(AbortSignal) },
  );
});

it("rejects an unscoped group result and shows a real empty global ranking", () => {
  const data = { games: [], players: [], nextCursor: null };
  const invalid = show(
    <RankingResults app={app} operation="list_group_leaderboard" data={data} input={{}} />,
  );
  expect(screen.getByRole("alert")).toBeVisible();
  invalid.unmount();
  show(<RankingResults app={app} operation="list_global_leaderboard" data={data} input={{}} />);
  expect(screen.getByText("No rated tables played yet")).toBeVisible();
  expect(call).not.toHaveBeenCalled();
});

it("renders table ranking rows and refuses a page for a different frozen game", async () => {
  const operation = "list_table_leaderboard";
  const items = [{ ...player, score: player.rating }];
  call
    .mockResolvedValueOnce(
      response(operation, { gameId: 2, scope: "GROUP", items, nextCursor: null }),
    )
    .mockResolvedValueOnce(
      response(operation, {
        gameId: 1,
        scope: "GROUP",
        items: [{ ...items[0], userId: "next_player", username: undefined }],
        nextCursor: null,
      }),
    );
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ gameId: 1, scope: "GROUP", items, nextCursor: "1" }}
      input={{ params: { eventId, tableId } }}
    />,
  );
  expect(screen.getByText("@ada")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Sort/ })).toBeNull();
  expect(screen.queryByText("Accepted member")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(
    await screen.findByRole("button", { name: "Could not load leaderboards. Retry" }),
  ).toBeVisible();
  expect(screen.queryByText("@ada")).toBeNull();
  expect(call).toHaveBeenCalledWith(
    {
      name: operation,
      arguments: { params: { eventId, tableId }, query: { cursor: "1" } },
    },
    { signal: expect.any(AbortSignal) },
  );
  fireEvent.click(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
  expect(await screen.findByText("Username unavailable")).toBeVisible();
  expect(screen.getByText("540.00")).toBeVisible();
  expect(screen.queryByText("@ada")).toBeNull();
  expect(call).toHaveBeenLastCalledWith(
    { name: operation, arguments: { params: { eventId, tableId }, query: {} } },
    { signal: expect.any(AbortSignal) },
  );
});

it("uses the BGO final result rows and rating accordion for terminated table receipts", () => {
  const data = {
    ...plannedTable,
    groupId: null,
    eventStatus: "TERMINATED",
    confirmed: { gameId: 1, startsAt: plannedTable.createdAt, playerIds: ["ada", "nora"] },
    results: {
      lowerWins: false,
      finalizedAt: plannedTable.createdAt,
      tieBreaks: [],
      entries: [
        { userId: "ada", rank: 1, score: "14" },
        { userId: "nora", rank: 2, score: "12" },
      ],
    },
    resultProfiles: [
      {
        userId: "ada",
        name: "Ada Lovelace",
        username: "ada",
        avatarUrl: null,
        email: null,
      },
    ],
    rankingEnabled: false,
  };
  const waiting = show(<TableFinalResults data={{ ...data, eventStatus: "CONFIRMED" }} />);
  expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
  waiting.unmount();
  show(<TableFinalResults data={data} />);
  expect(screen.getByRole("heading", { name: "Chess" })).toBeVisible();
  expect(screen.getByText("@ada")).toBeVisible();
  expect(screen.getByRole("img", { name: "Position: #1" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Rating details.*@ada/ }));
  expect(screen.getByText("Ranking not updated")).toBeVisible();
});

it("keeps a rejected pagination scope from showing cached private players", async () => {
  const operation = "list_group_leaderboard";
  call.mockImplementation(async ({ arguments: args }) => {
    const query = args?.query as { gameId?: number };
    return query.gameId
      ? {
          content: [],
          isError: true,
          structuredContent: { status: 403, error: "GROUP_MEMBER_REQUIRED" },
        }
      : response(operation, { games, players: [], nextCursor: null });
  });
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ games: [], players: [player], nextCursor: 1 }}
      input={{ params: { groupId }, query: { gameId: 1 } }}
    />,
  );
  expect(screen.getByText("@ada")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(screen.queryByText("@ada")).toBeNull());
  expect(screen.getByRole("button", { name: "Could not load leaderboards. Retry" })).toBeVisible();
});

it("paginates the rated game catalog once when the tool repeats its cursor", async () => {
  const operation = "list_global_leaderboard";
  call.mockResolvedValue(
    response(operation, {
      games: [{ id: 2, name: "Cascadia", imageUrl: null }],
      players: [],
      nextCursor: 1,
    }),
  );
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ games, players: [], nextCursor: 1 }}
      input={{ query: { limit: 1 } }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  await screen.findByRole("option", { name: "Chess" });
  fireEvent.click(screen.getByRole("button", { name: "Load more games" }));
  expect(await screen.findByRole("option", { name: "Cascadia" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Chess" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
  expect(call).toHaveBeenCalledExactlyOnceWith(
    { name: operation, arguments: { query: { cursor: 1, limit: 1 } } },
    { signal: expect.any(AbortSignal) },
  );
});

it("hides a denied game catalog search and retries it in the same group scope", async () => {
  const operation = "list_group_leaderboard";
  call
    .mockResolvedValueOnce({
      content: [],
      isError: true,
      structuredContent: { status: 403, error: "GROUP_MEMBER_REQUIRED" },
    })
    .mockResolvedValueOnce(response(operation, { games, players: [], nextCursor: null }));
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ games, players: [], nextCursor: null }}
      input={{ params: { groupId } }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search board games" }), {
    target: { value: "ches" },
  });
  const retry = await screen.findByRole("button", { name: "Could not load leaderboards. Retry" });
  expect(screen.queryByRole("option", { name: "Chess" })).toBeNull();
  fireEvent.click(retry);
  fireEvent.click(await screen.findByRole("button", { name: /Board game/ }));
  expect(await screen.findByRole("option", { name: "Chess" })).toBeVisible();
  expect(call).toHaveBeenCalledTimes(2);
  for (const [request] of call.mock.calls) {
    expect(request).toEqual({
      name: operation,
      arguments: {
        params: { groupId },
        query: { cursor: 0, limit: 25, query: "ches" },
      },
    });
  }
});

it("retries the first failed player read for the selected game", async () => {
  const operation = "list_global_leaderboard";
  call
    .mockRejectedValueOnce(new Error("Network unavailable"))
    .mockResolvedValueOnce(response(operation, { players: [player], games: [], nextCursor: null }));
  show(
    <RankingResults
      app={app}
      operation={operation}
      data={{ games, players: [], nextCursor: null }}
      input={{}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Chess" }));
  const retry = await screen.findByRole("button", { name: "Could not load leaderboards. Retry" });
  expect(screen.queryByText("@ada")).toBeNull();
  fireEvent.click(retry);
  expect(await screen.findByText("@ada")).toBeVisible();
  expect(call.mock.calls).toHaveLength(2);
  expect(call).toHaveBeenLastCalledWith(
    {
      name: operation,
      arguments: { query: { cursor: 0, limit: 25, gameId: 1, sort: "rating", direction: "desc" } },
    },
    { signal: expect.any(AbortSignal) },
  );
});
