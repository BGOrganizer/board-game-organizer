import { profileActivityKindSchema } from "@board-game-organizer/schemas";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Activity, Gamepad2, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { z } from "zod";
import { ActivityRowContent } from "@/components/activities/ActivityRowContent";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { ProfileIdentityRow } from "@/components/profile/ProfileIdentityRow";
import { ProfileRatingSummary } from "@/components/profile/ProfileRatingSummary";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { RatingGameSelect } from "@/components/ratings/RatingGameSelect";
import { PeopleMoreButton } from "./PeopleMoreButton";
import { callTool, RejectedToolCall, record } from "./protocol";
import { internalBgoPath, type PeopleResultProps, usePeoplePages } from "./usePeoplePages";
import { useWidgetNavigation } from "./WidgetNavigation";

const identity = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  username: z.string().nullable(),
});
const player = z.object({
  gamesPlayed: z.number(),
  gamesWon: z.number(),
  winRate: z.number().nullable(),
});
const profile = identity.extend({
  social: z.object({ followers: z.number(), following: z.number(), friends: z.number() }),
  player,
  collection: z.object({ snapshot: z.string().min(1).max(100) }).nullish(),
});
const activities = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        kind: profileActivityKindSchema,
        occurredAt: z.iso.datetime({ offset: true }),
        context: z.string().nullable(),
        href: z.string().nullable(),
        author: identity.optional(),
        outcome: z.enum(["won", "played"]).optional(),
        milestone: z.number().optional(),
        eventContext: z.string().optional(),
        otherUserId: z.string().optional(),
      }),
    )
    .max(50),
  nextCursor: z.string().nullable(),
});
const game = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  imageUrl: z.string().nullable(),
});
const games = z.object({ items: z.array(game).max(50), nextCursor: z.number().nullable() });
const ratingHistory = z.object({
  game: game.nullable(),
  rating: z.number().nullable(),
  delta: z.number().nullable(),
  stats: player,
  points: z
    .array(z.object({ ordinal: z.number(), rating: z.number(), delta: z.number() }))
    .max(100),
  nextCursor: z.number().nullable(),
});

export function ProfileResults({ app, data, operation }: PeopleResultProps) {
  const { t, i18n } = useLingui();
  const { openTool } = useWidgetNavigation(app);
  const model = profile.safeParse(data);
  if (!model.success)
    return <p role="alert" className="text-danger">{t`Could not load profile`}</p>;
  const { id, collection, social, player: stats } = model.data;
  const params = { userId: id };
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 });
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={t`Profile`}
        leading={<UserRound className="size-5 text-accent" aria-hidden />}
      />
      <GroupedList>
        <ProfileIdentityRow
          name={model.data.name || model.data.username || t`Unknown`}
          username={model.data.username}
          avatarUrl={model.data.avatarUrl}
        />
      </GroupedList>
      {openTool ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void openTool("list_profile_activity", { params })}
          >
            {t`Activities`}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void openTool("list_profile_games", { params })}
          >
            {t`OpenSkill statistics`}
          </Button>
          {collection ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={() =>
                void openTool("list_bgg_collection", {
                  query: { subjectId: id, snapshot: collection.snapshot },
                })
              }
            >
              {t`Collection`}
            </Button>
          ) : null}
          {operation === "get_my_profile" ? (
            <Button size="sm" variant="secondary" onPress={() => void openTool("list_friends", {})}>
              {t`Contacts`}
            </Button>
          ) : null}
        </div>
      ) : null}
      <ProfileStats
        items={[
          { label: t`Friends`, value: number.format(social.friends) },
          { label: t`Followers`, value: number.format(social.followers) },
          { label: t`Following`, value: number.format(social.following) },
          { label: t`Games played`, value: number.format(stats.gamesPlayed) },
          { label: t`Games won`, value: number.format(stats.gamesWon) },
          {
            label: t`Win percentage`,
            value: stats.winRate === null ? "—" : `${number.format(stats.winRate)}%`,
          },
        ]}
      />
    </section>
  );
}

