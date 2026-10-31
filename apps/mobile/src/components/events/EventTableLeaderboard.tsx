import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { communityAccessDenied, useTableLeaderboard } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Clock3 } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GameListRow } from "@/components/games/GameListRow";
import { LeaderboardStat } from "@/components/ratings/LeaderboardStat";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventPlayerCard } from "./EventPlayerCard";
export function EventTableLeaderboard({ table }: { table: PlannedTableResponse }) {
  const t = useT(),
    { i18n } = useLingui(),
    insets = useSafeAreaInsets(),
    warning = useThemeColor("warning");
  const q = useTableLeaderboard(
    useCommunityApi(),
    table.eventId,
    table.id,
    table.confirmed?.gameId,
  );
  const number = new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const rows = communityAccessDenied(q.error) ? [] : q.items,
    game = table.gamesDetail.find((value) => value.id === table.confirmed?.gameId);
  if (!table.confirmed)
    return (
      <Typography className="text-foreground" style={{ margin: 20 }}>
        {t("Excluded from confirmation")}
      </Typography>
    );
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.userId}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 32 }}
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage && !q.isFetchNextPageError)
          void q.fetchNextPage({ cancelRefetch: false });
      }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Typography className="font-semibold text-foreground">{t("Selected game")}</Typography>
          <GroupedList>
            <GameListRow
              name={game?.name ?? t("Unknown")}
              imageUrl={game?.imageUrl}
              year={game?.year}
              average={game?.average}
              rank={game?.rank}
            />
          </GroupedList>
          <Typography className="font-semibold text-foreground">{t("Ranking")}</Typography>
          <Typography className="text-sm text-muted">
            {table.groupId ? t("Group rating") : t("Global rating")}
          </Typography>
        </View>
      }
      ListEmptyComponent={
        q.isPending ? (
          <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
        ) : !q.isError ? (
          <Typography className="text-foreground">{t("No players found")}</Typography>
        ) : null
      }
      ListFooterComponent={
        <View style={{ gap: 12 }}>
          {q.isError ? (
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
          {q.isFetchingNextPage ? (
            <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <EventPlayerCard name={item.name} username={item.username} avatarUrl={item.avatarUrl}>
          <LeaderboardStat label={t("Games played")} value={String(item.gamesPlayed)} />
          <LeaderboardStat label={t("Games won")} value={String(item.gamesWon)} />
          <LeaderboardStat label={t("ND")} value={String(item.nd)} />
          <View style={{ flex: 1, gap: 4 }}>
            <Typography className="text-xs text-muted">{t("Ranking")}</Typography>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Typography className="text-foreground">{number.format(item.score)}</Typography>
              {item.provisional ? (
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t("Provisional rating")}
                >
                  <Clock3 size={16} color={warning} accessible={false} />
                </View>
              ) : null}
            </View>
          </View>
        </EventPlayerCard>
      )}
    />
  );
}
