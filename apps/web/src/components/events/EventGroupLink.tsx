"use client";
import { communityAccessDenied, useGroupRecord } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { GroupCard } from "@/components/groups/GroupCard";
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
      {record &&
      typeof record.memberCount === "number" &&
      typeof record.canViewEvents === "boolean" &&
      record.logo !== undefined &&
      (record.type === "PRIVATE" || record.type === "PUBLIC") &&
      typeof record.role === "string" ? (
        <GroupCard group={record} />
      ) : (
        <LinkedListCard
          artworkLayout="cover"
          href={`/groups/${groupId}`}
          label={`${t`Open group`}: ${label ?? t`Group`}`}
          artwork={
            record && record.logo !== undefined ? (
              <GroupArtwork group={record} status="none" presentation="cover" />
            ) : (
              <Skeleton className="absolute inset-0 h-full w-full" />
            )
          }
        >
          {label ? (
            <span className="min-w-0 self-center break-words font-medium">{label}</span>
          ) : (
            <Skeleton className="h-4 w-32 rounded" />
          )}
          <Skeleton className="h-4 w-28 rounded" />
        </LinkedListCard>
      )}
      {group.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load group`}</p>
          <Button variant="outline" onPress={() => void group.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
    </section>
  );
}
