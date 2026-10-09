import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { GroupedRow } from "./GroupedRow";
import { UserAvatar, type UserBadge } from "./UserAvatar";

export function UserListRow({
  name,
  avatarUrl,
  secondary,
  online,
  badge,
  children,
  actions,
  onPress,
  accessibilityLabel,
  isDisabled,
}: {
  name: string;
  avatarUrl?: string | null;
  secondary?: string | null;
  online?: boolean;
  badge?: UserBadge;
  children?: ReactNode;
  actions?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  isDisabled?: boolean;
}) {
  const Identity = onPress ? Pressable : View;
  return (
    <GroupedRow>
      <Identity
        onPress={onPress}
        disabled={isDisabled}
        accessibilityState={onPress ? { disabled: isDisabled } : undefined}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={onPress ? (accessibilityLabel ?? name) : undefined}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
      >
        <UserAvatar name={name} avatarUrl={avatarUrl} online={online} badge={badge} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Typography className="font-medium text-foreground" numberOfLines={1}>
            {name}
          </Typography>
          {secondary ? (
            <Typography className="text-sm text-muted" numberOfLines={1}>
              {secondary}
            </Typography>
          ) : null}
          {children}
        </View>
      </Identity>
      {actions ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 4,
            maxWidth: 148,
          }}
        >
          {actions}
        </View>
      ) : null}
    </GroupedRow>
  );
}
