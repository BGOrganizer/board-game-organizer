import { Tabs, useTabs, useTabsMeasurements } from "heroui-native/tabs";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { PixelRatio, type ScrollView, View, type ViewStyle } from "react-native";
import { useListActivity } from "@/lib/listActivity";
import { revealedTabOffset, stableTabContentWidth } from "@/lib/tabBarGeometry";

/** Measure content rather than stretching the painted bar or adding trailing scroll space. */
export function TabBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const [available, setAvailable] = useState(0),
    [content, setContent] = useState(0),
    [viewport, setViewport] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const active = useListActivity();
  const { value } = useTabs();
  const { measurements } = useTabsMeasurements();
  const selected = measurements[value];
  useEffect(() => {
    if (!active() || !selected) return;
    const next = revealedTabOffset(offset.current, selected.x, selected.width, viewport, content);
    if (Math.abs(next - offset.current) <= 1 / PixelRatio.get()) return;
    offset.current = next;
    scroll.current?.scrollTo({ x: next, animated: false });
  }, [active, selected, viewport, content]);
  const handleContentSizeChange = useCallback(
    (width: number) => {
      if (!active()) return;
      setContent((previous) => stableTabContentWidth(previous, width, PixelRatio.get()));
    },
    [active],
  );
  return (
    <View
      style={{ alignSelf: "stretch", alignItems: "center", maxWidth: "100%" }}
      onLayout={(event) => {
        if (active()) setAvailable(event.nativeEvent.layout.width);
      }}
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
          ref={scroll}
          testID="top-tab-scroll"
          scrollAlign="none"
          onLayout={(event) => {
            if (active()) setViewport(event.nativeEvent.layout.width);
          }}
          onScroll={(event) => {
            if (active()) offset.current = event.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ flexGrow: 0 }}
          onContentSizeChange={handleContentSizeChange}
        >
          <Tabs.Indicator animation="disabled" />
          {children}
        </Tabs.ScrollView>
      </Tabs.List>
    </View>
  );
}
