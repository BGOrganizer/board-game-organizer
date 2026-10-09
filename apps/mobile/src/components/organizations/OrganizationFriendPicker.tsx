import {
  useOrganization,
  useOrganizationActions,
  useRelationshipList,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserRoundPlus, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationFriendPicker({ organizationId }: { organizationId: string }) {
  const t = useT();
  const o = useCommunityApi();
  const detail = useOrganization(o, organizationId);
  const actions = useOrganizationActions(o);
  const router = useRouter();
  const [foreground, accentForeground] = useThemeColor(["foreground", "accent-foreground"]);
  const friends = useRelationshipList(
    o.apiUrl,
    null,
    o.getToken,
    undefined,
    o.userId,
    "friends",
    detail.data?.role === "admin",
  );
  if (detail.isError || detail.data?.role !== "admin")
    return (
      <View style={{ padding: 20 }}>
        {detail.isPending ? (
          <Skeleton style={{ width: "100%", height: 120, borderRadius: 12 }} />
        ) : (
          <Typography className="text-danger">{t("Organization admin required")}</Typography>
        )}
      </View>
    );
  const invite = (userId: string) => {
    if (actions.busy) return;
    void actions.invite
      .mutateAsync({ id: organizationId, userId })
      .then(() => router.back())
      .catch(() => {});
  };
  return (
    <UserList
      data={(friends.data ?? []).flatMap((row) => (row.profile ? [row.profile] : []))}
      pages={[friends]}
      keyExtractor={(person) => person.id}
      contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
      header={<Stack.Screen options={{ title: t("Invite friends") }} />}
      skeleton={<Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />}
      empty={t("No friends found")}
      emptyIcon={<UsersRound size={28} color={foreground} />}
      error={t("Could not load friends")}
      renderRow={(person) => (
        <UserListRow
          name={person.name}
          avatarUrl={person.avatarUrl}
          secondary={person.username !== person.name ? person.username : undefined}
          accessibilityLabel={person.username ?? person.name}
          onPress={() => invite(person.id)}
          isDisabled={actions.busy}
          actions={
            <Button
              isIconOnly
              size="sm"
              style={{ minHeight: 44, minWidth: 44 }}
              accessibilityLabel={`${t("Add")}: ${person.name}`}
              isDisabled={actions.busy}
              onPress={() => invite(person.id)}
            >
              <UserRoundPlus size={18} color={accentForeground} />
            </Button>
          }
        />
      )}
    />
  );
}
