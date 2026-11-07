import type { EventTableDraft } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Dices, Presentation, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { EventTableRatingBadge } from "./EventTableRatingBadge";

export function EventDraftTableCard({
  row,
  publicGroup = false,
}: {
  row: EventTableDraft;
  publicGroup?: boolean;
}) {
  const t = useT();
  const muted = useThemeColor("muted");
  const { i18n } = useLingui();
  const firstGame = row.games[0]?.name ?? t("Unknown");
  const remaining = Math.max(0, row.games.length - 1);
  return (
    <ListCard>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 16 }}>
        <AnimatedDicebearArtwork seed={row.id ?? row.key} variant="planets" />
        <ListCardBody
          title={row.name}
          titleAccessory={<EventTableRatingBadge enabled={row.rankingEnabled} />}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Dices size={16} color={muted} accessible={false} />
            <Typography className="text-foreground" numberOfLines={1} style={{ flexShrink: 1 }}>
              {firstGame}
            </Typography>
            {remaining > 0 ? (
              <Typography
                className="text-foreground"
                style={{ flexShrink: 0 }}
                accessibilityLabel={i18n._({
                  id: "event.table.moreGames",
                  message: "{remaining, plural, one {+# game} other {+# games}}",
                  values: { remaining },
                })}
              >
                +{remaining}
              </Typography>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <UsersRound size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-muted" style={{ flex: 1 }}>
              {t("Minimum players")}: {row.minPlayers} · {t("Maximum players")}: {row.maxPlayers}
            </Typography>
          </View>
          {publicGroup || row.demonstratorUserId ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Presentation size={16} color={muted} accessible={false} />
              <Typography className="text-sm text-muted" style={{ flex: 1 }}>
                {row.demonstratorUserId
                  ? (row.demonstratorName ?? t("Unknown"))
                  : t("No demonstrator")}
              </Typography>
            </View>
          ) : null}
        </ListCardBody>
      </View>
    </ListCard>
  );
}