export function ActivityResults(props: PeopleResultProps) {
  const { t } = useLingui();
  const { canOpenPath, openPath, openTool } = useWidgetNavigation(props.app);
  const { pages, invalid } = usePeoplePages(props, activities);
  const [openError, setOpenError] = useState(false);
  const community = props.operation === "list_community_activity";
  const userId = record(record(props.input)?.params)?.userId;
  const items = new Map(
    pages.data?.pages.flatMap((page) => page.items.map((item) => [item.id, item] as const)),
  );
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={t`Activities`}
        leading={<Activity className="size-5 text-accent" aria-hidden />}
        action={
          openTool && (community || typeof userId === "string") ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={() =>
                void (community
                  ? openTool("list_global_leaderboard", {})
                  : openTool("get_user_profile", { params: { userId } }))
              }
            >
              {community ? t`Rankings` : t`Profile`}
            </Button>
          ) : undefined
        }
      />
      {invalid || pages.isError ? (
        <p role="alert" className="text-danger">{t`Could not load activities`}</p>
      ) : null}
      {openError ? <p role="alert" className="text-danger">{t`Something went wrong`}</p> : null}
      {!invalid && !pages.isError && !items.size ? (
        <EmptyList icon={<Activity className="size-7" />}>{t`No activities yet`}</EmptyList>
      ) : null}
      <GroupedList>
        {Array.from(items.values(), (item) => (
          <ActivityRowContent
            key={item.id}
            item={item}
            viewerId={props.viewerUserId}
            renderLink={(href, name, key) =>
              internalBgoPath(href) ? (
                <button
                  key={key}
                  type="button"
                  className="rounded font-medium text-link focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => {
                    setOpenError(false);
                    void openPath(href).then(
                      (opened) => setOpenError(!opened && !canOpenPath(href)),
                      () => setOpenError(true),
                    );
                  }}
                >
                  {name}
                </button>
              ) : (
                <strong key={key}>{name}</strong>
              )
            }
          />
        ))}
      </GroupedList>
      <PeopleMoreButton pages={pages} />
    </section>
  );
}

export function ProfileGameResults(props: PeopleResultProps) {
  const { t } = useLingui();
  const identity = useId();
  const { pages, invalid } = usePeoplePages(props, games);
  const [selected, setSelected] = useState<number | null>(null);
  const userId = record(record(props.input)?.params)?.userId;
  const choices = Array.from(
    new Map(
      pages.data?.pages.flatMap((page) => page.items.map((item) => [item.id, item] as const)),
    ).values(),
  );
  const selectedGame = choices.find((item) => item.id === selected);
  const args = { params: { userId, gameId: selected === null ? undefined : String(selected) } };
  const denied =
    pages.error instanceof RejectedToolCall && [401, 403, 404].includes(pages.error.status);
  const hasCatalog = !invalid && typeof userId === "string" && !denied;
  const history = useQuery({
    queryKey: ["mcp-profile-game", identity, selected],
    enabled: hasCatalog && selected !== null,
    retry: false,
    queryFn: ({ signal }) => callTool(props.app, "get_profile_game_history", args, signal),
  });
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={t`OpenSkill statistics`}
        leading={<Gamepad2 className="size-5 text-accent" aria-hidden />}
      />
      {!hasCatalog || pages.isError ? (
        <p role="alert" className="text-danger">{t`Could not load rating history`}</p>
      ) : null}
      {hasCatalog ? (
        <RatingGameSelect
          selectedId={selected}
          value={selectedGame}
          games={choices}
          onChange={setSelected}
          footer={<PeopleMoreButton pages={pages} />}
        >
          {null}
        </RatingGameSelect>
      ) : null}
      {history.isFetching ? (
        <Skeleton aria-label={t`Loading…`} className="h-32 w-full rounded-xl" />
      ) : null}
      {history.isError ? (
        <div role="alert" className="space-y-2 text-danger">
          <p>{t`Could not load rating history`}</p>
          <Button variant="secondary" onPress={() => void history.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {hasCatalog && history.data && selected !== null ? (
        <ProfileGameHistory
          key={selected}
          {...props}
          operation="get_profile_game_history"
          input={args}
          data={history.data}
        />
      ) : null}
    </section>
  );
}

export function ProfileGameHistory(props: PeopleResultProps) {
  const { t } = useLingui();
  const { pages, invalid } = usePeoplePages(props, ratingHistory);
  const latest = ratingHistory.safeParse(props.data).data;
  const points = Array.from(
    new Map(
      pages.data?.pages.flatMap((page) =>
        page.points.map((point) => [point.ordinal, point] as const),
      ),
    ).values(),
  ).sort((a, b) => a.ordinal - b.ordinal);
  return (
    <section className="space-y-3">
      <SectionHeaderCard
        title={latest?.game?.name ?? t`OpenSkill statistics`}
        leading={<Gamepad2 className="size-5 text-accent" aria-hidden />}
      />
      {invalid || pages.isError ? (
        <p role="alert" className="text-danger">{t`Could not load rating history`}</p>
      ) : null}
      {latest ? <ProfileRatingSummary data={latest} points={points} /> : null}
      <PeopleMoreButton pages={pages} />
    </section>
  );
}
