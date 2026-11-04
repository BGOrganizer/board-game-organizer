"use client";
import { communityAccessDenied, useProfileView } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Gamepad2, LibraryBig, UsersRound } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileBggCard } from "./ProfileBggCard";
import { ProfileLogout } from "./ProfileLogout";
import { ProfilePlayer } from "./ProfilePlayer";
import { ProfileRecentActivities } from "./ProfileRecentActivities";
import { ProfileStats } from "./ProfileStats";

export function Profile({ userId }: { userId?: string }) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi();
  const subject = userId ?? o.userId ?? "",
    own = Boolean(o.userId && subject === o.userId),
    q = useProfileView(o, subject);
  const viewKey = JSON.stringify([o.apiUrl, o.userId, subject]);
  const storedTab = useAppStore((s) => s.profileViews[viewKey]?.tab ?? "activity"),
    setView = useAppStore((s) => s.setProfileView);
  const tab = !own && storedTab === "collection" ? "activity" : storedTab;
  const data = communityAccessDenied(q.error) ? undefined : q.data;
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 });
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-5 pb-24">
      <h1 className="sr-only">{t`Profile`}</h1>
      {q.isPending && !data ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">
            {communityAccessDenied(q.error) ? t`Profile unavailable` : t`Could not load profile`}
          </p>
          <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {data ? (
        <>
          <GroupedList>
            <GroupedRow>
              <UserIdentity
                name={data.name || data.username || t`Unknown`}
                avatarUrl={data.avatarUrl}
                secondary={data.username ? `@${data.username}` : undefined}
              />
            </GroupedRow>
          </GroupedList>
          <Tabs
            selectedKey={tab}
            onSelectionChange={(value) => {
              if (value === "activity" || value === "player" || (own && value === "collection"))
                setView(viewKey, { tab: value });
            }}
          >
            <Tabs.ListContainer className="mt-2 w-full max-w-full self-center">
              <Tabs.List aria-label={t`Profile navigation`} className="w-full">
                <Tabs.Tab
                  id="activity"
                  className="h-auto min-h-14 min-w-0 flex-1 flex-col gap-1 px-2 whitespace-normal"
                >
                  <UsersRound className="size-4" aria-hidden />
                  {t`Activities`}
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab
                  id="player"
                  className="h-auto min-h-14 min-w-0 flex-1 flex-col gap-1 px-2 whitespace-normal"
                >
                  <Gamepad2 className="size-4" aria-hidden />
                  {t`Player`}
                  <Tabs.Indicator />
                </Tabs.Tab>
                {own ? (
                  <Tabs.Tab
                    id="collection"
                    className="h-auto min-h-14 min-w-0 flex-1 flex-col gap-1 px-2 whitespace-normal"
                  >
                    <LibraryBig className="size-4" aria-hidden />
                    {t`Collection`}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ) : null}
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="activity" className="space-y-4 pt-0">
              <ProfileStats
                items={[
                  { label: t`Friends`, value: number.format(data.social.friends) },
                  { label: t`Followers`, value: number.format(data.social.followers) },
                  { label: t`Following`, value: number.format(data.social.following) },
                ]}
              />
              <ProfileRecentActivities userId={subject} />
            </Tabs.Panel>
            <Tabs.Panel id="player" className="space-y-4 pt-0">
              <ProfileStats
                items={[
                  { label: t`Games played`, value: number.format(data.player.gamesPlayed) },
                  { label: t`Games won`, value: number.format(data.player.gamesWon) },
                  {
                    label: t`Win %`,
                    value:
                      data.player.winRate === null ? "—" : `${number.format(data.player.winRate)}%`,
                  },
                ]}
              />
              <ProfilePlayer userId={subject} viewKey={viewKey} />
            </Tabs.Panel>
            {own ? (
              <Tabs.Panel id="collection" className="pt-0">
                <ProfileBggCard />
              </Tabs.Panel>
            ) : null}
          </Tabs>
        </>
      ) : null}
      {!data && !q.isPending && !q.isError ? (
        <p className="text-muted">{t`Profile unavailable`}</p>
      ) : null}
      {own ? <ProfileLogout /> : null}
    </div>
  );
}
