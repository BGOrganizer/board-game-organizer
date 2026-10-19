import {
  communityAccessDenied,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useState } from "react";
import { View } from "react-native";
import { PeoplePicker } from "@/components/contacts/PeoplePicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupBanDialog } from "./GroupBanDialog";
export function GroupPeoplePicker({ groupId, mode }: { groupId: string; mode: "invite" | "ban" }) {
  const options = useCommunityApi(),
    t = useT(),
    router = useRouter();
  const detail = useGroupRecord(options, groupId),
    actions = useGroupRecordActions(options);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null),
    [error, setError] = useState<unknown>(null);
  const group = communityAccessDenied(detail.error) ? undefined : detail.data;
  const failure =
    error instanceof Error && error.message.includes("BAN_FROZEN_PARTICIPATION")
      ? t("This user is involved in a frozen public event and cannot be excluded.")
      : error
        ? t("Could not update group member. Try again or refresh the list.")
        : undefined;
  if (!group || group.role !== "admin" || (mode === "invite" && !group.canInvite))
    return (
      <View style={{ padding: 20, gap: 12 }}>
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {detail.isError && !communityAccessDenied(detail.error)
                ? t("Could not load group")
                : mode === "invite" && group?.role === "admin"
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
      <Stack.Screen
        options={{ title: mode === "invite" ? t("Invite friends") : t("Exclude a user") }}
      />
      <PeoplePicker
        friendsOnly={mode === "invite"}
        disabled={actions.busy}
        onSelect={(person) =>
          mode === "invite"
            ? void invite(person.id)
            : setSelected({ id: person.id, name: person.name })
        }
      />
      {error ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {failure}
        </Typography>
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
