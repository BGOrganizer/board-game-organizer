import { Avatar } from "heroui-native/avatar";
import { useThemeColor } from "heroui-native/hooks";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

export type UserBadge = {
  icon: LucideIcon;
  label: string;
  color: "accent" | "success" | "warning" | "danger";
};

export function UserAvatar({
  name,
  avatarUrl,
  online,
  badge,
}: {
  name: string;
  avatarUrl?: string | null;
  online?: boolean;
  badge?: UserBadge;
}) {
  const [badgeColor, success, muted, surface] = useThemeColor([
    badge?.color ?? "foreground",
    "success",
    "muted",
    "surface",
  ]);
  const BadgeIcon = badge?.icon;
  return (
    <View style={{ position: "relative" }}>
      <Avatar size="md" alt={name}>
        {avatarUrl ? <Avatar.Image source={{ uri: avatarUrl }} /> : null}
        <Avatar.Fallback>{name.charAt(0) || "?"}</Avatar.Fallback>
      </Avatar>
      {online !== undefined ? (
        <View
          style={{
            position: "absolute",
            top: -1,
            right: -1,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: online ? success : muted,
            borderWidth: 2,
            borderColor: surface,
          }}
        />
      ) : null}
      {badge && BadgeIcon ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={badge.label}
          className="rounded-full border border-muted/20 bg-surface"
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            width: 22,
            height: 22,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BadgeIcon size={13} color={badgeColor} />
        </View>
      ) : null}
    </View>
  );
}
