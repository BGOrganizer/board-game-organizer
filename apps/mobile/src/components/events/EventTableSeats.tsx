import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import {
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
import { type ReactNode, useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventJoinSheet } from "./EventJoinSheet";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
export function EventTableSeats({
  table,
  header,
  onRemove,
  hasJoinedEvent,
}: {
  table: PlannedTableResponse;
  header: ReactNode;
  hasJoinedEvent?: boolean;
  onRemove: (row: TableSeatResponse, own: boolean) => void;
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    danger = useThemeColor("danger"),
    a = useEventRecordActions(o, table.eventId);
  const roster = useEventTableRoster(o, table),
    closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const [choose, setChoose] = useState(false),
    [joining, setJoining] = useState(false);
  const canAdd =
    !closed &&
    (table.canRegister || table.canInvite) &&
    (table.groupType !== "PRIVATE" || hasJoinedEvent !== undefined);
  const join = () => {
    setChoose(false);
    setJoining(true);
  };
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={roster.rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 8 }}>
            {header}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Typography accessibilityRole="header" className="font-semibold text-foreground">
                {t("Seats list")}
              </Typography>
              <HelpPopover
                label={`${t("Seats list")}: ${t("Field help")}`}
                title={t("Seats list")}
                width={300}
              >
                <IconLegend
                  items={[
                    { icon: UserRoundCheck, description: t("Accepted player") },
                    { icon: Mail, description: t("Invitation pending") },
                    { icon: Clock3, description: t("Waiting list") },
                  ]}
                />
                <Typography className="text-sm text-foreground">
                  {t(
                    "Pending invitations reserve a place but do not vote or count toward agreement. Accepted waiting players may vote.",
                  )}
                </Typography>
                <Typography className="text-sm text-foreground">
                  {t(
                    "Free places allow joining or invitations. When capacity is reserved, an extra place lets new players join the queue. Places are not assigned physical seats.",
                  )}
                </Typography>
                <Typography className="text-sm text-foreground">
                  {t("Only the organizer and recipient can see pending invitation identities.")}
                </Typography>
              </HelpPopover>
            </View>
          </View>
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
                  name={item.name || t("You")}
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
            name =
              own && (!row.name || row.name === o.userId) ? t("You") : (row.name ?? row.userId);
          const pending = row.status === "PENDING",
            waiting = row.position === "WAITING";
          const Icon = pending ? Mail : waiting ? Clock3 : UserRoundCheck;
          const status = pending
            ? t("Invitation pending")
            : waiting
              ? t("Waiting list")
              : t("Accepted player");
          return (
            <GroupedList>
              <UserListRow
                name={name}
                avatarUrl={row.avatarUrl}
                secondary={
                  table.eventStatus === "CONFIRMED"
                    ? row.email
                    : pending && waiting
                      ? `${status} · ${t("Waiting list")}`
                      : status
                }
                badge={{
                  icon: Icon,
                  label: status,
                  color: pending || waiting ? "warning" : "success",
                }}
                actions={
                  <>
                    {own && table.canRespond && pending && !closed && table.myRegistration ? (
                      <EventTableInvitationActions
                        eventId={table.eventId}
                        registration={table.myRegistration}
                      />
                    ) : null}
                    {!closed &&
                    (own ? table.canLeave && row.status === "ACCEPTED" : table.canInvite) ? (
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
          if (roster.hasNextPage && !roster.isFetchingNextPage && !roster.isFetchNextPageError)
            roster.more();
        }}
        ListEmptyComponent={
          !roster.isPending && !roster.isError ? (
            <Typography className="text-foreground">{t("No players found")}</Typography>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: 8 }}>
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
        }
      />
      {choose ? (
        <ConfirmDialog
          title={table.canInvite ? t("Choose a place action") : t("Join table")}
          description={
            table.canInvite
              ? t("Join this table yourself or invite another player.")
              : t("Choose your availability before joining this table.")
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
            ...(!closed && table.canInvite
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
  );
}
