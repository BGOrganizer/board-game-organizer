import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import { NotificationUnreadDot } from "./NotificationUnreadDot";

export function ListCardBody({
  title,
  titleIcon,
  titleAccessory,
  unread = false,
  children,
}: {
  title: string;
  titleIcon?: ReactNode;
  titleAccessory?: ReactNode;
  unread?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {titleIcon}
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Typography
            className="font-semibold text-foreground"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {title}
          </Typography>
          <NotificationUnreadDot active={unread} />
        </View>
        {titleAccessory}
      </View>
      {children}
    </View>
  );
}
