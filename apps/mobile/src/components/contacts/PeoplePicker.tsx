import {
  type ContactUser,
  communityAccessDenied,
  useListSearch,
  usePeoplePicker,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { UserRoundPlus, UsersRound } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function PeoplePicker({
  friendsOnly,
  invitationGroupId,
  disabled = false,
  excludeIds = [],
  onSelect,
}: {
  friendsOnly: boolean;
  invitationGroupId?: string;
  disabled?: boolean;
  excludeIds?: readonly string[];
  onSelect: (person: ContactUser) => void;
}) {
  const t = useT(),
    options = useCommunityApi(),
    filters = useListSearch<never>([]),
    insets = useSafeAreaInsets();
  const [foreground, accent] = useThemeColor(["foreground", "accent-foreground"]);
  const list = usePeoplePicker(options, filters.search, friendsOnly, invitationGroupId);
  return (
    <UserList
      testID="people-picker-scroll"
      data={
        communityAccessDenied(list.error)
          ? []
          : list.items.filter(
              (person) => person.id !== options.userId && !excludeIds.includes(person.id),
            )
      }
      pages={[{ ...list, isLoading: list.isPending }]}
      keyExtractor={(person) => person.id}
      contentContainerStyle={{ padding: 20, flexGrow: 1, paddingBottom: insets.bottom + 24 }}
      header={
        <ListSearch
          query={filters.query}
          onQueryChange={filters.setQuery}
          label={friendsOnly ? t("Search friends") : t("Search users")}
          placeholder={friendsOnly ? t("Search friends") : t("Search users")}
          options={[]}
          selected={[]}
          onToggle={filters.toggle}
        />
      }
      skeleton={<Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />}
      empty={
        list.needsSearch
          ? t("Enter at least 4 characters to search")
          : friendsOnly
            ? t("No friends found")
            : t("No users found")
      }
      emptyIcon={<UsersRound size={28} color={foreground} />}
      error={t("Could not load users")}
      renderRow={(person) => (
        <UserListRow
          name={person.name}
          avatarUrl={person.avatarUrl}
          secondary={person.username ?? person.email}
          onPress={() => onSelect(person)}
          isDisabled={disabled}
          accessibilityLabel={`${t("Select user")}: ${person.name}`}
          actions={
            <Button
              isIconOnly
              size="sm"
              style={{ minWidth: 44, minHeight: 44 }}
              isDisabled={disabled}
              accessibilityLabel={`${t("Select user")}: ${person.name}`}
              onPress={() => onSelect(person)}
            >
              <UserRoundPlus size={18} color={accent} />
            </Button>
          }
        />
      )}
    />
  );
}
