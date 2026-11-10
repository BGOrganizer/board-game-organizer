import type { PlannedTableResponse, TableLeaderboardPlayer } from "@board-game-organizer/schemas";
import { tablePlayerRatingRows } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Clock3, Globe, Minus, TrendingDown, TrendingUp, UsersRound } from "lucide-react-native";
import { useWindowDimensions, View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

export function EventPlayerRatingPopover({
  table,
  userId,
  name,
  current,
}: {
  table: PlannedTableResponse;
  userId: string;
  name: string;
  current?: TableLeaderboardPlayer;
}) {
  const t = useT(),
    { i18n } = useLingui();
  const { width } = useWindowDimensions();
  const [warning, success, danger, muted] = useThemeColor([
    "warning-soft-foreground",
    "success-soft-foreground",
    "danger-soft-foreground",
    "muted",
  ]);
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const game = table.gamesDetail.find((row) => row.id === table.confirmed?.gameId);
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "nowrap",
        flexShrink: 0,
        alignItems: "center",
        gap: 4,
      }}
    >
      {tablePlayerRatingRows(table, userId, current).map((row) => {
        const global = row.scope === "GLOBAL";
        const Icon = global ? Globe : UsersRound;
        const label = global ? t("Global ranking") : t("Group ranking");
        const Delta =
          row.delta !== undefined && row.delta > 0
            ? TrendingUp
            : row.delta !== undefined && row.delta < 0
              ? TrendingDown
              : Minus;
        return (
          <HelpPopover
            key={row.scope}
            size="compact"
            label={`${label}: ${name}`}
            title={
              table.eventStatus === "TERMINATED"
                ? undefined
                : game
                  ? `${label} · ${game.name}`
                  : label
            }
            icon={Icon}
            tone={global ? "accent" : "success"}
            triggerClassName="bg-default"
            width={Math.min(400, width - 32)}
          >
            <View
              style={{ flexDirection: "row", flexWrap: "nowrap", alignItems: "stretch", gap: 12 }}
            >
              {row.state === "notUpdated" ? (
                <Typography className="text-muted">{t("Ranking not updated")}</Typography>
              ) : row.state === "unavailable" ? (
                <Typography className="text-muted">
                  {table.eventStatus === "TERMINATED"
                    ? t("Historical ranking unavailable")
                    : t("Ranking unavailable")}
                </Typography>
              ) : (
                <>
                  {row.state === "recorded" ? (
                    <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
                      <Typography className="text-xs text-muted">{t("Rating before")}</Typography>
                      <Typography className="text-foreground">
                        {number.format(row.before as number)}
                      </Typography>
                    </View>
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
                    <Typography className="text-xs text-muted">
                      {row.state === "recorded" ? t("Rating after") : t("Ranking")}
                    </Typography>
                    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                      <Typography className="text-foreground">
                        {number.format(row.after as number)}
                      </Typography>
                      {row.provisional ? (
                        <Clock3
                          size={16}
                          color={warning}
                          accessibilityRole="image"
                          accessibilityLabel={t("Provisional rating")}
                        />
                      ) : null}
                    </View>
                  </View>
                  {row.delta !== undefined ? (
                    <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
                      <Typography className="text-xs text-muted">{t("Rating change")}</Typography>
                      <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                        <Delta
                          size={16}
                          color={row.delta > 0 ? success : row.delta < 0 ? danger : muted}
                          accessible={false}
                        />
                        <Typography
                          className={
                            row.delta > 0
                              ? "text-success-soft-foreground"
                              : row.delta < 0
                                ? "text-danger-soft-foreground"
                                : "text-muted"
                          }
                        >
                          {row.delta > 0 ? "+" : ""}
                          {number.format(row.delta)}
                        </Typography>
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </HelpPopover>
        );
      })}
    </View>
  );
}
