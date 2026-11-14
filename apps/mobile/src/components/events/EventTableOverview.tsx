import { notificationItemId, type TableSeatResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  eventOptionsRequireVote,
  hasOtherAcceptedTable,
  tableCardGames,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useNotificationAttentionContext,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { GameListRow } from "@/components/games/GameListRow";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventCard } from "./EventCard";
import { EventProposalSection } from "./EventProposalSection";
import { EventTableScheduleCard } from "./EventTableScheduleCard";
import { EventTableSeats } from "./EventTableSeats";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteCounts } from "./EventVoteCounts";
export function EventTableOverview({
  eventId,
  tableId,
  context = "personal",
  section = "overview",
  header: detailHeader,
}: {
  eventId: string;
  tableId: string;
  context?: "personal" | "event";
  section?: "overview" | "participants";
  header?: ReactNode;
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    attention = useNotificationAttentionContext();
  const [confirm, setConfirm] = useState<{
    registrationId: string;
    version: number;
    action: "cancel" | "remove";
    person: Pick<TableSeatResponse, "userId" | "name" | "username" | "avatarUrl">;
  } | null>(null);
  const table =
    communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data;
  const closed = useEventCutoff(table?.bookingClosesAt, table?.groupType === "PUBLIC");
  if (!table)
    return (
      <View style={{ padding: 20 }}>
        {q.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load table")}
            </Typography>
            <Button
              onPress={() => {
                void q.refetch();
                void event.refetch();
              }}
            >
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
    );
  const run = () => {
    if (
      !confirm ||
      (confirm.person.userId === o.userId && closed) ||
      table.eventStatus !== "PLANNING" ||
      a.blocking ||
      a.isResponding(confirm.registrationId) ||
      (confirm.action === "remove"
        ? !table.canInvite
        : !table.canLeave || table.myRegistration?.id !== confirm.registrationId)
    )
      return;
    a.respond.mutate({
      tableId,
      registrationId: confirm.registrationId,
      person: confirm.person,
      input: { action: confirm.action, version: confirm.version },
    });
    setConfirm(null);
  };
  const gameVotes = table.myRegistration?.gameVotes ?? {};
  const votableGames = eventOptionsRequireVote(table.games);
  const canVote =
    votableGames &&
    table.eventStatus === "PLANNING" &&
    event.data?.status === "PLANNING" &&
    event.data.canVote &&
    table.myRegistration?.status === "ACCEPTED";
  const eventRecovery = event.isError ? (
    <View style={{ gap: 8 }}>
      <Typography accessibilityRole="alert" className="text-danger">
        {t("Could not load event")}
      </Typography>
      <Button onPress={() => void event.refetch()}>
        <Button.Label>{t("Try again")}</Button.Label>
      </Button>
    </View>
  ) : null;
  const header = (
    <View style={{ gap: 16 }}>
      <EventTableScheduleCard
        table={table}
        timeZone={event.data?.timeZone ?? table.eventSchedule?.location?.timeZone}
      />
      {context === "personal" ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {t("Event")}
          </Typography>
          {event.data?.id === table.eventId &&
          typeof event.data.tableCount === "number" &&
          Array.isArray(event.data.myRegistrations) ? (
            <EventCard event={event.data} />
          ) : (
            <LinkedListCard
              artworkLayout="cover"
              label={`${t("Open event")}: ${table.eventName}`}
              notificationCount={attention?.get({ kind: "event", id: table.eventId })?.count}
              onPress={() =>
                router.push({ pathname: "/event/[eventId]", params: { eventId: table.eventId } })
              }
              artwork={
                <AnimatedDicebearArtwork
                  seed={table.eventId}
                  variant="constellation"
                  presentation="cover"
                />
              }
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  alignSelf: "center",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Typography
                  className="font-medium text-foreground"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {table.eventName}
                </Typography>
                <NotificationUnreadDot
                  active={Boolean(attention?.get({ kind: "event", id: table.eventId })?.count)}
                />
              </View>
              <Skeleton style={{ width: 112, height: 16, borderRadius: 4 }} />
            </LinkedListCard>
          )}
        </View>
      ) : null}
      {q.isError ? (
        <View>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load complete table details")}
          </Typography>
          <Button onPress={() => void q.refetch()}>
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        </View>
      ) : null}
      <NotificationItem itemId={notificationItemId(table.id, "games")}>
        <Typography accessibilityRole="header" className="font-semibold text-foreground">
          {t("Board games")}
        </Typography>
      </NotificationItem>
      <GroupedList>
        {tableCardGames(table).map((game) => (
          <GameListRow
            key={game.id}
            titleAccessory={
              <NotificationItem itemId={notificationItemId(table.id, "game", game.id)} />
            }
            name={game.name}
            imageUrl={game.imageUrl}
            year={game.year}
            average={game.average}
            rank={game.rank}
            durationMinutes={game.durationMinutes}
            metadata={
              votableGames ? (
                <EventVoteCounts
                  label={game.name}
                  counts={table.gameVoteCounts?.[String(game.id)]}
                />
              ) : undefined
            }
            actions={
              canVote ? (
                <EventVoteButtons
                  label={game.name}
                  value={gameVotes[String(game.id)]}
                  disabledVotes={
                    eventAvailabilityVoteIsAllowed(
                      table.games.map((row) => ({ id: String(row.gameId) })),
                      gameVotes,
                      String(game.id),
                      "NO",
                    )
                      ? []
                      : ["NO"]
                  }
                  busy={a.blocking || q.isPlaceholderData || event.isPlaceholderData}
                  onChange={(vote) =>
                    a.vote.mutate({ kind: "game", tableId, gameId: game.id, vote })
                  }
                />
              ) : undefined
            }
          />
        ))}
      </GroupedList>
      {event.data ? (
        <EventProposalSection
          event={event.data}
          kind="game"
          table={table}
          disabled={q.isPlaceholderData || event.isPlaceholderData}
        />
      ) : null}
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: table.name }} />
      {table.sharedResultsOnly ? (
        <ScreenScrollView>
          {detailHeader}
          {header}
          {eventRecovery}
        </ScreenScrollView>
      ) : (
        <EventTableSeats
          key={table.id}
          table={table}
          hasJoinedEvent={
            event.data?.myRegistrations
              ? hasOtherAcceptedTable(event.data.myRegistrations, table.id)
              : undefined
          }
          header={
            <>
              {detailHeader}
              {section === "overview" ? header : null}
              {eventRecovery}
            </>
          }
          active={section === "participants"}
          onRemove={(row, own) =>
            setConfirm({
              registrationId: row.id,
              version: row.version,
              action: own ? "cancel" : "remove",
              person: {
                userId: row.userId,
                name: row.name,
                username: row.username,
                avatarUrl: row.avatarUrl,
              },
            })
          }
        />
      )}
      {confirm ? (
        <ConfirmDialog
          title={confirm.action === "cancel" ? t("Leave table") : t("Remove player")}
          description={t("This removes the active table registration.")}
          busy={a.blocking || a.isResponding(confirm.registrationId)}
          onCancel={() => setConfirm(null)}
          actions={[{ label: t("Confirm"), variant: "danger", onPress: () => void run() }]}
        />
      ) : null}
    </View>
  );
}
