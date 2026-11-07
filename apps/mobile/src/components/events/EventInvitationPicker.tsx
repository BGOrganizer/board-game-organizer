import {
  communityAccessDenied,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventInvitationPicker({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT(),
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
        disabled={a.blocking}
        onSelect={pick}
      />
    </View>
  );
}
