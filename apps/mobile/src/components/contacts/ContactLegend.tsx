import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import { Keyboard, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

type BadgeColor = "accent" | "warning" | "success" | "danger";

export function ContactLegend({
  title,
  icon: Icon,
  entries,
}: {
  title: string;
  icon: LucideIcon;
  entries: { icon: LucideIcon; label: string; color: BadgeColor; description: string }[];
}) {
  const t = useT();
  const [foreground, accent, warning, success, danger] = useThemeColor([
    "foreground",
    "accent",
    "warning",
    "success",
    "danger",
  ]);
  const colors = { accent, warning, success, danger };
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon size={16} color={foreground} />
      <Typography className="font-medium text-foreground">{title}</Typography>
      <HelpPopover
        label={`${title}: ${t("Icon legend")}`}
        title={t("Icon legend")}
        width={280}
        onOpenChange={(open) => {
          if (open) Keyboard.dismiss();
        }}
      >
        <ScrollView
          style={{
            maxHeight: Math.max(80, Math.min(320, height - insets.top - insets.bottom - 100)),
          }}
          contentContainerStyle={{ gap: 12, paddingTop: 8 }}
        >
          {entries.map(({ icon: BadgeIcon, label, color, description }) => (
            <View key={label} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <BadgeIcon size={16} color={colors[color]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Typography className="text-sm font-medium text-foreground">{label}</Typography>
                <Typography className="text-xs text-muted">{description}</Typography>
              </View>
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
            <Typography className="text-xs text-foreground">{t("Online")}</Typography>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#d1d5db",
                marginLeft: 8,
              }}
            />
            <Typography className="text-xs text-foreground">{t("Offline")}</Typography>
          </View>
        </ScrollView>
      </HelpPopover>
    </View>
  );
}
