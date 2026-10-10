import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, Crown } from "lucide-react-native";
import { View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

export function MatchListLegend() {
  const t = useT();
  const [accent, warning] = useThemeColor(["accent", "warning"]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12 }}>
      <Typography className="text-sm font-medium text-foreground">{t("Table list")}</Typography>
      <HelpPopover label={t("Table list")} title={t("Table list")}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Crown size={16} color={warning} accessible={false} />
            <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
              {t("The crown identifies the match administrator.")}
            </Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <CalendarDays size={16} color={accent} accessible={false} />
            <Typography className="text-sm text-foreground" style={{ flex: 1 }}>
              {t("The calendar identifies a table belonging to an event.")}
            </Typography>
          </View>
        </View>
      </HelpPopover>
    </View>
  );
}
