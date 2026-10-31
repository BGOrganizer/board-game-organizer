import {
  communityAccessDenied,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function GroupPeoplePicker({ groupId }: { groupId: string }) {
  const options = useCommunityApi(),
    t = useT(),
    router = useRouter();
  const detail = useGroupRecord(options, groupId),
    actions = useGroupRecordActions(options, groupId);
  const group = communityAccessDenied(detail.error) ? undefined : detail.data;
  if (group?.role !== "admin" || !group.canInvite)
    return (
      <View style={{ padding: 20, gap: 12 }}>
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {detail.isError && !communityAccessDenied(detail.error)
                ? t("Could not load group")
                : group?.role === "admin"
                  ? t("Invitations require an approved group.")
                  : t("Group admin required")}
            </Typography>
            <Button variant="outline" onPress={() => void detail.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
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
      <Stack.Screen options={{ title: t("Invite friends") }} />
      <PeoplePicker
        friendsOnly
        invitationGroupId={groupId}
        disabled={actions.blocking}
        onSelect={invite}
      />
    </>
  );
}
