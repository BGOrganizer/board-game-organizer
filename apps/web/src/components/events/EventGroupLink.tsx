"use client";
import { communityAccessDenied, useGroupRecord } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventGroupLink({ groupId, name }: { groupId: string; name?: string | null }) {
  const { t } = useLingui();
  const group = useGroupRecord(useCommunityApi(), groupId);
  const record =
    !communityAccessDenied(group.error) &&
    group.data?.id === groupId &&
    typeof group.data.name === "string"
      ? group.data
      : undefined;
  const label = record?.name ?? name;
  return (
    <section aria-label={t`Group`} className="space-y-2">
      <h2 className="font-semibold">{t`Group`}</h2>
      <LinkedListCard href={`/groups/${groupId}`} label={`${t`Open group`}: ${label ?? t`Group`}`}>
        {record && record.logo !== undefined ? (
          <GroupArtwork group={record} />
        ) : (
          <Skeleton className="size-16 shrink-0 rounded-xl" />
        )}
        {label ? (
          <span className="min-w-0 self-center break-words font-medium">{label}</span>
        ) : (
          <Skeleton className="h-4 w-32 rounded" />
        )}
      </LinkedListCard>
      {group.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load group`}</p>
          <Button variant="outline" onPress={() => void group.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
    </section>
  );
}
