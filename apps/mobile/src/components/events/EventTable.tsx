import {
  communityAccessDenied,
  eventTablePeople,
  useEventCutoff,
  useEventRecord,
  useEventRecordActions,
  useRecordTable,
  useTableSeats,
} from "@board-game-organizer/shared";
import { Stack, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserRoundX } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { GameListRow } from "@/components/games/GameListRow";
import { ScoreIdentity } from "@/components/ratings/ScoreIdentity";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableCard } from "./EventTableCard";
import { EventVoteButtons } from "./EventVoteButtons";
export function EventTable({ eventId, tableId }: { eventId: string; tableId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    insets = useSafeAreaInsets(),
    fg = useThemeColor("foreground"),
    q = useRecordTable(o, eventId, tableId),
    event = useEventRecord(o, eventId),
    a = useEventRecordActions(o, eventId),
    [pending, setPending] = useState(false),
    [confirm, setConfirm] = useState<{
      registrationId: string;
      version: number;
      action: "cancel" | "remove";
    } | null>(null),
    [error, setError] = useState(false),
    table =
      communityAccessDenied(q.error) || communityAccessDenied(event.error) ? undefined : q.data,
    seats = useTableSeats(
      {
        ...o,
        enabled:
          o.enabled !== false &&
          Boolean(table) &&
          table?.eventStatus !== "TERMINATED" &&
          (!pending || table?.adminUserId === o.userId),
      },
      eventId,
      tableId,
      pending,
    );
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
            <Button onPress={() => void q.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
    );
  const run = async () => {
    if (!confirm) return;
    setError(false);
    try {
      await a.respond.mutateAsync({
        registrationId: confirm.registrationId,
        input: { action: confirm.action, version: confirm.version },
      });
      setConfirm(null);
    } catch {
      setError(true);
    }
  };
  const canVote =
      table.eventStatus === "PLANNING" &&
      event.data?.status === "PLANNING" &&
      event.data.canVote &&
      !closed &&
      table.myRegistration?.status === "ACCEPTED",
    terminated = table.eventStatus === "TERMINATED";
  const header = (
    <View style={{ gap: 16 }}>
      <EventTableCard table={table} />
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
      <Button
        variant="ghost"
        onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId } })}
      >
        <Button.Label>{t("Back to event")}</Button.Label>
      </Button>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {table.canRegister && !closed ? (
          <Button isDisabled={a.busy} onPress={() => a.register.mutate(table.id)}>
            <Button.Label>{t("Join table")}</Button.Label>
          </Button>
        ) : null}
        {table.canLeave && !closed && table.myRegistration ? (
          <Button
            variant="danger-soft"
            isDisabled={a.busy}
            onPress={() =>
              setConfirm({
                registrationId: table.myRegistration!.id,
                version: table.myRegistration!.version,
                action: "cancel",
              })
            }
          >
            <Button.Label>{t("Leave table")}</Button.Label>
          </Button>
        ) : null}
        {table.canInvite && !closed ? (
          <Button
            variant="outline"
            onPress={() => router.push({ pathname: "/event/invite", params: { eventId, tableId } })}
          >
            <Button.Label>{t("Invite players")}</Button.Label>
          </Button>
        ) : null}
      </View>
      {table.startsAt ? (
        <View style={{ gap: 4 }}>
          <DateTimeInfo
            startsAt={table.startsAt}
            endsAt={table.confirmed?.endsAt}
            timeZone={event.data?.timeZone}
          />
          <Typography className="text-foreground">
            {t("Duration")}:{" "}
            {(table.confirmed
              ? table.games.find((game) => game.gameId === table.confirmed!.gameId)?.durationMinutes
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
      <Typography className="font-semibold text-foreground">{t("Board games")}</Typography>
      {table.gamesDetail
        .filter((game) => !table.confirmed || table.confirmed.gameId === game.id)
        .map((game) => (
          <View key={game.id} style={{ gap: 8 }}>
            <GameListRow
              name={game.name}
              imageUrl={game.imageUrl}
              year={game.year}
              average={game.average}
              rank={game.rank}
            />
            {canVote ? (
              <EventVoteButtons
                label={game.name}
                value={table.myRegistration?.gameVotes[String(game.id)]}
                busy={a.busy}
                onChange={(vote) => a.vote.mutate({ kind: "game", tableId, gameId: game.id, vote })}
              />
            ) : null}
          </View>
        ))}
      <Typography className="font-semibold text-foreground">
        {terminated ? t("Results") : t("Seats")}
      </Typography>
      {!terminated && table.adminUserId === o.userId ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button variant={pending ? "ghost" : "primary"} onPress={() => setPending(false)}>
            <Button.Label>{t("Accepted")}</Button.Label>
          </Button>
          <Button variant={pending ? "primary" : "ghost"} onPress={() => setPending(true)}>
            <Button.Label>{t("Pending invitations")}</Button.Label>
          </Button>
        </View>
      ) : null}
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: table.name }} />
      <FlatList
        data={eventTablePeople(table, seats.items)}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ gap: 8 }}>
            {item.profileLoaded ? (
              terminated ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <ScoreIdentity
                    player={{
                      id: item.userId,
                      name: item.name,
                      email: item.email,
                      avatarUrl: item.avatarUrl,
                    }}
                    rank={item.rank}
                  />
                </View>
              ) : (
                <UserListRow
                  name={`${item.rank ? `${item.rank}. ` : ""}${item.name}`}
                  avatarUrl={item.avatarUrl}
                  secondary={
                    table.eventStatus !== "PLANNING"
                      ? item.email
                      : item.registration?.position === "WAITING"
                        ? t("Waiting list")
                        : item.registration?.status === "PENDING"
                          ? t("Invitation pending")
                          : t("Reserved place")
                  }
                  actions={
                    table.canInvite && !closed && item.registration && item.userId !== o.userId ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="danger-soft"
                        accessibilityLabel={`${t("Remove player")}: ${item.name}`}
                        isDisabled={a.busy}
                        onPress={() =>
                          setConfirm({
                            registrationId: item.registration!.id,
                            version: item.registration!.version,
                            action: "remove",
                          })
                        }
                      >
                        <UserRoundX size={18} color={fg} />
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <Skeleton style={{ width: "100%", height: 60, borderRadius: 12 }} />
            )}
            {terminated ? (
              <Typography className="text-foreground">
                {t("Score")}: {item.score ?? t("ND")}
                {item.delta !== undefined
                  ? ` · ${t("Global rating change")}: ${item.delta > 0 ? "+" : ""}${item.delta.toFixed(2)}`
                  : ""}
                {item.groupDelta !== undefined
                  ? ` · ${t("Group rating change")}: ${item.groupDelta > 0 ? "+" : ""}${item.groupDelta.toFixed(2)}`
                  : ""}
              </Typography>
            ) : null}
          </View>
        )}
        onEndReached={() => {
          if (
            !terminated &&
            seats.hasNextPage &&
            !seats.isFetchingNextPage &&
            !seats.isFetchNextPageError
          )
            void seats.fetchNextPage();
        }}
        ListEmptyComponent={
          !terminated ? (
            seats.isPending ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : !seats.isError ? (
              <Typography className="text-foreground">{t("No players found")}</Typography>
            ) : null
          ) : null
        }
        ListFooterComponent={
          <View>
            {seats.isError && !terminated ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load players")}
                </Typography>
                <Button onPress={() => void seats.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </>
            ) : null}
            {!terminated && seats.hasNextPage ? (
              <Button
                isDisabled={seats.isFetchingNextPage}
                onPress={() => void seats.fetchNextPage()}
              >
                <Button.Label>{t("Load more")}</Button.Label>
              </Button>
            ) : null}
          </View>
        }
      />
      {confirm ? (
        <ConfirmDialog
          title={confirm.action === "cancel" ? t("Leave table") : t("Remove player")}
          description={t("This removes the active table registration.")}
          busy={a.busy}
          onCancel={() => setConfirm(null)}
          actions={[{ label: t("Confirm"), variant: "danger", onPress: () => void run() }]}
        >
          {error ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not update table registration")}
            </Typography>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </View>
  );
}
