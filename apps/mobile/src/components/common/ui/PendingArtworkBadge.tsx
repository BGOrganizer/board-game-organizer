import { useThemeColor } from "heroui-native/hooks";
import { Clock3, Mail } from "lucide-react-native";
import { View } from "react-native";

export function PendingArtworkBadge({
  kind,
  label,
}: {
  kind: "invitation" | "request";
  label: string;
}) {
  const warning = useThemeColor("warning");
  const Icon = kind === "invitation" ? Mail : Clock3;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="bg-surface"
      style={{ position: "absolute", right: 0, bottom: 0, padding: 4, borderTopLeftRadius: 8 }}
    >
      <Icon size={16} color={warning} accessible={false} />
    </View>
  );
}
