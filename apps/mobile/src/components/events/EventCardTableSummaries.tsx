import type { TableCardSummary } from "@board-game-organizer/schemas";
import { CARD_EXCLUSION_MESSAGES, CARD_PLANNING_MESSAGES } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Trophy } from "lucide-react-native";
import { FlatList, useWindowDimensions, View } from "react-native";
import { useT } from "@/lib/i18n";

export function EventCardTableSummaries({
  tables,
  mode,
  showNames = true,
}: {
  tables: readonly TableCardSummary[];
  mode: "planning" | "exclusions" | "results";
  showNames?: boolean;
}) {
  const t = useT();
  const warning = useThemeColor("warning-soft-foreground");
  const { height } = useWindowDimensions();
  return (
    <FlatList
      data={tables}
      keyExtractor={(table) => table.tableId}
      style={{ maxHeight: Math.min(320, height * 0.5) }}
      contentContainerStyle={{ gap: 12 }}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={7}
      renderItem={({ item: table }) => (
        <View style={{ gap: 4 }}>
          {showNames && mode !== "results" ? (
            <Typography className="font-semibold text-foreground">{table.name}</Typography>
          ) : null}
          {mode === "planning" ? (
            table.ready ? (
              <Typography className="text-foreground">
                {t("This table is ready for confirmation.")}
              </Typography>
            ) : (
              table.blockers.map((code) => (
                <Typography key={code} className="text-foreground">
                  {t(CARD_PLANNING_MESSAGES[code])}
                </Typography>
              ))
            )
          ) : mode === "exclusions" ? (
            table.exclusionReasons.map((code) => (
              <Typography key={code} className="text-foreground">
                {t(CARD_EXCLUSION_MESSAGES[code])}
              </Typography>
            ))
          ) : (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              {showNames ? (
                <Typography className="font-semibold text-foreground" style={{ flexShrink: 1 }}>
                  {table.name}
                </Typography>
              ) : null}
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
                {table.winners.length ? (
                  <Trophy size={16} color={warning} accessible={false} />
                ) : null}
                <Typography className="text-foreground" style={{ flex: 1 }}>
                  {table.winners.length
                    ? table.winners
                        .map((winner) =>
                          winner.username
                            ? `@${winner.username.replace(/^@/, "")}`
                            : t("Username unavailable"),
                        )
                        .join(", ")
                    : t("No winners.")}
                </Typography>
              </View>
            </View>
          )}
        </View>
      )}
      ListEmptyComponent={
        <Typography className="text-foreground">
          {mode === "results" ? t("No winners.") : t("No tables are ready for confirmation.")}
        </Typography>
      }
    />
  );
}
