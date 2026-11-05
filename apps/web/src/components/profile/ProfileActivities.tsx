"use client";
import { profileActivityKindSchema } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useProfileActivities,
  useProfileView,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ActivityTypeSelect } from "@/components/activities/ActivityTypeSelect";
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
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-5 pb-24">
      <h1 className="text-lg font-semibold">{t`Activities`}</h1>
      <ActivityTypeSelect
        value={kind}
        onChange={(activityKind) => setView(key, { activityKind: activityKind ?? "" })}
      />
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
              viewerId={o.userId}
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
