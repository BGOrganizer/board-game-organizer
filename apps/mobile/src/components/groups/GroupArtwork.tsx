import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useThemeColor } from "heroui-native/hooks";
import { Crown } from "lucide-react-native";
import { Image, View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { useT } from "@/lib/i18n";
export function GroupArtwork({
  group,
}: {
  group: Pick<GroupRecordResponse, "name" | "logo" | "role">;
}) {
  const t = useT(),
    warning = useThemeColor("warning");
  return (
    <View style={{ width: 64, height: 64, flexShrink: 0 }}>
      {group.logo ? (
        <Image
          source={{ uri: group.logo }}
          resizeMode="contain"
          accessible={false}
          style={{ width: 64, height: 64, borderRadius: 12 }}
        />
      ) : (
        <AnimatedDicebearArtwork seed={group.name} variant="landscape" />
      )}
      {group.role === "admin" ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={t("Group admin")}
          className="bg-surface"
          style={{ position: "absolute", left: 0, top: 0, padding: 4, borderBottomRightRadius: 8 }}
        >
          <Crown size={16} color={warning} />
        </View>
      ) : null}
    </View>
  );
}
