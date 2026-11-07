import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { HEADER_ICON_SIZE } from "./headerStyles";

export function HeaderTitle({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const foreground = useThemeColor("foreground");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
      <Icon size={HEADER_ICON_SIZE} color={foreground} aria-hidden />
      <Typography
        type="h4"
        accessibilityRole="header"
        className="font-semibold text-foreground"
        numberOfLines={1}
      >
        {title}
      </Typography>
    </View>
  );
}
