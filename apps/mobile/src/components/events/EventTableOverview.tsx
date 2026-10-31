import type { TableSeatResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  eventAvailabilityVoteIsAllowed,
  hasOtherAcceptedTable,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTable,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useState } from "react";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { GameListRow } from "@/components/games/GameListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableInfo } from "./EventTableInfo";
import { EventTableSeats } from "./EventTableSeats";
import { EventVoteButtons } from "./EventVoteButtons";
import { EventVoteCounts } from "./EventVoteCounts";
export function EventTableOverview({
  eventId,
  tableId,
  context = "personal",
}: {
  eventId: string;
  tableId: string;
  context?: "personal" | "event";
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId);
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
      closed ||
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
  const confirmed = table.confirmed;
  const gameVotes = table.myRegistration?.gameVotes ?? {};
  const canVote =
    table.eventStatus === "PLANNING" &&
    event.data?.status === "PLANNING" &&
    event.data.canVote &&
    !closed &&
    table.myRegistration?.status === "ACCEPTED";
  const header = (
    <View style={{ gap: 16 }}>
      <EventTableInfo table={table} />
      {context === "personal" ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {t("Event")}
          </Typography>
          <LinkedListCard
            label={`${t("Open event")}: ${table.eventName}`}
            onPress={() =>
              router.push({ pathname: "/event/[eventId]", params: { eventId: table.eventId } })
            }
          >
            <AnimatedDicebearArtwork seed={table.eventId} variant="constellation" size={40} />
            <Typography
              className="font-medium text-foreground"
              style={{ flex: 1, alignSelf: "center" }}
            >
              {table.eventName}
            </Typography>
          </LinkedListCard>
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
      {event.isError ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load event")}
          </Typography>
          <Button onPress={() => void event.refetch()}>
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {table.startsAt ? (
        <View style={{ gap: 4 }}>
          <DateTimeInfo
            startsAt={table.startsAt}
            endsAt={table.confirmed?.endsAt}
            timeZone={event.data?.timeZone}
          />
          <Typography className="text-foreground">
            {t("Duration")}:{" "}
            {(confirmed
              ? table.games.find((game) => game.gameId === confirmed.gameId)?.durationMinutes
              : undefined) ??
              Math.max(0, ...table.games.map((game) => game.durationMinutes ?? 0))}{" "}
            {t("minutes")}
          </Typography>
        </View>
      ) : null}
      {table.demonstratorUserId ? (
        <Typography className="text-foreground">
          {t("Demonstrator")}: {table.demonstratorName ?? t("Unknown")}
        </Typography>
      ) : null}
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {t("Board games")}
      </Typography>
      <GroupedList>
        {table.gamesDetail
          .filter(
            (game) =>
              table.eventStatus === "PLANNING" ||
              !table.confirmed ||
              table.confirmed.gameId === game.id,
          )
          .map((game) => (
            <GameListRow
              key={game.id}
              name={game.name}
              imageUrl={game.imageUrl}
              year={game.year}
              average={game.average}
              rank={game.rank}
              metadata={
                <EventVoteCounts
                  label={game.name}
                  counts={table.gameVoteCounts?.[String(game.id)]}
                />
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
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: table.name }} />
      <EventTableSeats
        key={table.id}
        table={table}
        hasJoinedEvent={
          event.data?.myRegistrations
            ? hasOtherAcceptedTable(event.data.myRegistrations, table.id)
            : undefined
        }
        header={header}
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
