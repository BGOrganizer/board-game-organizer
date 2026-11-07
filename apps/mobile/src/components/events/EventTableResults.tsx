import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventTablePeople } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Minus, Plus } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LeaderboardStat } from "@/components/ratings/LeaderboardStat";
import { useT } from "@/lib/i18n";
import { EventPlayerCard } from "./EventPlayerCard";

function RatingDelta({
  label,
  value,
  format,
}: {
  label: string;
  value: number | undefined;
  format: (value: number) => string;
}) {
  const [success, danger, muted] = useThemeColor(["success", "danger", "muted"]),
    Icon = value !== undefined && value < 0 ? Minus : Plus;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Typography className="text-xs text-muted">{label}</Typography>
      <View
        accessible
        accessibilityLabel={
          value === undefined ? `${label}: —` : `${label}: ${value > 0 ? "+" : ""}${format(value)}`
        }
        style={{ flexDirection: "row", gap: 4, alignItems: "center" }}
      >
        {value === undefined ? null : (
          <Icon
            size={16}
            color={value > 0 ? success : value < 0 ? danger : muted}
            accessible={false}
          />
        )}
        <Typography className="text-foreground">
          {value === undefined ? "—" : format(Math.abs(value))}
        </Typography>
      </View>
    </View>
  );
}
export function EventTableResults({ table }: { table: PlannedTableResponse }) {
  const t = useT(),
    { i18n } = useLingui(),
    insets = useSafeAreaInsets(),
    number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  return (
    <FlatList
      data={eventTablePeople(table, [])}
      keyExtractor={(row) => row.key}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 32 }}
      ListEmptyComponent={
        <Typography className="text-foreground">{t("Excluded from confirmation")}</Typography>
      }
      renderItem={({ item }) => {
        const group =
          table.rankingEnabled && table.groupId
            ? table.groupRatingChanges?.find((value) => value.userId === item.userId)
            : undefined;
        const global = table.rankingEnabled
          ? table.ratingChanges?.find((value) => value.userId === item.userId)
          : undefined;
        return (
          <EventPlayerCard
            name={item.profileLoaded ? item.name : undefined}
            username={item.username}
            avatarUrl={item.avatarUrl}
            footer={
              <View style={{ flexDirection: "row", gap: 8 }}>
                <LeaderboardStat label={t("Score")} value={item.score ?? t("ND")} />
                <RatingDelta
                  label={t("Global rating change")}
                  value={global?.delta}
                  format={number.format}
                />
                <RatingDelta
                  label={t("Group rating change")}
                  value={group?.delta}
                  format={number.format}
                />
              </View>
            }
          >
            <LeaderboardStat
              label={t("Position")}
              value={item.rank === null || item.rank === undefined ? t("ND") : String(item.rank)}
            />
            <LeaderboardStat
              label={t("Rating before")}
              value={group ? number.format(group.score - group.delta) : "—"}
            />
            <LeaderboardStat
              label={t("Global ranking")}
              value={global ? number.format(global.score) : "—"}
            />
            <LeaderboardStat
              label={t("Group ranking")}
              value={group ? number.format(group.score) : "—"}
            />
          </EventPlayerCard>
        );
      }}
    />
  );
}
