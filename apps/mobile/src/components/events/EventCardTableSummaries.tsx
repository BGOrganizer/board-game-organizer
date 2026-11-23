import type { TableCardSummary } from "@board-game-organizer/schemas";
import { CARD_EXCLUSION_MESSAGES, CARD_PLANNING_MESSAGES } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Trophy } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useTableTitle } from "@/lib/events/useTableTitle";
import { useT } from "@/lib/i18n";

export function EventCardTableSummaries({
  tables,
  mode,
  showNames = true,
}: {
  tables: readonly TableCardSummary[];
  mode: "planning" | "exclusions" | "results" | "confirmed";
  showNames?: boolean;
}) {
  const t = useT();
  const titleForTable = useTableTitle();
  const warning = useThemeColor("warning-soft-foreground");
  return (
    <FlatList
      data={tables}
      keyExtractor={(table) => table.tableId}
      style={{ width: "100%", flexGrow: 0, flexShrink: 1 }}
      contentContainerStyle={{ gap: 12 }}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={7}
      renderItem={({ item: table }) => (
        <View style={{ gap: 4 }}>
          {showNames && mode !== "results" ? (
            <Typography className="font-semibold text-foreground">
              {titleForTable(table)}
            </Typography>
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
          ) : mode === "results" ? (
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 }}
            >
              {showNames ? (
                <Typography className="font-semibold text-foreground" style={{ flexShrink: 1 }}>
                  {titleForTable(table)}
                </Typography>
              ) : null}
              <View
                style={{
                  flexShrink: 1,
                  minWidth: 0,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 4,
                }}
              >
                {table.winners.length ? (
                  <Trophy
                    size={16}
                    color={warning}
                    accessible={false}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                ) : null}
                <Typography className="text-foreground" style={{ flexShrink: 1, minWidth: 0 }}>
                  {table.winners.length
                    ? table.winners
                        .map(
                          (winner) =>
                            winner.guestName ??
                            (winner.username
                              ? `@${winner.username.replace(/^@/, "")}`
                              : t("Username unavailable")),
                        )
                        .join(", ")
                    : t("No winners.")}
                </Typography>
              </View>
            </View>
          ) : null}
        </View>
      )}
      ListEmptyComponent={
        <Typography className="text-foreground">
          {mode === "results"
            ? t("No winners.")
            : mode === "confirmed"
              ? t("No tables found")
              : t("No tables are ready for confirmation.")}
        </Typography>
      }
    />
  );
}
