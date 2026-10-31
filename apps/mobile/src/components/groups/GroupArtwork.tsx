import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useThemeColor } from "heroui-native/hooks";
import { Crown } from "lucide-react-native";
import { Image, View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
import { useT } from "@/lib/i18n";
export function GroupArtwork({
  group,
  size = 64,
}: {
  group: Pick<GroupRecordResponse, "name" | "logo" | "role">;
  size?: number;
}) {
  const t = useT(),
    warning = useThemeColor("warning");
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      {group.logo ? (
        <Image
          source={{ uri: group.logo }}
          resizeMode="contain"
          accessible={false}
          style={{ width: size, height: size, borderRadius: 12 }}
        />
      ) : (
        <AnimatedDicebearArtwork seed={group.name} variant="landscape" size={size} />
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
      {group.role === "invited" || group.role === "requested" ? (
        <PendingArtworkBadge
          kind={group.role === "invited" ? "invitation" : "request"}
          label={group.role === "invited" ? t("Invitation received") : t("Membership requested")}
        />
      ) : null}
    </View>
  );
}
