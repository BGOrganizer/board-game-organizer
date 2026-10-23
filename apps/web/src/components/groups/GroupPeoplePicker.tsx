"use client";
import {
  communityAccessDenied,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function GroupPeoplePicker({ groupId }: { groupId: string }) {
  const options = useCommunityApi(),
    { t } = useLingui(),
    router = useRouter();
  const detail = useGroupRecord(options, groupId),
    actions = useGroupRecordActions(options);
  const [error, setError] = useState(false);
  const group = communityAccessDenied(detail.error) ? undefined : detail.data;
  if (!group || group.role !== "admin" || !group.canInvite)
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
  const invite = async (userId: string) => {
    if (actions.busy) return;
    setError(false);
    try {
      await actions.invite.mutateAsync({ id: groupId, userId });
      router.back();
    } catch {
      setError(true);
    }
  };
  return (
    <>
      <PeoplePicker
        friendsOnly
        disabled={actions.busy}
        onClose={() => router.back()}
        onSelect={(person) => void invite(person.id)}
      />
      {error ? (
        <p
          role="alert"
          className="text-danger"
        >{t`Could not update group member. Try again or refresh the list.`}</p>
      ) : null}
    </>
  );
}
