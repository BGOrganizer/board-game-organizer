import {
  notificationItemId,
  type PlannedTableResponse,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  formatUsername,
  RECORD_USER_ROLES,
  tableUserRoles,
  useEventCutoff,
  useEventRecordActions,
  useEventTableRoster,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Clock3, LogOut, Mail, UserRoundCheck, UserRoundX } from "lucide-react-native";
import { type ReactNode, useRef, useState } from "react";
import { type ScrollView, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { ScrollTargetContext } from "@/components/common/ui/ScrollTargetContext";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventJoinSheet } from "./EventJoinSheet";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
export function EventTableSeats({
  table,
  header,
  onRemove,
  hasJoinedEvent,
  active = true,
}: {
  table: PlannedTableResponse;
  header: ReactNode;
  active?: boolean;
  hasJoinedEvent?: boolean;
  onRemove: (row: TableSeatResponse, own: boolean) => void;
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    [danger, muted] = useThemeColor(["danger", "muted"]),
    a = useEventRecordActions(o, table.eventId);
  const roster = useEventTableRoster(o, table),
    closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const scroll = useRef<ScrollView>(null);
  const [choose, setChoose] = useState(false),
    [joining, setJoining] = useState(false);
  const canAdd =
    ((!closed && table.canRegister) || table.canInvite) &&
    (table.groupType !== "PRIVATE" || hasJoinedEvent !== undefined);
  const join = () => {
    setChoose(false);
    setJoining(true);
  };
  return (
    <ScrollTargetContext.Provider value={scroll}>
      <View style={{ flex: 1 }}>
        <SectionList
          ref={(node) => {
            scroll.current = node?.getScrollResponder() as ScrollView | null;
          }}
          sections={
            active
              ? [
                  { key: "seats", title: t("Seats list"), data: roster.seatRows },
                  { key: "waiting", title: t("Waiting list"), data: roster.waitingRows },
                ]
              : []
          }
          stickySectionHeadersEnabled={false}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 8 }}>{header}</View>}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingTop: section.key === "waiting" ? 12 : 0,
              }}
            >
              <Typography accessibilityRole="header" className="font-semibold text-foreground">
                {section.title}
              </Typography>
              <HelpPopover
                label={`${section.title}: ${t("Field help")}`}
                title={section.title}
                width={300}
              >
                {section.key === "waiting" ? (
                  <>
                    <Typography className="text-sm text-foreground">
                      {t(
                        "When all places are reserved, new players join the waiting list. Priority is preserved, and a place may become available when another player leaves.",
                      )}
                    </Typography>
                    <Typography className="text-sm text-foreground">
                      {t(
                        "Accepted waiting players may vote. Pending invitations do not vote or count toward agreement.",
                      )}
                    </Typography>
                    <Typography className="text-sm text-foreground">
                      {t("Only the organizer and recipient can see pending invitation identities.")}
                    </Typography>
                  </>
                ) : (
                  <>
                    <IconLegend
                      items={[
                        { icon: UserRoundCheck, description: t("Accepted player") },
                        { icon: Mail, description: t("Invitation pending") },
                      ]}
                    />
                    <Typography className="text-sm text-foreground">
                      {t(
                        "Pending invitations reserve a place but do not vote or count toward agreement.",
                      )}
                    </Typography>
                    <Typography className="text-sm text-foreground">
                      {t(
                        "Free places allow joining or invitations. Places are not assigned physical seats.",
                      )}
                    </Typography>
                    <Typography className="text-sm text-foreground">
                      {t("Only the organizer and recipient can see pending invitation identities.")}
                    </Typography>
                  </>
                )}
              </HelpPopover>
            </View>
          )}
          renderSectionFooter={({ section }) =>
            section.key === "waiting" &&
            !section.data.length &&
            !roster.isPending &&
            !roster.isError &&
            (!roster.queueOpen || !roster.hasNextPage) ? (
              <EmptyList icon={<Clock3 size={28} color={muted} />}>
                {t("No players waiting")}
              </EmptyList>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.kind === "pending") {
              const label =
                item.phase === "verifying"
                  ? t("Checking saved changes")
                  : item.action === "join"
                    ? t("Joining table")
                    : item.action === "accept"
                      ? t("Accepting invitation")
                      : t("Sending invitation");
              return (
                <GroupedList>
                  <UserListRow
                    name={formatUsername(item.username, item.name || t("You"))}
                    avatarUrl={item.avatarUrl}
                    secondary={label}
                    badge={{ icon: item.action ? Clock3 : Mail, label, color: "warning" }}
                  />
                </GroupedList>
              );
            }
            if (item.kind !== "player") {
              const reserved = item.kind === "reserved",
                label = reserved
                  ? t("Reserved place")
                  : item.queue
                    ? t("Join waiting list")
                    : t("Free place");
              return (
                <AddUserRow
                  label={label}
                  isDisabled={reserved || !canAdd || a.blocking}
                  onPress={() => {
                    if (table.canInvite || table.groupType === "PRIVATE") setChoose(true);
                    else void join();
                  }}
                />
              );
            }
            const row = item.user,
              own = row.userId === o.userId,
              name = formatUsername(
                row.username,
                own && (!row.name || row.name === o.userId) ? t("You") : (row.name ?? row.userId),
              );
            const pending = row.status === "PENDING";
            const roles = tableUserRoles({
              ...row,
              demonstrator: table.demonstratorUserId === row.userId,
            });
            const primary = roles[0];
            const status = primary
              ? t(RECORD_USER_ROLES[primary].message)
              : pending && row.kind === "SELF"
                ? t("Participation requested")
                : t("Loading…");
            return (
              <GroupedList>
                <UserListRow
                  titleAccessory={
                    <NotificationItem
                      itemId={
                        own && pending
                          ? notificationItemId(table.id, "invitation", undefined, "table")
                          : undefined
                      }
                      readOnly={!table.canRespond}
                    />
                  }
                  name={name}
                  avatarUrl={row.avatarUrl}
                  secondary={status}
                  badgeContent={<UserRoleBadge roles={roles} />}
                  actions={
                    <>
                      {own && table.canRespond && pending && table.myRegistration ? (
                        <EventTableInvitationActions
                          eventId={table.eventId}
                          registration={table.myRegistration}
                        />
                      ) : null}
                      {(
                        own
                          ? !closed && table.canLeave && row.status === "ACCEPTED"
                          : table.canInvite
                      ) ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="danger-soft"
                          style={{ minWidth: 44, minHeight: 44 }}
                          isDisabled={a.blocking}
                          accessibilityLabel={
                            own ? t("Leave table") : `${t("Remove player")}: ${name}`
                          }
                          onPress={() => onRemove(row, own)}
                        >
                          {own ? (
                            <LogOut size={18} color={danger} />
                          ) : (
                            <UserRoundX size={18} color={danger} />
                          )}
                        </Button>
                      ) : null}
                    </>
                  }
                />
              </GroupedList>
            );
          }}
          onEndReached={() => {
            if (
              active &&
              roster.hasNextPage &&
              !roster.isFetchingNextPage &&
              !roster.isFetchNextPageError
            )
              roster.more();
          }}
          ListFooterComponent={
            active ? (
              <View style={{ gap: 8 }}>
                {!roster.rows.length && !roster.isPending && !roster.isError ? (
                  <Typography className="text-foreground">{t("No players found")}</Typography>
                ) : null}
                {roster.isPending || roster.isFetchingNextPage ? (
                  <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
                ) : null}
                {roster.isError ? (
                  <View>
                    <Typography accessibilityRole="alert" className="text-danger">
                      {t("Could not load players")}
                    </Typography>
                    <Button onPress={roster.refetch}>
                      <Button.Label>{t("Try again")}</Button.Label>
                    </Button>
                  </View>
                ) : null}
                {roster.hasNextPage ? (
                  <Button
                    variant="outline"
                    isDisabled={roster.isFetchingNextPage}
                    onPress={roster.more}
                  >
                    <Button.Label>
                      {roster.isFetchNextPageError ? t("Try again") : t("Load more")}
                    </Button.Label>
                  </Button>
                ) : null}
              </View>
            ) : null
          }
        />
        {choose ? (
          <ConfirmDialog
            title={table.canInvite ? t("Choose a place action") : t("Join table")}
            description={
              table.canInvite
                ? t("Join this table yourself or invite another player.")
                : t(
                    "Joining accepts the current event and table settings. Vote only where multiple options are available.",
                  )
            }
            busy={a.blocking}
            onCancel={() => setChoose(false)}
            actions={[
              ...(!closed && table.canRegister
                ? [
                    {
                      label: t("Join table"),
                      variant: "primary" as const,
                      onPress: () => void join(),
                    },
                  ]
                : []),
              ...(table.canInvite
                ? [
                    {
                      label: t("Invite players"),
                      variant: "primary" as const,
                      onPress: () => {
                        setChoose(false);
                        router.push({
                          pathname: "/event/invite",
                          params: { eventId: table.eventId, tableId: table.id },
                        });
                      },
                    },
                  ]
                : []),
            ]}
          ></ConfirmDialog>
        ) : null}
        {joining ? (
          <EventJoinSheet
            eventId={table.eventId}
            tableId={table.id}
            onClose={() => setJoining(false)}
          />
        ) : null}
      </View>
    </ScrollTargetContext.Provider>
  );
}
