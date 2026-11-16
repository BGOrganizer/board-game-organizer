"use client";
import type { ActivityAuthor } from "@board-game-organizer/schemas";
import { communityAccessDenied, useProfileActivities } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileActivityRow } from "./ProfileActivityRow";
export function ProfileRecentActivities({
  userId,
  author,
}: {
  userId: string;
  author?: ActivityAuthor;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    q = useProfileActivities(o, userId);
  const items = communityAccessDenied(q.error) ? [] : q.data ? q.items : undefined;
  return (
    <section className="space-y-3" aria-label={t`Recent activities`}>
      <h2 className="font-semibold">{t`Recent activities`}</h2>
      {q.isPending && !items ? <Skeleton className="h-44 w-full rounded-xl" /> : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load activities`}</p>
          <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {items?.length ? (
        <GroupedList>
          {items.map((item) => (
            <ProfileActivityRow key={item.id} item={item} author={author} viewerId={o.userId} />
          ))}
        </GroupedList>
      ) : !q.isPending && !q.isError ? (
        <EmptyList icon={<Activity className="size-7" />}>{t`No activities yet`}</EmptyList>
      ) : null}
      <Button
        variant="secondary"
        onPress={() => router.push(`/profiles/${userId}/activities`)}
      >{t`View all activities`}</Button>
    </section>
  );
}
