import {
  type ContactUser,
  communityAccessDenied,
  useListSearch,
  usePeoplePicker,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserRoundPlus, UsersRound } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function PeoplePicker({
  friendsOnly,
  invitationGroupId,
  invitationTable,
  disabled = false,
  excludeIds = [],
  onSelect,
}: {
  friendsOnly: boolean;
  invitationGroupId?: string;
  invitationTable?: { eventId: string; tableId: string };
  disabled?: boolean;
  excludeIds?: readonly string[];
  onSelect: (person: Pick<ContactUser, "id" | "name" | "email" | "avatarUrl" | "username">) => void;
}) {
  const t = useT(),
    options = useCommunityApi(),
    filters = useListSearch<never>([]),
    insets = useSafeAreaInsets();
  const [foreground, accent] = useThemeColor(["foreground", "accent-foreground"]);
  const list = usePeoplePicker(
    options,
    filters.search,
    friendsOnly,
    invitationGroupId,
    invitationTable,
  );
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
          label={
            invitationTable && !friendsOnly
              ? t("Search members")
              : friendsOnly
                ? t("Search friends")
                : t("Search users")
          }
          placeholder={
            invitationTable && !friendsOnly
              ? t("Search members")
              : friendsOnly
                ? t("Search friends")
                : t("Search users")
          }
          options={[]}
          selected={[]}
          onToggle={filters.toggle}
        />
      }
      skeleton={<Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />}
      empty={
        list.needsSearch
          ? t("Enter at least 4 characters to search")
          : invitationTable && !friendsOnly
            ? t("No members found")
            : friendsOnly
              ? t("No friends found")
              : t("No users found")
      }
      emptyIcon={<UsersRound size={28} color={foreground} />}
      error={t("Could not load users")}
      renderRow={(person) => {
        const unavailable = Boolean(
          invitationTable &&
            "invitationBlockReason" in person &&
            person.invitationBlockReason === "TABLE_TIME_CONFLICT",
        );
        const select = () => {
          if (!disabled && !unavailable) onSelect(person);
        };
        return (
          <UserListRow
            name={person.name}
            avatarUrl={person.avatarUrl}
            secondary={person.username ?? person.email}
            onPress={select}
            isDisabled={disabled || unavailable}
            accessibilityLabel={`${t("Select user")}: ${person.name}`}
            actions={
              <>
                <Button
                  isIconOnly
                  size="sm"
                  style={{ minWidth: 44, minHeight: 44 }}
                  isDisabled={disabled || unavailable}
                  accessibilityLabel={`${t("Select user")}: ${person.name}`}
                  onPress={select}
                >
                  <UserRoundPlus size={18} color={accent} />
                </Button>
                {unavailable ? (
                  <HelpPopover
                    label={`${t("Why invitation is unavailable")}: ${person.name}`}
                    title={t("Invitation unavailable")}
                  >
                    <Typography className="text-foreground">
                      {t(
                        "This user is already registered, invited, or assigned as a demonstrator at another table with overlapping times.",
                      )}
                    </Typography>
                  </HelpPopover>
                ) : null}
              </>
            }
          />
        );
      }}
    />
  );
}
