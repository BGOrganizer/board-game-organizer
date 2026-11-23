import {
  type GroupLeaderboardResponse,
  groupLeaderboardResponseSchema,
  type LeaderboardQuery,
  leaderboardQuerySchema,
} from "@board-game-organizer/schemas";
import { useRecordListWindow } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { LeaderboardView } from "@/components/ratings/LeaderboardView";
import { callTool, RejectedToolCall } from "./protocol";
import { useWidgetNavigation } from "./WidgetNavigation";

const groupParams = z.object({ groupId: z.uuid() });
const tableParams = z.object({ eventId: z.uuid(), tableId: z.uuid() });
const tableQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
const tablePage = z.object({
  gameId: z.number().int().positive(),
  scope: z.enum(["GLOBAL", "GROUP"]),
  items: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      username: z.string().nullable().optional(),
      avatarUrl: z.string().nullable(),
      score: z.number().finite(),
      provisional: z.boolean(),
      gamesPlayed: z.number().int().nonnegative(),
      gamesWon: z.number().int().nonnegative(),
      nd: z.number().int().nonnegative(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
const rankingInput = z.object({
  params: groupParams.optional(),
  query: leaderboardQuerySchema,
});
const tableInput = z.object({ params: tableParams, query: tableQuery });
type Page = z.infer<typeof tablePage>;
const gamesIn = (page: GroupLeaderboardResponse) => page.games;
const playersIn = (page: GroupLeaderboardResponse) => page.players;
const tablePlayersIn = (page: Page) => page.items;

export function RankingResults({
  app,
  operation,
  data,
  input,
  embedded = false,
}: {
  app: App;
  operation: "list_global_leaderboard" | "list_group_leaderboard" | "list_table_leaderboard";
  data: unknown;
  input: unknown;
  embedded?: boolean;
}) {
  const { t } = useLingui();
  const { openTool } = useWidgetNavigation(app);
  if (operation === "list_table_leaderboard") {
    const args = tableInput.safeParse({ query: {}, ...recordArgs(input) });
    const page = tablePage.safeParse(data);
    return args.success && page.success ? (
      <section className="space-y-3">
        {openTool && !embedded ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onPress={() => void openTool("get_table", { params: args.data.params })}
          >
            {t`Open table`}
          </Button>
        ) : null}
        <TableRanking app={app} args={args.data} initial={page.data} />
      </section>
    ) : (
      <RankingError />
    );
  }
  const args = rankingInput.safeParse({ query: {}, ...recordArgs(input) });
  const page = groupLeaderboardResponseSchema.safeParse(data);
  if (
    !args.success ||
    !page.success ||
    (operation === "list_group_leaderboard" && !args.data.params)
  ) {
    return <RankingError />;
  }

  return (
    <section className="space-y-3">
      {openTool && !embedded ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onPress={() =>
            void (operation === "list_group_leaderboard"
              ? openTool("get_group", { params: args.data.params })
              : openTool("list_community_activity", {}))
          }
        >
          {operation === "list_group_leaderboard" ? t`Open group` : t`Activities`}
        </Button>
      ) : null}
      <GameRanking
        app={app}
        operation={operation}
        params={operation === "list_group_leaderboard" ? args.data.params : undefined}
        initialQuery={args.data.query}
        initial={page.data}
      />
    </section>
  );
}

function recordArgs(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}
function RankingError() {
  const { t } = useLingui();
  return <p role="alert" className="text-danger">{t`Could not load leaderboards. Retry`}</p>;
}

function GameRanking({
  app,
  operation,
  params,
  initialQuery,
  initial,
}: {
  app: App;
  operation: "list_global_leaderboard" | "list_group_leaderboard";
  params?: z.infer<typeof groupParams>;
  initialQuery: LeaderboardQuery;
  initial: GroupLeaderboardResponse;
}) {
  const { i18n } = useLingui();
  const client = useQueryClient();
  const source = useId();
  const [gameId, setGameId] = useState(initialQuery.gameId ?? null);
  const [sorting, setSorting] = useState({
    sort: initialQuery.sort ?? "rating",
    direction: initialQuery.direction ?? "desc",
  });
  const [search, setSearch] = useState(initialQuery.query ?? "");
  const [query, setQuery] = useState(initialQuery.query ?? "");
  useEffect(() => {
    const timer = setTimeout(() => {
      const value = search.trim();
      setQuery(value.length >= 4 ? value : "");
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // The host owns the signed-in request and OAuth token; cache keys live only inside this widget.
  const root = ["leaderboard", source, operation, params?.groupId ?? null, initialQuery];
  const gameKey = [...root, "games", query];
  const playerKey = [...root, "players", gameId, sorting.sort, sorting.direction];
  const limit = initialQuery.limit;
  const firstGames = initialQuery.gameId === undefined && query === (initialQuery.query ?? "");
  const firstPlayers =
    gameId !== null &&
    gameId === initialQuery.gameId &&
    sorting.sort === (initialQuery.sort ?? "rating") &&
    sorting.direction === (initialQuery.direction ?? "desc");

  async function read(query: LeaderboardQuery, signal: AbortSignal) {
    return groupLeaderboardResponseSchema.parse(
      await callTool(app, operation, { ...(params ? { params } : {}), query }, signal),
    );
  }

  const games = useInfiniteQuery({
    queryKey: gameKey,
    queryFn: ({ pageParam, signal }) =>
      read({ limit, cursor: pageParam, ...(query ? { query } : {}) }, signal),
    placeholderData: (previous) => previous,
    initialPageParam: firstGames ? initialQuery.cursor : 0,
    initialData: firstGames ? { pages: [initial], pageParams: [initialQuery.cursor] } : undefined,
    getNextPageParam: (last, _pages, cursor) =>
      last.nextCursor === cursor ? undefined : (last.nextCursor ?? undefined),
    staleTime: 60_000,
  });
  const players = useInfiniteQuery({
    queryKey: playerKey,
    queryFn: ({ pageParam, signal }) =>
      read({ limit, cursor: pageParam, gameId: gameId ?? undefined, ...sorting }, signal),
    enabled: gameId !== null,
    initialPageParam: firstPlayers ? initialQuery.cursor : 0,
    initialData: firstPlayers ? { pages: [initial], pageParams: [initialQuery.cursor] } : undefined,
    getNextPageParam: (last, _pages, cursor) =>
      last.nextCursor === cursor ? undefined : (last.nextCursor ?? undefined),
    staleTime: 60_000,
  });
  const gameWindow = useRecordListWindow({
    scope: JSON.stringify(gameKey),
    pages: games.data?.pages,
    getItems: gamesIn,
    pageSize: limit,
    hasNextPage: games.hasNextPage,
    isFetching: games.isFetching,
    fetchNextPage: () => games.fetchNextPage({ cancelRefetch: false }),
  });
  const playerWindow = useRecordListWindow({
    scope: JSON.stringify(playerKey),
    pages: players.data?.pages,
    getItems: playersIn,
    pageSize: limit,
    hasNextPage: players.hasNextPage,
    isFetching: players.isFetching,
    fetchNextPage: () => players.fetchNextPage({ cancelRefetch: false }),
  });
  let selected: GroupLeaderboardResponse["games"][number] | undefined;
  if (gameId !== null) {
    for (const [, response] of client.getQueriesData<InfiniteData<GroupLeaderboardResponse>>({
      queryKey: [...root, "games"],
    })) {
      selected = response?.pages
        .find((page) => page.games.some((game) => game.id === gameId))
        ?.games.find((game) => game.id === gameId);
      if (selected) break;
    }
  }
  const filteredGames =
    games.isPlaceholderData && query
      ? gameWindow.items.filter((game) =>
          game.name.toLocaleLowerCase(i18n.locale).includes(query.toLocaleLowerCase(i18n.locale)),
        )
      : gameWindow.items;
  const gamesDenied = games.error instanceof RejectedToolCall;
  const playersDenied = players.error instanceof RejectedToolCall;

  return (
    <LeaderboardView
      group={params ? {} : undefined}
      gameId={gameId}
      games={{
        items: gamesDenied ? [] : filteredGames,
        selected: gamesDenied ? undefined : selected,
        search,
        query,
        isPending: games.isPending,
        isError: games.isError && (!games.data || gamesDenied),
        isPlaceholderData: games.isPending || games.isPlaceholderData,
        hasNextPage: !gamesDenied && gameWindow.hasNextPage,
        isFetchingNextPage: games.isFetchingNextPage,
        onSearch: setSearch,
        onClose: () => {
          setSearch("");
          setQuery("");
        },
        onChange: setGameId,
        isFetchNextPageError: games.isFetchNextPageError,
        onMore: () => void gameWindow.fetchNextPage(),
        onRetry: () => void games.refetch(),
      }}
      players={{
        items: playersDenied ? [] : playerWindow.items,
        isPending: players.isPending,
        isError: players.isError && (!players.data || playersDenied),
        hasNextPage: !playersDenied && playerWindow.hasNextPage,
        isFetchingNextPage: players.isFetchingNextPage,
        isFetchNextPageError: players.isFetchNextPageError,
        onMore: () => void playerWindow.fetchNextPage(),
        onRetry: () => void players.refetch(),
      }}
      sorting={{ ...sorting, onSort: (sort, direction) => setSorting({ sort, direction }) }}
    />
  );
}

function TableRanking({
  app,
  args,
  initial,
}: {
  app: App;
  args: z.infer<typeof tableInput>;
  initial: Page;
}) {
  const operation = "list_table_leaderboard";
  const source = useId();
  const key = [operation, source, args.params, args.query, initial.gameId, initial.scope];
  const page = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const next = tablePage.parse(
        await callTool(
          app,
          operation,
          {
            params: args.params,
            query: { ...args.query, ...(pageParam ? { cursor: pageParam } : {}) },
          },
          signal,
        ),
      );
      if (next.gameId !== initial.gameId || next.scope !== initial.scope) {
        throw new RejectedToolCall(409);
      }
      return next;
    },
    initialPageParam: args.query.cursor ?? "",
    initialData: { pages: [initial], pageParams: [args.query.cursor ?? ""] },
    getNextPageParam: (last, _pages, cursor) =>
      last.nextCursor === cursor ? undefined : (last.nextCursor ?? undefined),
    staleTime: 60_000,
  });
  const display = useRecordListWindow({
    scope: JSON.stringify(key),
    pages: page.data?.pages,
    getItems: tablePlayersIn,
    pageSize: args.query.limit ?? 20,
    hasNextPage: page.hasNextPage,
    isFetching: page.isFetching,
    fetchNextPage: () => page.fetchNextPage({ cancelRefetch: false }),
  });
  const denied = page.error instanceof RejectedToolCall;

  return (
    <LeaderboardView
      gameId={initial.gameId}
      players={{
        items: denied
          ? []
          : display.items.map(({ score, username, ...player }) => ({
              ...player,
              username: username ?? null,
              rating: score,
            })),
        isPending: page.isPending,
        isError: page.isError && (!page.data || denied),
        hasNextPage: !denied && display.hasNextPage,
        isFetchingNextPage: page.isFetchingNextPage,
        isFetchNextPageError: page.isFetchNextPageError,
        onMore: () => void display.fetchNextPage(),
        onRetry: () => void page.refetch(),
      }}
    />
  );
}
