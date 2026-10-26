import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { CircleOff, Trophy } from "lucide-react-native";
import { useT } from "@/lib/i18n";
export function EventTableRatingBadge({ enabled }: { enabled: boolean }) {
  const t = useT(),
    [accentForeground, foreground] = useThemeColor(["accent-foreground", "foreground"]);
  const Icon = enabled ? Trophy : CircleOff;
  return (
    <Chip
      size="sm"
      variant={enabled ? "primary" : "secondary"}
      color={enabled ? "accent" : "default"}
      accessible
      accessibilityLabel={enabled ? t("Rating enabled") : t("Rating disabled")}
    >
      <Icon size={14} color={enabled ? accentForeground : foreground} accessible={false} />
      <Chip.Label>{t("Rating")}</Chip.Label>
    </Chip>
  );
}
