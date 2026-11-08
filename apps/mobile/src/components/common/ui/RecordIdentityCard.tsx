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
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 192,
            minWidth: 0,
          }}
        >
          {icon}
          <Typography
            accessibilityRole="header"
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
            maxWidth: "100%",
            minWidth: 176,
            marginLeft: "auto",
            flexGrow: 1,
            flexShrink: 1,
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
