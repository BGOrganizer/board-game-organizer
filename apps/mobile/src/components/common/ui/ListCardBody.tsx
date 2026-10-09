import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { View } from "react-native";

export function ListCardBody({
  title,
  titleAccessory,
  children,
}: {
  title: string;
  titleAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Typography className="font-semibold text-foreground" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Typography>
        {titleAccessory}
      </View>
      {children}
    </View>
  );
}
