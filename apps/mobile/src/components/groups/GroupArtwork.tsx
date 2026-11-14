import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useThemeColor } from "heroui-native/hooks";
import { Crown } from "lucide-react-native";
import { useState } from "react";
import { Image, View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
import { containedArtwork } from "@/lib/artworkLayout";
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
  const [frame, setFrame] = useState({ width: size, height: size });
  const [loaded, setLoaded] = useState({ uri: group.logo, ratio: 1 });
  const dimensions = containedArtwork(
    frame.width,
    frame.height,
    loaded.uri === group.logo ? loaded.ratio : 1,
    presentation === "cover" ? 4 : 0,
  );
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) =>
        setFrame((old) =>
          old.width === layout.width && old.height === layout.height
            ? old
            : { width: layout.width, height: layout.height },
        )
      }
      style={[
        presentation !== "thumbnail"
          ? { position: "absolute", inset: 0 }
          : { width: size, height: size, flexShrink: 0 },
        { alignItems: "center", justifyContent: "center" },
      ]}
    >
      {group.logo ? (
        <Image
          key={group.logo}
          source={{ uri: group.logo }}
          resizeMode="contain"
          accessible={false}
          onLoad={({ nativeEvent }) =>
            setLoaded({
              uri: group.logo,
              ratio: nativeEvent.source.width / nativeEvent.source.height,
            })
          }
          style={{ ...dimensions, borderRadius: 12, overflow: "hidden" }}
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
