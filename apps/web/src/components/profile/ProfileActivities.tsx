"use client";
import { type ProfileActivityKind, profileActivityKindSchema } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useProfileActivities,
  useProfileView,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { Button, Label, ListBox, Select, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { ProfileActivityRow } from "./ProfileActivityRow";

export function ProfileActivities({ userId }: { userId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    key = JSON.stringify([o.apiUrl, o.userId, userId]);
  const filter = useAppStore((s) => s.profileViews[key]?.activityKind ?? ""),
    setView = useAppStore((s) => s.setProfileView);
  const parsed = profileActivityKindSchema.safeParse(filter),
    kind = parsed.success ? parsed.data : undefined;
  const subject = useProfileView(o, userId);
  const q = useProfileActivities(o, userId, kind, 10),
    denied = communityAccessDenied(q.error) || q.data === null;
  const end = useInfiniteScroll({ ...q, hasNextPage: !denied && q.hasNextPage });
  const rows = denied ? [] : (q.data?.pages.flatMap((p) => p.items) ?? []);
  const labels: Record<ProfileActivityKind, string> = {
    played: t`Game played`,
    friendship: t`New friendship`,
    event_join: t`Joined an event`,
    table_join: t`Joined a table`,
    group_join: t`Joined a group`,
    follower: t`New follower`,
    milestone: t`Victory milestone`,
  };
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-5 pb-24">
      <h1 className="text-lg font-semibold">{t`Activities`}</h1>
      <Select
        value={kind ?? "all"}
        onChange={(value) =>
          setView(key, { activityKind: value === "all" || value === null ? "" : String(value) })
        }
      >
        <Label>{t`Activity type`}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="all" textValue={t`All activity types`}>
              {t`All activity types`}
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {profileActivityKindSchema.options.map((value) => (
              <ListBox.Item key={value} id={value} textValue={labels[value]}>
                {labels[value]}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {q.isPending ? <Skeleton className="h-44 w-full rounded-xl" /> : null}
      {q.isError || denied ? (
        <div role="alert">
          <p className="text-danger">
            {denied ? t`Profile unavailable` : t`Could not load activities`}
          </p>
          <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {rows.length ? (
        <GroupedList>
          {rows.map((item) => (
            <ProfileActivityRow
              key={item.id}
              item={item}
              author={
                communityAccessDenied(subject.error) ? undefined : (subject.data ?? undefined)
              }
            />
          ))}
        </GroupedList>
      ) : !q.isPending && !q.isError && !denied ? (
        <p className="text-muted">{t`No activities yet`}</p>
      ) : null}
      <div ref={end} />
      {q.isFetchingNextPage ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : !denied && q.hasNextPage ? (
        <Button variant="secondary" onPress={() => void q.fetchNextPage()}>
          {q.isFetchNextPageError ? t`Try again` : t`Load more`}
        </Button>
      ) : null}
    </div>
  );
}
