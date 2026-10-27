"use client";
import {
  communityAccessDenied,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventInvitationPicker({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    router = useRouter(),
    [error, setError] = useState(false),
    event = communityAccessDenied(q.error) ? undefined : q.data;
  const pick = async (userId: string) => {
    if (a.busy) return;
    setError(false);
    try {
      await a.invite.mutateAsync({ tableId, userId });
      router.back();
    } catch {
      setError(true);
    }
  };
  const closed = useEventCutoff(event?.bookingClosesAt, event?.groupType === "PUBLIC");
  if (!event || !event.canInvite || closed)
    return q.isPending ? (
      <Skeleton className="h-32 w-full rounded-xl" />
    ) : (
      <p
        role="alert"
        className="text-danger"
      >{t`Invitations are unavailable. Refresh the event.`}</p>
    );
  return (
    <div className="space-y-4">
      <Button variant="ghost" onPress={() => router.back()}>{t`Back`}</Button>
      <PeoplePicker
        key={tableId}
        friendsOnly={!event.groupId}
        invitationTable={{ eventId, tableId }}
        disabled={a.busy}
        onSelect={(person) => void pick(person.id)}
      />
      {error ? (
        <p
          role="alert"
          className="text-danger"
        >{t`Could not invite player. Refresh and try again.`}</p>
      ) : null}
    </div>
  );
}
