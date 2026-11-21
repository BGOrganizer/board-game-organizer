"use client";
import { GUEST_NAME_MAX_LENGTH } from "@board-game-organizer/schemas";
import {
  canGenerateTableInviteLink,
  communityAccessDenied,
  useEventRecord,
  useEventRecordActions,
  useTableGuestActions,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { HEADER_ICON_CLASS, headerButtonProps } from "@/components/common/layout/headerStyles";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestNameRow } from "@/components/common/ui/GuestNameRow";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { TableInviteLinkRow } from "./TableInviteLinkRow";
export function EventInvitationPicker({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    q = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    guest = useTableGuestActions(o, eventId, tableId),
    router = useRouter(),
    event = communityAccessDenied(q.error) ? undefined : q.data;
  const canAddGuest =
    !q.isPlaceholderData && event?.status === "PLANNING" && event.groupType !== "PUBLIC";
  const pick = (person: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl: string | null;
  }) => {
    if (a.blocking || guest.add.isPending || a.isInviting(tableId, person.id)) return;
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
  const back = (
    <HeaderActions
      back={
        <Button
          {...headerButtonProps}
          variant="ghost"
          aria-label={t`Back`}
          onPress={() => router.back()}
        >
          <ArrowLeft className={HEADER_ICON_CLASS} aria-hidden />
        </Button>
      }
    />
  );
  if (!event?.canInvite)
    return (
      <div className="space-y-4">
        {back}
        {q.isPending ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <p
            role="alert"
            className="text-danger"
          >{t`Invitations are unavailable. Refresh the event.`}</p>
        )}
      </div>
    );
  return (
    <div className="space-y-4">
      {back}
      <PeoplePicker
        key={tableId}
        friendsOnly={!event.groupId}
        invitationTable={{ eventId, tableId }}
        disabled={a.blocking || guest.add.isPending}
        onSelect={pick}
      >
        {!q.isPlaceholderData && canGenerateTableInviteLink(event) ? (
          <TableInviteLinkRow tableId={tableId} disabled={a.blocking} />
        ) : null}
        {canAddGuest ? (
          <>
            <li className="list-none">
              <GuestNameRow
                maxLength={GUEST_NAME_MAX_LENGTH}
                isDisabled={a.blocking || guest.add.isPending}
                onAdd={(name, reset) =>
                  guest.addGuest(name, () => {
                    reset();
                    router.back();
                  })
                }
              />
            </li>
            {guest.add.isError ? (
              <GroupedRow>
                <p className="text-danger" role="alert">{t`Could not add guest. Try again.`}</p>
              </GroupedRow>
            ) : null}
          </>
        ) : null}
      </PeoplePicker>
    </div>
  );
}
