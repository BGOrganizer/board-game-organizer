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
  status = "overlay",
  presentation = "thumbnail",
}: {
  group: Pick<GroupRecordResponse, "id" | "logo" | "role">;
  size?: number;
  status?: "overlay" | "none";
  presentation?: "thumbnail" | "background" | "cover";
}) {
  const t = useT(),
    warning = useThemeColor("warning");
  return (
    <View
      style={
        presentation !== "thumbnail"
          ? { position: "absolute", inset: 0 }
          : { width: size, height: size, flexShrink: 0 }
      }
    >
      {group.logo ? (
        <Image
          source={{ uri: group.logo }}
          resizeMode="contain"
          accessible={false}
          style={{
            width: presentation !== "thumbnail" ? "100%" : size,
            height: presentation !== "thumbnail" ? "100%" : size,
            borderRadius: presentation === "cover" ? 0 : 12,
          }}
        />
      ) : (
        <AnimatedDicebearArtwork
          seed={group.id}
          variant="landscape"
          size={size}
          presentation={presentation}
        />
      )}
      {status === "overlay" && group.role === "admin" ? (
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
      {status === "overlay" && (group.role === "invited" || group.role === "requested") ? (
        <PendingArtworkBadge
          kind={group.role === "invited" ? "invitation" : "request"}
          label={group.role === "invited" ? t("Invitation received") : t("Membership requested")}
        />
      ) : null}
    </View>
  );
}
