import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  type EventTablePerson,
  eventTablePeople,
  formatUsername,
  useTableLeaderboard,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useMemo, useRef } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventPlayerRatingPopover } from "./EventPlayerRatingPopover";

export function EventTableResults({ table }: { table: PlannedTableResponse }) {
  const t = useT(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets();
  const terminated = table.eventStatus === "TERMINATED";
  const q = useTableLeaderboard(
    {
      ...o,
      enabled: table.eventStatus === "CONFIRMED" && !table.sharedResultsOnly && o.enabled !== false,
    },
    table.eventId,
    table.id,
    table.confirmed?.gameId,
    table.confirmed?.playerIds,
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
  if (!table.confirmed && (!terminated || !table.results))
    return (
      <Typography className="text-foreground" style={{ margin: 20 }}>
        {t("Excluded from confirmation")}
      </Typography>
    );
  return (
    <FlatList
      key={owner}
      data={rows}
      keyExtractor={(row) => row.key}
      contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: insets.bottom + 32 }}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={() => {
        scrolled.current = owner;
      }}
      onEndReached={() => {
        if (scrolled.current === owner && !terminated) q.loadMore();
      }}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        !terminated && (q.isPending || q.isFetching) ? (
          <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
        ) : terminated || !q.isError ? (
          <Typography className="text-muted">{t("No players found")}</Typography>
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
        return (
          <GroupedList>
            <UserListRow
              name={name}
              avatarUrl={item.avatarUrl}
              badgeContent={
                terminated ? (
                  <View
                    accessible
                    accessibilityLabel={`${t("Position")}: ${item.rank === null || item.rank === undefined ? t("ND") : `#${item.rank}`}`}
                    className={item.rank === 1 ? "bg-success" : "bg-default"}
                    style={{
                      position: "absolute",
                      right: -4,
                      bottom: -4,
                      paddingHorizontal: 4,
                      borderRadius: 12,
                    }}
                  >
                    <Typography
                      className={
                        item.rank === 1
                          ? "text-xs text-success-foreground"
                          : "text-xs text-foreground"
                      }
                    >
                      {item.rank === null || item.rank === undefined ? t("ND") : `#${item.rank}`}
                    </Typography>
                  </View>
                ) : undefined
              }
              actions={
                terminated ? (
                  <Typography
                    numberOfLines={1}
                    accessibilityLabel={`${t("Score")}: ${item.score ?? t("ND")}`}
                    className="font-semibold text-foreground"
                    style={{ maxWidth: 132 }}
                  >
                    {item.score ?? t("ND")}
                  </Typography>
                ) : undefined
              }
            >
              <View style={{ alignSelf: "flex-start" }}>
                <EventPlayerRatingPopover
                  table={table}
                  userId={item.userId}
                  name={name}
                  current={
                    !terminated ? q.items.find((row) => row.userId === item.userId) : undefined
                  }
                />
              </View>
            </UserListRow>
          </GroupedList>
        );
      }}
    />
  );
}
