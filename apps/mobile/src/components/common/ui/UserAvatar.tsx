import { Avatar } from "heroui-native/avatar";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { IconBadge } from "./IconBadge";

export type UserBadge = {
  icon: LucideIcon;
  label: string;
  description?: string;
  color: "accent" | "success" | "warning" | "danger";
};

export function UserAvatar({
  name,
  avatarUrl,
  online,
  badge,
  badgeContent,
  topBadgeContent,
}: {
  name: string;
  avatarUrl?: string | null;
  online?: boolean;
  badge?: UserBadge;
  badgeContent?: ReactNode;
  topBadgeContent?: ReactNode;
}) {
  const t = useT();
  const [success, muted, surface] = useThemeColor(["success", "muted", "surface"]);
  const bottom =
    badgeContent ??
    (badge ? (
      <IconBadge icon={badge.icon} label={badge.label} title={badge.label} color={badge.color}>
        <Typography className="text-foreground">{badge.description ?? badge.label}</Typography>
      </IconBadge>
    ) : undefined);
  const dual = Boolean(bottom && topBadgeContent);
  return (
    <View
      style={{
        position: "relative",
        marginRight: bottom || topBadgeContent ? 12 : 0,
        marginTop: dual ? 8 : topBadgeContent ? 12 : 0,
        marginBottom: dual ? 8 : bottom ? 12 : 0,
      }}
    >
      <Avatar size="md" alt={name}>
        {avatarUrl ? <Avatar.Image source={{ uri: avatarUrl }} /> : null}
        <Avatar.Fallback>{name.replace(/^@/, "").charAt(0) || "?"}</Avatar.Fallback>
      </Avatar>
      {online !== undefined ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={online ? t("Online") : t("Offline")}
          style={{
            position: "absolute",
            top: -1,
            ...(topBadgeContent ? { left: -1 } : { right: -1 }),
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: online ? success : muted,
            borderWidth: 2,
            borderColor: surface,
          }}
        />
      ) : null}
      {bottom ? (
        <View style={{ position: "absolute", right: -20, bottom: -20 }}>{bottom}</View>
      ) : null}
      {topBadgeContent ? (
        <View style={{ position: "absolute", right: -20, top: -20 }}>{topBadgeContent}</View>
      ) : null}
    </View>
  );
}
