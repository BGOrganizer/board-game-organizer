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
import { GroupBanDialog } from "./GroupBanDialog";
export function GroupPeoplePicker({ groupId, mode }: { groupId: string; mode: "invite" | "ban" }) {
  const options = useCommunityApi(),
    { t } = useLingui(),
    router = useRouter();
  const detail = useGroupRecord(options, groupId),
    actions = useGroupRecordActions(options);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null),
    [error, setError] = useState<unknown>(null);
  const group = communityAccessDenied(detail.error) ? undefined : detail.data;
  const failure =
    error instanceof Error && error.message.includes("BAN_FROZEN_PARTICIPATION")
      ? t`This user is involved in a frozen public event and cannot be excluded.`
      : error
        ? t`Could not update group member. Try again or refresh the list.`
        : undefined;
  if (!group || group.role !== "admin" || (mode === "invite" && !group.canInvite))
    return detail.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">
          {detail.isError && !communityAccessDenied(detail.error)
            ? t`Could not load group`
            : mode === "invite" && group?.role === "admin"
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
    } catch (cause) {
      setError(cause);
    }
  };
  const ban = async (until: string | null) => {
    if (!selected || actions.busy) return;
    setError(false);
    try {
      await actions.ban.mutateAsync({ id: groupId, input: { userId: selected.id, until } });
      router.back();
    } catch (cause) {
      setError(cause);
    }
  };
  return (
    <>
      <PeoplePicker
        friendsOnly={mode === "invite"}
        disabled={actions.busy}
        onClose={() => router.back()}
        onSelect={(person) =>
          mode === "invite"
            ? void invite(person.id)
            : setSelected({ id: person.id, name: person.name })
        }
      />
      {error ? (
        <p role="alert" className="text-danger">
          {failure}
        </p>
      ) : null}
      {selected ? (
        <GroupBanDialog
          name={selected.name}
          busy={actions.busy}
          failure={failure}
          onCancel={() => {
            if (!actions.busy) {
              setSelected(null);
              setError(false);
            }
          }}
          onConfirm={(until) => void ban(until)}
        />
      ) : null}
    </>
  );
}
