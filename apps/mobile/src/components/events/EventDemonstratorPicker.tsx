import type { OrganizationMemberResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useListSearch,
  useOrganizationMembers,
} from "@board-game-organizer/shared";
import { Stack } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { ArrowLeft, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventDemonstratorPicker({
  organizationId,
  onSelect,
  onClose,
}: {
  organizationId: string;
  onSelect: (member: OrganizationMemberResponse) => void;
  onClose: () => void;
}) {
  const t = useT();
  const foreground = useThemeColor("foreground");
  const search = useListSearch([]);
  const members = useOrganizationMembers(
    useCommunityApi(),
    organizationId,
    "accepted",
    search.search,
  );
  return (
    <UserList
      data={communityAccessDenied(members.error) ? [] : members.items}
      pages={[members]}
      keyExtractor={(member) => member.userId}
      contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
      header={
        <View style={{ gap: 12 }}>
          <Stack.Screen
            options={{
              title: t("Choose demonstrator"),
              headerLeft: () => (
                <Button isIconOnly variant="ghost" accessibilityLabel={t("Back")} onPress={onClose}>
                  <ArrowLeft size={24} color={foreground} />
                </Button>
              ),
            }}
          />
          <ListSearch
            label={t("Organization members")}
            placeholder={t("Search organization members")}
            query={search.query}
            onQueryChange={search.setQuery}
            options={[]}
            selected={[]}
            onToggle={() => {}}
          />
        </View>
      }
      skeleton={<Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />}
      empty={t("No members found")}
      emptyIcon={<UsersRound size={28} color={foreground} />}
      error={t("Could not load organization members")}
      renderRow={(member) => (
        <UserListRow
          name={member.name ?? member.username ?? t("Username unavailable")}
          avatarUrl={member.avatarUrl}
          secondary={member.username}
          accessibilityLabel={member.username ?? member.name ?? t("Username unavailable")}
          onPress={() => onSelect(member)}
        />
      )}
    />
  );
}
