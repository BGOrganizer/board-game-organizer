import type { TableCardSummary } from "@board-game-organizer/schemas";
import { CARD_EXCLUSION_MESSAGES, CARD_PLANNING_MESSAGES } from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
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
          {showNames ? (
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
          ) : table.winners.length ? (
            table.winners.map((winner) => (
              <Typography key={winner.userId} className="text-foreground">
                {winner.username
                  ? `@${winner.username.replace(/^@/, "")}`
                  : t("Username unavailable")}
              </Typography>
            ))
          ) : (
            <Typography className="text-foreground">{t("No winners.")}</Typography>
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
