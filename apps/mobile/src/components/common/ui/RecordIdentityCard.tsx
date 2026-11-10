import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { ScopedTheme } from "uniwind";
import { ListCard } from "./ListCard";

type HeadingProps = { title: string; icon: LucideIcon; titleAccessory?: ReactNode };
function IdentityHeading({ title, icon: Icon, titleAccessory }: HeadingProps) {
  const foreground = useThemeColor("foreground");
  return (
    <View
      className="bg-background/80"
      style={{
        width: "100%",
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <Icon size={20} color={foreground} accessible={false} style={{ marginTop: 4 }} />
      <Typography
        accessibilityRole="header"
        className="text-lg font-semibold text-foreground"
        style={{ flexShrink: 1, minWidth: 0 }}
      >
        {title}
      </Typography>
      {titleAccessory}
    </View>
  );
}

/** A top-left title band and bottom-right controls, both in the card's natural flow. */
export function RecordIdentityCard({
  background,
  children,
  ...heading
}: HeadingProps & { background: ReactNode; children: ReactNode }) {
  return (
    <ListCard background={background}>
      <View style={{ paddingVertical: 16, gap: 12, flexGrow: 1 }}>
        <ScopedTheme theme="dark">
          <IdentityHeading {...heading} />
        </ScopedTheme>
        <ScrollView
          testID="record-identity-controls"
          horizontal
          bounces={false}
          alwaysBounceHorizontal={false}
          style={{ marginTop: "auto", width: "100%", height: 52, flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingVertical: 4,
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
