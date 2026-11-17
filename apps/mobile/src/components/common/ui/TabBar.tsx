import { Tabs } from "heroui-native/tabs";
import { type ReactNode, useCallback, useState } from "react";
import { PixelRatio, View, type ViewStyle } from "react-native";
import { stableTabContentWidth } from "@/lib/tabBarGeometry";

/** Measure content rather than stretching the painted bar or adding trailing scroll space. */
export function TabBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const [available, setAvailable] = useState(0),
    [content, setContent] = useState(0);
  const handleContentSizeChange = useCallback((width: number) => {
    setContent((previous) => stableTabContentWidth(previous, width, PixelRatio.get()));
  }, []);
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
          testID="top-tab-scroll"
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ flexGrow: 0 }}
          onContentSizeChange={handleContentSizeChange}
        >
          <Tabs.Indicator />
          {children}
        </Tabs.ScrollView>
      </Tabs.List>
    </View>
  );
}
