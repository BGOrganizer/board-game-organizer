import { communityAccessDenied, useGroupPeople, useListSearch } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserRoundPlus, UsersRound } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function GroupMemberPicker({
  groupId,
  disabled = false,
  excludeIds = [],
  onSelect,
}: {
  groupId: string;
  disabled?: boolean;
  excludeIds?: readonly string[];
  onSelect: (person: { id: string; name: string; avatarUrl: string | null }) => void;
}) {
  const t = useT(),
    o = useCommunityApi(),
    f = useListSearch<never>([]),
    q = useGroupPeople(o, groupId, "accepted", f.search),
    insets = useSafeAreaInsets(),
    fg = useThemeColor("accent-foreground");
  return (
    <UserList
      data={(communityAccessDenied(q.error) ? [] : q.items).filter(
        (row) => !excludeIds.includes(row.userId),
      )}
      pages={[{ ...q, isLoading: q.isPending }]}
      keyExtractor={(row) => row.userId}
      contentContainerStyle={{ padding: 20, flexGrow: 1, paddingBottom: insets.bottom + 24 }}
      header={
        <ListSearch
          query={f.query}
          onQueryChange={f.setQuery}
          label={t("Search members")}
          placeholder={t("Search members")}
          options={[]}
          selected={[]}
          onToggle={f.toggle}
        />
      }
      skeleton={<Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />}
      empty={t("No members found")}
      emptyIcon={<UsersRound size={28} color={fg} />}
      error={t("Could not load group members")}
      renderRow={(row) => (
        <UserListRow
          name={row.name ?? row.userId}
          avatarUrl={row.avatarUrl}
          secondary={row.isAdmin ? t("Admin") : undefined}
          actions={
            <Button
              isIconOnly
              size="sm"
              style={{ minWidth: 44, minHeight: 44 }}
              accessibilityLabel={`${t("Select user")}: ${row.name ?? row.userId}`}
              isDisabled={disabled}
              onPress={() =>
                onSelect({ id: row.userId, name: row.name ?? row.userId, avatarUrl: row.avatarUrl })
              }
            >
              <UserRoundPlus size={18} color={fg} />
            </Button>
          }
        />
      )}
    />
  );
}
