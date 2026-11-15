"use client";
import { profileActivityKindSchema } from "@board-game-organizer/schemas";
import {
  activitySections,
  communityAccessDenied,
  useCommunityActivities,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ActivityRow } from "@/components/activities/ActivityRow";
import { ActivityTypeSelect } from "@/components/activities/ActivityTypeSelect";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

export function CommunityActivities() {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    key = JSON.stringify([o.apiUrl, o.userId]);
  const filter = useAppStore((s) => s.communityViews[key]?.activityKind ?? ""),
    setView = useAppStore((s) => s.setCommunityView);
  const parsed = profileActivityKindSchema.safeParse(filter);
  const kind = parsed.success ? parsed.data : undefined;
  const q = useCommunityActivities(o, "all", kind),
    denied = communityAccessDenied(q.error);
  const rows = denied ? [] : (q.data?.pages.flatMap((p) => p.items) ?? []);
  const sections = activitySections(rows, i18n.locale, t`Today`, t`Yesterday`);
  const end = useInfiniteScroll({ ...q, hasNextPage: !denied && q.hasNextPage });
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-semibold">{t`Your network's activities`}</h2>
        <p className="text-sm text-muted">{t`Updates from friends and people you follow, since your connection began.`}</p>
      </div>
      <ActivityTypeSelect
        value={kind}
        onChange={(activityKind) => setView(key, { activityKind: activityKind ?? "" })}
      />
      {q.isPending && !q.data ? <Skeleton className="h-44 w-full rounded-xl" /> : null}
      {q.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-danger">{t`Could not load activities`}</p>
          <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {sections.map((section) => (
        <section
          key={section.key}
          aria-label={section.title}
          className="space-y-2 [content-visibility:auto] [contain-intrinsic-size:auto_500px]"
        >
          <h3 className="text-sm font-semibold text-muted">{section.title}</h3>
          <GroupedList>
            {section.data.map((item) => (
              <ActivityRow key={item.id} item={item} author={item.author} viewerId={o.userId} />
            ))}
          </GroupedList>
        </section>
      ))}
      {!rows.length && !q.isPending && !q.isError ? (
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
