import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import { Keyboard, View } from "react-native";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
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
  const [accent, warning, success, danger, muted] = useThemeColor([
    "accent",
    "warning",
    "success",
    "danger",
    "muted",
  ]);
  const colors = { accent, warning, success, danger };
  return (
    <HelpSectionCard
      label={`${title}: ${t("Icon legend")}`}
      title={title}
      icon={Icon}
      onOpenChange={(open) => {
        if (open) Keyboard.dismiss();
      }}
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
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: success }} />
        <Typography className="text-xs text-foreground">{t("Online")}</Typography>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: muted,
            marginLeft: 8,
          }}
        />
        <Typography className="text-xs text-foreground">{t("Offline")}</Typography>
      </View>
    </HelpSectionCard>
  );
}
