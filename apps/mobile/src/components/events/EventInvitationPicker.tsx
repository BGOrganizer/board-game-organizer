import { GUEST_NAME_MAX_LENGTH } from "@board-game-organizer/schemas";
import {
  canGenerateTableInviteLink,
  communityAccessDenied,
  useEventRecord,
  useEventRecordActions,
  useTableGuestActions,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GuestNameRow } from "@/components/common/ui/GuestNameRow";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { TableInviteLinkRow } from "@/components/invites/TableInviteLinkRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventInvitationPicker({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT(),
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
  if (!event?.canInvite)
    return (
      <View style={{ padding: 20 }}>
        {q.isPending ? (
          <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
        ) : (
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Invitations are unavailable. Refresh the event.")}
          </Typography>
        )}
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t("Invite players") }} />
      <PeoplePicker
        key={tableId}
        friendsOnly={!event.groupId}
        invitationTable={{ eventId, tableId }}
        disabled={a.blocking || guest.add.isPending}
        onSelect={pick}
      >
        {!q.isPlaceholderData && canGenerateTableInviteLink(event) ? (
          <TableInviteLinkRow
            key={JSON.stringify([o.apiUrl, o.userId, tableId])}
            tableId={tableId}
            disabled={a.blocking}
          />
        ) : null}
        {canAddGuest ? (
          <>
            <GuestNameRow
              maxLength={GUEST_NAME_MAX_LENGTH}
              isDisabled={a.blocking || guest.add.isPending}
              onAdd={(name) => guest.addGuest(name, () => router.back())}
            />
            {guest.add.isError ? (
              <GroupedRow>
                <Typography className="text-danger" accessibilityRole="alert">
                  {t("Could not add guest. Try again.")}
                </Typography>
              </GroupedRow>
            ) : null}
          </>
        ) : null}
      </PeoplePicker>
    </View>
  );
}
