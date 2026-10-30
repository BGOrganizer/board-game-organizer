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
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventInvitationPicker({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    router = useRouter(),
    event = communityAccessDenied(q.error) ? undefined : q.data;
  const pick = (person: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl: string | null;
  }) => {
    if (a.blocking || a.isInviting(tableId, person.id)) return;
    a.invite.mutate({
      tableId,
      userId: person.id,
      person: {
        name: person.name,
        username: person.username ?? null,
        avatarUrl: person.avatarUrl,
      },
    });
    router.back();
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
        disabled={a.blocking}
        onSelect={pick}
      />
    </div>
  );
}
