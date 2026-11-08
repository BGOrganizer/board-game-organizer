import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { ListCard } from "./ListCard";

/** Image-backed HeroUI identity with a full, accessible toolbar over the artwork. */
export function RecordIdentityCard({
  title,
  icon,
  background,
  titleAccessory,
  children,
}: {
  title: string;
  icon: ReactNode;
  background: ReactNode;
  titleAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListCard background={background}>
      <View
        className="bg-background/90"
        style={{
          flexDirection: "row",
          padding: 16,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          {icon}
          <Typography
            accessibilityRole="header"
            accessibilityLabel={title}
            numberOfLines={1}
            className="text-lg font-semibold text-foreground"
            style={{ flex: 1, minWidth: 0 }}
          >
            {title}
          </Typography>
          {titleAccessory}
        </View>
        <ScrollView
          testID="record-identity-controls"
          horizontal
          style={{
            height: 44,
            width: "60%",
            maxWidth: "60%",
            minWidth: 0,
            marginLeft: "auto",
            flexGrow: 0,
            flexShrink: 0,
          }}
          contentContainerStyle={{
            flexGrow: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {children}
        </ScrollView>
      </View>
    </ListCard>
  );
}
