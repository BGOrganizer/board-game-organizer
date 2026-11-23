import { favoriteLocationSchema } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { MapPin } from "lucide-react";
import { z } from "zod";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useToolPages } from "./useToolPages";

const candidate = z.object({ id: z.string(), address: z.string(), name: z.string().optional() });
const row = z.union([
  candidate.transform(({ id, address, name }) => ({
    id,
    address,
    name: name ?? formatLocationAddress(address),
  })),
  favoriteLocationSchema.transform(({ key, location }) => ({ ...location, id: key })),
]);
const locations = z.object({ items: z.array(row), nextCursor: z.string().nullable().optional() });
const saved = z.object({ item: row }).transform(({ item }) => ({ items: [item] }));

export function LocationResults({
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
  const initial = (operation === "save_favorite_location" ? saved : locations).safeParse(data).data;
  const pages = useToolPages(app, operation, input, initial, locations.parse);
  const rows = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const distinct = new Map(rows.map((location) => [location.id, location]));
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={t`Locations`}
        leading={<MapPin className="size-5 text-accent" aria-hidden />}
      />
      {rows.length ? (
        <GroupedList>
          {[...distinct.values()].map((location) => (
            <LocationListRow key={location.id} name={location.name} address={location.address} />
          ))}
        </GroupedList>
      ) : initial ? (
        <EmptyList icon={<MapPin className="size-8" />}>{t`No addresses found`}</EmptyList>
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
    </section>
  );
}
