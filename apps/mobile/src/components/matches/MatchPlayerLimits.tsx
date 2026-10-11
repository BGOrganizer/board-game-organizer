import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function MatchPlayerLimits({
  minPlayers,
  maxPlayers,
}: {
  minPlayers: number;
  maxPlayers: number;
}) {
  const t = useT();
  return (
    <View style={{ flexDirection: "row", gap: 28, marginBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Typography className="text-sm text-muted">{t("Minimum players")}</Typography>
        <Typography className="font-semibold text-foreground">{minPlayers}</Typography>
      </View>
      <View style={{ flex: 1 }}>
        <Typography className="text-sm text-muted">{t("Maximum players")}</Typography>
        <Typography className="font-semibold text-foreground">{maxPlayers}</Typography>
      </View>
    </View>
  );
}
