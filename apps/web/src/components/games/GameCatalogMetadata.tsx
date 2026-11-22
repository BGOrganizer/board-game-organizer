"use client";

import type { BggSearchItem } from "@board-game-organizer/schemas";
import {
  gameBestPlayersWithPercentage,
  gameDifficultyColor,
  gameMetadataMissing,
  mergeBggGameMetadata,
  useBggGameMetadata,
} from "@board-game-organizer/shared";
import { Button, Chip, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Clock, Gauge, Info, ListOrdered, Star, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function GameCatalogMetadata({
  game,
  name,
  visible,
  render,
}: {
  game: BggSearchItem;
  name: string;
  visible: boolean;
  render?: (badge: ReactNode) => ReactNode;
}) {
  return render || (visible && gameMetadataMissing(game)) ? (
    <GameMetadataLookup game={game} name={name} visible={visible} render={render} />
  ) : (
    <GameMetadataBadge game={game} name={name} loading={gameMetadataMissing(game)} />
  );
}

function GameMetadataLookup({
  game,
  name,
  visible,
  render,
}: {
  game: BggSearchItem;
  name: string;
  visible: boolean;
  render?: (badge: ReactNode) => ReactNode;
}) {
  const query = useBggGameMetadata(useCommunityApi(), game, visible);
  const badge = (
    <GameMetadataBadge
      game={mergeBggGameMetadata(game, query.data)}
      name={name}
      loading={query.isFetching || (!visible && gameMetadataMissing(game))}
      retry={query.isError ? () => void query.refetch() : undefined}
      size={render ? "md" : "sm"}
    />
  );
  return render ? render(badge) : badge;
}

const difficultyClasses = {
  success: "text-success",
  warning: "text-warning",
  accent: "text-accent",
  danger: "text-danger",
};

function GameMetadataBadge({
  game,
  name,
  loading,
  retry,
  size,
}: {
  game: BggSearchItem;
  name: string;
  loading: boolean;
  retry?: () => void;
  size?: "sm" | "md";
}) {
  const { t, i18n } = useLingui();
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const rating = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percent = new Intl.NumberFormat(i18n.locale, { style: "percent" });
  const color = gameDifficultyColor(game.averageWeight);
  const best = gameBestPlayersWithPercentage(game.suggestedPlayers)
    .map(({ count, fraction }) => `${count} (${percent.format(fraction)})`)
    .join(" – ");
  const min = game.minPlayMinutes ?? game.maxPlayMinutes;
  const max = game.maxPlayMinutes ?? min;
  const rows = [
    { Icon: CalendarDays, label: t`Year`, value: game.year || undefined },
    {
      Icon: Star,
      label: t`BGG rating`,
      value: game.average == null ? undefined : rating.format(game.average),
      color: "fill-warning text-warning",
    },
    {
      Icon: ListOrdered,
      label: t`Ranking`,
      value:
        game.rank == null
          ? undefined
          : game.rank === 0
            ? t`Unranked`
            : `#${number.format(game.rank)}`,
      color: "text-warning",
    },
    {
      Icon: Clock,
      label: t`Duration`,
      value:
        min == null
          ? undefined
          : min === max
            ? `${number.format(min)} min`
            : `${number.format(min)}–${number.format(max ?? min)} min`,
    },
    { Icon: UsersRound, label: t`Best BGG`, value: best || undefined },
    {
      Icon: Gauge,
      label: t`Difficulty`,
      value: game.averageWeight == null ? undefined : `${number.format(game.averageWeight)}/5`,
      color: color ? difficultyClasses[color] : "text-muted",
    },
  ];
  return (
    <IconBadge
      icon={Info}
      color="accent"
      size={size}
      label={`${t`Game information`}: ${name}`}
      title={name}
    >
      <div className="max-h-[60dvh] overflow-y-auto" aria-busy={loading || undefined}>
        <dl className="mt-2 space-y-2">
          {rows.map(({ Icon, label, value, color }) => (
            <div key={label} className="flex items-start gap-2">
              <dt className="flex shrink-0 items-center gap-2">
                <Icon size={15} aria-hidden className={color ?? "text-accent"} />
                <span className="font-semibold">{label}:</span>
              </dt>
              <dd className="min-w-0">
                {value ?? (loading ? <Skeleton className="h-4 w-16 rounded" /> : t`N/A`)}
              </dd>
            </div>
          ))}
        </dl>
        {game.categories?.length ? (
          <ul
            aria-label={t`BGG categories`}
            className="mt-3 flex flex-wrap gap-1.5 border-t border-separator pt-2"
          >
            {game.categories.map((category) => (
              <li key={category}>
                <Chip size="sm" color="accent" variant="soft">
                  {category}
                </Chip>
              </li>
            ))}
          </ul>
        ) : game.categories === undefined && loading ? (
          <Skeleton className="mt-3 h-5 w-28 rounded-full" />
        ) : null}
        {retry ? (
          <div role="alert" className="mt-3 space-y-2 text-danger">
            <p>{t`Could not load game information`}</p>
            <Button variant="secondary" size="sm" onPress={retry}>{t`Try again`}</Button>
          </div>
        ) : null}
      </div>
    </IconBadge>
  );
}
