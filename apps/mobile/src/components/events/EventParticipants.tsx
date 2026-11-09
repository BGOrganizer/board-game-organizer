import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventUserRoles,
  formatUsername,
  RECORD_USER_ROLES,
  useEventParticipantManagement,
  useEventParticipants,
  type useEventRecordActions,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserRoundMinus } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { MemberActions } from "@/components/common/ui/MemberActions";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventParticipants({
  event,
  actions,
  disabled = false,
}: {
  event: PlannedEventResponse;
  actions: ReturnType<typeof useEventRecordActions>;
  disabled?: boolean;
}) {
  const t = useT(),
    o = useCommunityApi(),
    q = useEventParticipants(
      o,
      event.id,
      event.canManage ? { mode: "review", groupId: event.groupId } : { mode: "member" },
    ),
    insets = useSafeAreaInsets();
  const m = useEventParticipantManagement(o, event, q.items, actions, disabled);
  const [foreground, danger] = useThemeColor(["foreground", "danger-foreground"]);
  const stale = t("Event details changed. Close and reopen this action.");
  return (
    <>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: insets.bottom + 112 }}
        data={q.items}
        keyExtractor={(person) => person.userId}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        onScrollBeginDrag={q.beginScroll}
        onEndReached={q.endReached}
        onEndReachedThreshold={0.4}
        renderItem={({ item: person }) => {
          const name = formatUsername(person.username, person.name || t("Username unavailable"));
          const roles = eventUserRoles(person);
          const primary = roles[0];
          const items = [
            ...(m.canAct(person, "remove")
              ? [
                  {
                    action: "remove" as const,
                    label: t("Remove from event"),
                    icon: <UserRoundMinus size={20} color={foreground} accessible={false} />,
                  },
                ]
              : []),
          ];
          return (
            <GroupedList>
              <UserListRow
                name={name}
                avatarUrl={person.avatarUrl}
                secondary={primary ? t(RECORD_USER_ROLES[primary].message) : undefined}
                badgeContent={<UserRoleBadge roles={roles} />}
                actions={
                  <MemberActions
                    title={`${t("Manage participant")}: ${name}`}
                    busy={m.isBusy(person)}
                    items={items}
                    onAction={(action) => m.open(person, action)}
                  />
                }
              />
            </GroupedList>
          );
        }}
        ListEmptyComponent={
          !q.isPending && !q.isError && !q.hasMore ? (
            <Typography accessibilityLiveRegion="polite" className="text-muted">
              {t("No participants yet")}
            </Typography>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {q.isPending || q.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {q.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load participants")}
                </Typography>
                <Button variant="secondary" onPress={() => void q.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </>
            ) : null}
            {q.hasMore ? (
              <Button
                variant="secondary"
                isDisabled={!q.cachedMore && (q.isFetching || q.isError)}
                onPress={q.loadMore}
              >
                <Button.Label>{t("Load more")}</Button.Label>
              </Button>
            ) : null}
          </View>
        }
      />
      {m.managed?.action === "remove" ? (
        <ConfirmDialog
          title={t("Remove from event")}
          description={t(
            "All active registrations for this person in this event will be removed. Group membership stays unchanged.",
          )}
          onCancel={m.close}
          actions={
            m.stale
              ? []
              : [
                  {
                    label: t("Remove from event"),
                    variant: "danger",
                    icon: <UserRoundMinus size={18} color={danger} accessible={false} />,
                    onPress: () => m.confirm(),
                  },
                ]
          }
        >
          {m.stale ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {stale}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
