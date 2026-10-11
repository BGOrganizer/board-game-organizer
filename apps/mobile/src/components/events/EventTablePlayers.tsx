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
  LockKeyhole,
  LogOut,
  UserRoundMinus,
  X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { CommunityConfirm } from "@/components/common/ui/CommunityConfirm";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { MatchPlayerLimits } from "@/components/matches/MatchPlayerLimits";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

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
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const accent = useThemeColor("accent-foreground");
  const danger = useThemeColor("danger");
  const dangerForeground = useThemeColor("danger-foreground");
  const byId = new Map(flow.live.map((row) => [row.id, row]));
  const limits = frozen?.match ?? flow.table;
  const unavailableExplanation =
    flow.joinUnavailableReason === "closed"
      ? t("Bookings for this table are not open. Free places cannot currently be reserved.")
      : flow.joinUnavailableReason === "already-booked"
        ? t("You already have a reservation or pending request for this table.")
        : flow.joinUnavailableReason === "busy"
          ? t("Wait for the current action to finish before reserving a place.")
          : t("This place is free, but booking is currently unavailable to you.");
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
            : t("Leave place");
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
          <View style={{ gap: 8 }}>
            {limits ? (
              <MatchPlayerLimits minPlayers={limits.minPlayers} maxPlayers={limits.maxPlayers} />
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Armchair size={18} color={muted} accessible={false} />
              <Typography accessibilityRole="header" className="font-semibold text-foreground">
                {t("Table seats")}
              </Typography>
            </View>
          </View>
        }
        renderRow={(seat) => {
          const person = seat.user;
          if (!person)
            return (
              <GroupedRow>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Button
                    variant="ghost"
                    style={{ flex: 1, minHeight: 44, justifyContent: "flex-start" }}
                    isDisabled={seat.reserved || !flow.canJoin}
                    accessibilityLabel={`${seat.reserved ? t("Reserved place") : t("Reserve a place")}: ${seat.index + 1}`}
                    onPress={() => flow.openJoin(seat.index)}
                  >
                    {seat.reserved ? (
                      <LockKeyhole size={20} color={muted} />
                    ) : (
                      <Armchair size={20} color={muted} />
                    )}
                    <Button.Label className="text-muted">
                      {seat.reserved ? t("Reserved place") : t("Empty place")}
                    </Button.Label>
                  </Button>
                  {seat.reserved || !flow.canJoin ? (
                    <HelpPopover
                      label={`${seat.reserved ? t("Why is this place reserved?") : t("Why can't I reserve this place?")}: ${seat.index + 1}`}
                      title={seat.reserved ? t("Reserved place") : t("Empty place")}
                      align="end"
                    >
                      <Typography className="text-foreground">
                        {seat.reserved
                          ? t(
                              "This place is already reserved and cannot be selected. It may belong to a pending request or a player whose details are not currently shown.",
                            )
                          : unavailableExplanation}
                      </Typography>
                    </HelpPopover>
                  ) : null}
                </View>
              </GroupedRow>
            );
          const own = person.userId === options.userId;
          const name = person.name || (own ? t("You") : t("Username unavailable"));
          const booking = byId.get(person.id);
          return (
            <UserListRow
              name={name}
              avatarUrl={person.avatarUrl}
              secondary={person.secondary ?? t("Username unavailable")}
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
                      accessibilityLabel={`${t("Leave place")}: ${name}`}
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
          cancelLast={mode === "manage" || mode === "invitation" || mode === "remove"}
          actionsInRow
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
                    variant: "danger-soft",
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
                      ) : mode === "remove" ? (
                        <UserRoundMinus size={18} color={dangerForeground} />
                      ) : (
                        <LogOut size={18} color={dangerForeground} />
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
