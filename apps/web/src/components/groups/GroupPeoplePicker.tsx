"use client";
import {
  communityAccessDenied,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function GroupPeoplePicker({ groupId }: { groupId: string }) {
  const options = useCommunityApi(),
    { t } = useLingui(),
    router = useRouter();
  const detail = useGroupRecord(options, groupId),
    actions = useGroupRecordActions(options, groupId);
  const group = communityAccessDenied(detail.error) ? undefined : detail.data;
  if (group?.role !== "admin" || !group.canInvite)
    return detail.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">
          {detail.isError && !communityAccessDenied(detail.error)
            ? t`Could not load group`
            : group?.role === "admin"
              ? t`Invitations require an approved group.`
              : t`Group admin required`}
        </p>
        <Button variant="outline" onPress={() => void detail.refetch()}>{t`Try again`}</Button>
      </div>
    );
  const invite = (person: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl: string | null;
  }) => {
    if (actions.isPersonBusy(groupId, person.id)) return;
    actions.invite.mutate({ id: groupId, userId: person.id, person });
    router.back();
  };
  return (
    <>
      <PeoplePicker
        friendsOnly
        invitationGroupId={groupId}
        disabled={actions.blocking}
        onClose={() => router.back()}
        onSelect={invite}
      />
    </>
  );
}
