import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

export function IconLegend({
  items,
}: {
  items: readonly { icon: LucideIcon; description: string }[];
}) {
  const muted = useThemeColor("muted");
  return (
    <View style={{ gap: 8 }}>
      {items.map(({ icon: Icon, description }) => (
        <View key={description} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Icon size={18} color={muted} accessible={false} />
          <View style={{ flex: 1 }}>
            <Popover.Description>{description}</Popover.Description>
          </View>
        </View>
      ))}
    </View>
  );
}
