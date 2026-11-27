import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  type EventTablePerson,
  eventTablePeople,
  formatUsername,
  useTableLeaderboard,
} from "@board-game-organizer/shared";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Dices, Trophy } from "lucide-react-native";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { GameCatalogMetadata } from "@/components/games/GameCatalogMetadata";
import { useT } from "@/lib/i18n";
import { useListActivity } from "@/lib/listActivity";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventFinishedPlayerResult } from "./EventFinishedPlayerResult";
import { EventPlayerRatingPopover } from "./EventPlayerRatingPopover";

export function EventTableResults({
  table,
  header,
}: {
  table: PlannedTableResponse;
  header?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  const isActive = useListActivity();
  const t = useT(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets();
  const terminated = table.eventStatus === "TERMINATED";
  const game = terminated
    ? table.gamesDetail.find((row) => row.id === table.confirmed?.gameId)
    : undefined;
  const q = useTableLeaderboard(
    {
      ...o,
      enabled: table.eventStatus === "CONFIRMED" && !table.sharedResultsOnly && o.enabled !== false,
    },
    table.eventId,
    table.id,
    table.confirmed?.gameId,
    table.confirmed?.playerIds.filter(
      (id) => !table.confirmed?.guestPlayers?.some((guest) => guest.participantId === id),
    ),
  );
  const history = useMemo(
    () => (terminated ? eventTablePeople(table, []) : []),
    [table, terminated],
  );
  const rows: EventTablePerson[] =
    communityAccessDenied(q.error) && !terminated
      ? []
      : terminated
        ? history
        : q.items
            .filter((row) => table.confirmed?.playerIds.includes(row.userId))
            .map((row) => ({
              ...row,
              key: row.userId,
              email: null,
              profileLoaded: true,
              rank: undefined,
              score: undefined,
            }));
  const scrolled = useRef<string | null>(null);
  const owner = JSON.stringify([
    o.apiUrl,
    o.userId,
    table.id,
    table.eventStatus,
    table.confirmed?.gameId,
    table.confirmed?.playerIds,
  ]);
  useEffect(
    () => () => {
      scrolled.current = null;
    },
    [],
  );
  if (!table.confirmed && (!terminated || !table.results))
    return (
      <ScreenScrollView>
        {header === undefined || header === null || header === false ? null : <View>{header}</View>}
        <Typography className="text-foreground">{t("Excluded from confirmation")}</Typography>
      </ScreenScrollView>
    );
  return (
    <FlatList
      ListHeaderComponent={
        header || game ? (
          <View style={{ gap: 16 }}>
            {header}
            {game ? (
              <SectionHeaderCard
                title={game.name}
                leading={
                  <View style={{ position: "relative", overflow: "visible" }}>
                    <Avatar size="md" alt={game.name} accessible={false} className="rounded-lg">
                      {game.imageUrl ? <Avatar.Image source={{ uri: game.imageUrl }} /> : null}
                      <Avatar.Fallback>
                        <Dices size={18} color={muted} accessible={false} />
                      </Avatar.Fallback>
                    </Avatar>
                    <View
                      pointerEvents="box-none"
                      style={{ position: "absolute", right: -10, bottom: -10, zIndex: 2 }}
                    >
                      <GameCatalogMetadata game={game} name={game.name} visible />
                    </View>
                  </View>
                }
              />
            ) : null}
          </View>
        ) : null
      }
      key={owner}
      data={rows}
      keyExtractor={(row) => row.key}
      contentContainerStyle={{
        padding: 20,
        paddingTop: header ? 12 : 20,
        gap: 8,
        paddingBottom: insets.bottom + 32,
      }}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={() => {
        if (isActive()) scrolled.current = owner;
      }}
      onEndReached={() => {
        if (isActive() && scrolled.current === owner && !terminated) q.loadMore();
      }}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        !terminated && (q.isPending || q.isFetching) ? (
          <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
        ) : terminated || !q.isError ? (
          <EmptyList icon={<Trophy size={28} color={muted} />}>{t("No players found")}</EmptyList>
        ) : null
      }
      ListFooterComponent={
        <View style={{ gap: 12 }}>
          {!terminated && q.isError ? (
            <>
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load leaderboards. Retry")}
              </Typography>
              <Button
                onPress={() =>
                  void (q.isFetchNextPageError
                    ? q.fetchNextPage({ cancelRefetch: false })
                    : q.retry())
                }
              >
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </>
          ) : null}
          {!terminated && q.isFetchingNextPage ? (
            <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const name = formatUsername(
          item.username,
          item.profileLoaded && item.name ? item.name : t("Username unavailable"),
        );
        if (terminated)
          return <EventFinishedPlayerResult table={table} player={item} name={name} />;
        return (
          <GroupedList>
            <UserListRow name={name} avatarUrl={item.avatarUrl}>
              <View style={{ alignSelf: "flex-start" }}>
                <EventPlayerRatingPopover
                  table={table}
                  userId={item.userId}
                  name={name}
                  current={q.items.find((row) => row.userId === item.userId)}
                />
              </View>
            </UserListRow>
          </GroupedList>
        );
      }}
    />
  );
}
