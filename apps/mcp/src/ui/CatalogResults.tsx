import { bggSearchItemSchema } from "@board-game-organizer/schemas";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { Dices } from "lucide-react";
import { z } from "zod";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { McpBggAttribution } from "./McpBggAttribution";
import { McpGameListRow } from "./McpGameListRow";
import { useToolPages } from "./useToolPages";

const operations = new Set([
  "search_bgg_games",
  "get_bgg_games",
  "list_bgg_game_picker",
  "list_bgg_collection",
]);
export function supportsCatalogResult(operation: string) {
  return operations.has(operation);
}

const pageSchema = z.object({
  items: z.array(bggSearchItemSchema),
  nextCursor: z.string().nullable().optional(),
});

export function CatalogResults({
  app,
  operation,
  data,
  input,
}: {
  app: App;
  operation: string;
  data: unknown;
  input?: unknown;
}) {
  const { t } = useLingui();
  const direct =
    operation === "get_bgg_games" ? bggSearchItemSchema.safeParse(data).data : undefined;
  const initial = direct ? { items: [direct] } : pageSchema.safeParse(data).data;
  const pages = useToolPages(app, operation, input, initial, pageSchema.parse);
  const collection = operation === "list_bgg_collection";
  const games = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const distinct = new Map(games.map((game) => [game.id, game]));
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={collection ? t`Collection` : t`Games`}
        leading={<Dices className="size-5 text-accent" aria-hidden />}
      />
      {games.length ? (
        <GroupedList>
          {[...distinct.values()].map((game) => (
            <McpGameListRow key={game.id} app={app} game={game} />
          ))}
        </GroupedList>
      ) : initial ? (
        <EmptyList icon={<Dices className="size-8" />}>{t`No games found`}</EmptyList>
      ) : null}
      {!initial || pages.isFetchNextPageError ? (
        <p role="alert" className="text-sm text-danger">{t`Something went wrong`}</p>
      ) : null}
      {pages.isFetchingNextPage ? (
        <Skeleton aria-label={t`Loading…`} className="h-10 w-full rounded-xl" />
      ) : pages.hasNextPage ? (
        <Button variant="outline" onPress={() => void pages.fetchNextPage()}>
          {pages.isFetchNextPageError ? t`Try again` : t`Load more`}
        </Button>
      ) : null}
      <McpBggAttribution app={app} />
    </section>
  );
}
