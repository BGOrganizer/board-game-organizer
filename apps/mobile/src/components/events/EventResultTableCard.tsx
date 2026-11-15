import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CircleCheck, Dices, UserRoundCheck } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
export function EventResultTableCard({
  table,
  ready,
  busy,
  onPress,
}: {
  table: PlannedTableResponse;
  ready: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const t = useT(),
    { i18n } = useLingui(),
    [muted, success] = useThemeColor(["muted", "success"]);
  return (
    <ListCard>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("Edit scores")}: ${table.name}`}
        accessibilityHint={ready ? t("Scores ready") : undefined}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}
      >
        <View style={{ width: 64, height: 64, flexShrink: 0 }}>
          <AnimatedDicebearArtwork seed={table.id} variant="planets" />
          {ready ? (
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={t("Scores ready")}
              className="bg-surface"
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                padding: 4,
                borderTopLeftRadius: 8,
              }}
            >
              <CircleCheck size={16} color={success} accessible={false} />
            </View>
          ) : null}
        </View>
        <ListCardBody
          title={table.name}
          titleIcon={<Dices size={16} color={muted} accessible={false} />}
        >
          <Typography className="text-sm text-foreground">
            {table.gamesDetail.find((game) => game.id === table.confirmed?.gameId)?.name ??
              t("Unknown")}
          </Typography>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <UserRoundCheck size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-foreground">
              {new Intl.NumberFormat(i18n.locale).format(table.confirmed?.playerIds.length ?? 0)}
            </Typography>
          </View>
        </ListCardBody>
      </Pressable>
    </ListCard>
  );
}
