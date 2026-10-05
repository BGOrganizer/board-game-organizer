import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Typography } from "heroui-native/text";
import { CircleHelp, type LucideIcon } from "lucide-react-native";
import { Keyboard, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const [foreground, muted, accent, warning, success, danger] = useThemeColor([
    "foreground",
    "muted",
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
      <Popover
        onOpenChange={(open) => {
          if (open) Keyboard.dismiss();
        }}
      >
        <Popover.Trigger asChild>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            accessibilityLabel={`${title}: ${t("Icon legend")}`}
            style={{ width: 44, height: 44 }}
          >
            <CircleHelp size={18} color={muted} />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Overlay />
          <Popover.Content presentation="popover" placement="bottom" width={280}>
            <Popover.Title>{t("Icon legend")}</Popover.Title>
            <ScrollView
              style={{
                maxHeight: Math.max(80, Math.min(320, height - insets.top - insets.bottom - 100)),
              }}
              contentContainerStyle={{ gap: 12, paddingTop: 8 }}
            >
              {entries.map(({ icon: BadgeIcon, label, color, description }) => (
                <View
                  key={label}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
                >
                  <BadgeIcon size={16} color={colors[color]} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Typography className="text-sm font-medium text-foreground">{label}</Typography>
                    <Typography className="text-xs text-muted">{description}</Typography>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }}
                />
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
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </View>
  );
}
