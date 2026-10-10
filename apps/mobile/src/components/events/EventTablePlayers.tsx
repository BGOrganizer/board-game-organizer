import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { useEventTableParticipation } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Armchair,
  Check,
  ClipboardCheck,
  Clock3,
  LogOut,
  UserRoundMinus,
  X,
} from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableInvitationPicker } from "./EventTableInvitationPicker";

export function EventTablePlayers({
  eventId,
  tableId,
  frozen,
  renderActions,
}: {
  eventId: string;
  tableId: string;
  frozen?: MatchDetailResponse;
  renderActions?: (userId: string) => ReactNode;
}) {
  const t = useT();
  const options = useCommunityApi();
  const flow = useEventTableParticipation(options, eventId, tableId, frozen);
  const [inviting, setInviting] = useState(false);
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const accent = useThemeColor("accent-foreground");
  const danger = useThemeColor("danger");
  const byId = new Map(flow.live.map((row) => [row.id, row]));
  const dialog = flow.dialog;
  const mode = dialog?.kind === "join" ? "join" : dialog?.mode;
  const run = (action?: Parameters<typeof flow.submit>[0]) => {
    void flow.submit(action).catch(() => undefined);
  };
  const title =
    mode === "join"
      ? t("Reserve a place")
      : mode === "manage"
        ? t("Respond to participation request")
        : mode === "invitation"
          ? t("Respond to table invitation")
          : mode === "remove"
            ? t("Remove player")
            : t("Leave table");
  const description =
    mode === "join"
      ? t(
          "Your place will be reserved while an administrator reviews your request. You will be notified when it is accepted or rejected.",
        )
      : mode === "manage"
        ? t("Accept or reject this table participation request.")
        : mode === "invitation"
          ? t("Accept or reject this table invitation.")
          : mode === "remove"
            ? t("This player's reserved place will become available again.")
            : t("Your reserved place will become available again.");
  if (inviting && flow.event && flow.table && flow.admin && flow.open)
    return (
      <EventTableInvitationPicker
        event={flow.event}
        table={flow.table}
        occupied={flow.live.map((row) => row.userId)}
        onClose={() => setInviting(false)}
      />
    );
  if (flow.visitor)
    return (
      <Typography className="text-foreground">
        {t("Only confirmed organization members can view players and reserve places.")}
      </Typography>
    );
  return (
    <View style={{ flex: 1 }}>
      <UserList
        data={flow.loading ? [] : flow.seats}
        testID="event-table-players"
        pages={[
          {
            hasNextPage: Boolean(flow.hasMore),
            isLoading: flow.loading,
            isError: Boolean(flow.error),
            isFetchingNextPage: flow.bookings.isFetchingNextPage,
            isFetchNextPageError: flow.bookings.isFetchNextPageError,
            fetchNextPage: () => {
              void (
                flow.bookings.isFetchNextPageError ? flow.bookings.fetchNextPage() : flow.advance()
              ).catch(() => undefined);
            },
            refetch: () => {
              void flow.eventQuery.refetch();
              void flow.tableQuery.refetch();
              if (!flow.frozen && !flow.visitor) void flow.bookings.refetch();
            },
          },
        ]}
        keyExtractor={(seat) => String(seat.index)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        empty={t("No players")}
        emptyIcon={<Armchair size={28} color={muted} />}
        error={t("Could not load table players.")}
        skeleton={<Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />}
        header={
          flow.event &&
          flow.table &&
          flow.admin &&
          flow.open &&
          flow.event.status === "PUBLISHED" ? (
            <Button
              variant="secondary"
              isDisabled={flow.busy || flow.table.reservedCount >= flow.table.maxPlayers}
              onPress={() => setInviting(true)}
            >
              {t("Invite organization members")}
            </Button>
          ) : undefined
        }
        renderRow={(seat) => {
          const person = seat.user;
          if (!person)
            return (
              <GroupedRow>
                {seat.reserved ? (
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
                  >
                    <Armchair size={20} color={muted} />
                    <Typography className="text-muted">{t("Reserved place")}</Typography>
                  </View>
                ) : (
                  <Button
                    variant="ghost"
                    style={{ flex: 1, minHeight: 44, justifyContent: "flex-start" }}
                    isDisabled={!flow.canJoin}
                    accessibilityLabel={`${t("Reserve a place")}: ${seat.index + 1}`}
                    onPress={() => flow.openJoin(seat.index)}
                  >
                    <Armchair size={20} color={muted} />
                    <Button.Label className="text-muted">{t("Empty place")}</Button.Label>
                  </Button>
                )}
              </GroupedRow>
            );
          const own = person.userId === options.userId;
          const name = person.name || (own ? t("You") : t("Username unavailable"));
          const booking = byId.get(person.id);
          return (
            <UserListRow
              name={name}
              avatarUrl={person.avatarUrl}
              secondary={person.secondary}
              badge={
                booking?.status === "PENDING"
                  ? { icon: Clock3, label: t("Pending"), color: "warning" }
                  : undefined
              }
              actions={
                <>
                  {booking && flow.canManage(booking) ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      style={{ minHeight: 44, minWidth: 44 }}
                      accessibilityLabel={`${t("Respond to participation request")}: ${name}`}
                      isDisabled={flow.busy}
                      onPress={() => flow.openBooking(booking, "manage")}
                    >
                      <ClipboardCheck size={18} color={accent} />
                    </Button>
                  ) : null}
                  {booking && flow.canRespond(booking) ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="primary"
                      style={{ minHeight: 44, minWidth: 44 }}
                      accessibilityLabel={`${t("Respond to table invitation")}: ${name}`}
                      isDisabled={flow.busy}
                      onPress={() => flow.openBooking(booking, "invitation")}
                    >
                      <ClipboardCheck size={18} color={accent} />
                    </Button>
                  ) : null}
                  {own ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      style={{ minHeight: 44, minWidth: 44 }}
                      accessibilityLabel={`${t("Leave table")}: ${name}`}
                      isDisabled={flow.busy || !booking || !flow.canLeave(booking)}
                      onPress={() => {
                        if (booking) flow.openBooking(booking, "cancel");
                      }}
                    >
                      <LogOut size={18} color={danger} />
                    </Button>
                  ) : booking && flow.admin && flow.open ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      style={{ minHeight: 44, minWidth: 44 }}
                      accessibilityLabel={`${t("Remove player")}: ${name}`}
                      isDisabled={flow.busy}
                      onPress={() => flow.openBooking(booking, "remove")}
                    >
                      <UserRoundMinus size={18} color={danger} />
                    </Button>
                  ) : null}
                  {renderActions?.(person.userId)}
                </>
              }
            >
              {booking?.status === "PENDING" ? (
                <Typography className="text-sm text-muted">
                  {booking.kind === "REQUEST" ? t("Awaiting admin approval") : t("Invited")}
                </Typography>
              ) : null}
            </UserListRow>
          );
        }}
      />
      {dialog ? (
        <CommunityConfirm
          title={title}
          description={description}
          busy={flow.busy}
          onCancel={flow.dismiss}
          cancelLast
          actionsInRow={mode === "manage" || mode === "invitation"}
          cancelIcon={<X size={18} color={foreground} />}
          actions={
            mode === "manage" || mode === "invitation"
              ? [
                  {
                    label: t("Accept"),
                    variant: "primary",
                    icon: <Check size={18} color={accent} />,
                    onPress: () => run(mode === "manage" ? "approve" : "accept"),
                  },
                  {
                    label: t("Reject"),
                    variant: "danger",
                    icon: <X size={18} color={danger} />,
                    onPress: () => run(mode === "manage" ? "reject" : "decline"),
                  },
                ]
              : [
                  {
                    label: title,
                    variant: mode === "join" ? "primary" : "danger",
                    icon:
                      mode === "join" ? (
                        <Armchair size={18} color={accent} />
                      ) : (
                        <LogOut size={18} color={danger} />
                      ),
                    onPress: () =>
                      run(mode === "join" ? undefined : mode === "remove" ? "remove" : "cancel"),
                  },
                ]
          }
        />
      ) : null}
    </View>
  );
}
