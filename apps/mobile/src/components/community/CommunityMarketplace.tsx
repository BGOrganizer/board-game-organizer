import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Store } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
export function CommunityMarketplace() {
  const t = useT(),
    muted = useThemeColor("muted");
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20, gap: 12 }}>
      <Store size={56} color={muted} accessible={false} />
      <Typography accessibilityRole="header" className="text-lg font-semibold text-foreground">
        {t("Marketplace")}
      </Typography>
      <Typography className="font-medium text-foreground">{t("Coming soon")}</Typography>
      <Typography className="text-sm text-muted" style={{ textAlign: "center" }}>
        {t("A place to buy, sell and trade board games with the BGO community.")}
      </Typography>
    </View>
  );
}
