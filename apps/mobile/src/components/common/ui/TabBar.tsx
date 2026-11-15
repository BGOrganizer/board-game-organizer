import { Tabs } from "heroui-native/tabs";
import { type ReactNode, useState } from "react";
import { View, type ViewStyle } from "react-native";

/** Measure content rather than stretching the painted bar or adding trailing scroll space. */
export function TabBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const [available, setAvailable] = useState(0),
    [content, setContent] = useState(0);
  return (
    <View
      style={{ alignSelf: "stretch", alignItems: "center", maxWidth: "100%" }}
      onLayout={(event) => setAvailable(event.nativeEvent.layout.width)}
    >
      <Tabs.List
        style={[
          style,
          {
            alignSelf: "center",
            maxWidth: "100%",
            ...(available && content ? { width: Math.min(available, content + 6) } : {}),
          },
        ]}
      >
        <Tabs.ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ flexGrow: 0 }}
          onContentSizeChange={(width) => setContent(width)}
        >
          <Tabs.Indicator />
          {children}
        </Tabs.ScrollView>
      </Tabs.List>
    </View>
  );
}
