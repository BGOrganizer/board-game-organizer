import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Dices, Settings2, UserRoundCheck, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useT } from "@/lib/i18n";
import { EventTableRatingBadge } from "./EventTableRatingBadge";

export function EventTableInfo({ table }: { table: PlannedTableResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const number = new Intl.NumberFormat(i18n.locale);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Settings2 size={20} color={muted} accessible={false} />
        <SearchHelpLabel
          label={t("Settings")}
          helpTitle={t("Field help")}
          help={t(
            "The minimum is required for agreement. The maximum limits reserved places; additional players remain in the waiting queue.",
          )}
        />
      </View>
      <ListCard>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 16 }}>
          <AnimatedDicebearArtwork seed={table.id} variant="planets" />
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Dices size={16} color={muted} accessible={false} style={{ marginTop: 2 }} />
              <Typography
                accessibilityRole="header"
                className="text-base font-semibold text-foreground"
                style={{ flex: 1 }}
              >
                {table.name}
              </Typography>
              <EventTableRatingBadge enabled={table.rankingEnabled} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <UserRoundCheck size={16} color={muted} accessible={false} />
                <Typography className="text-sm text-foreground">
                  {t("Minimum players")}: {number.format(table.minPlayers)}
                </Typography>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <UsersRound size={16} color={muted} accessible={false} />
                <Typography className="text-sm text-foreground">
                  {t("Maximum players")}: {number.format(table.maxPlayers)}
                </Typography>
              </View>
            </View>
          </View>
        </View>
      </ListCard>
      {table.eventStatus !== "PLANNING" && !table.confirmed ? (
        <Typography className="text-sm text-warning">{t("Excluded from confirmation")}</Typography>
      ) : null}
    </View>
  );
}
