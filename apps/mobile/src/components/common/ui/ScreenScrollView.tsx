import { useRef } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { ScrollTargetContext } from "./ScrollTargetContext";

export function ScreenScrollView({ style, contentContainerStyle, ...props }: ScrollViewProps) {
  const layout = useFloatingActionLayout();
  const ref = useRef<ScrollView>(null);
  return (
    <ScrollTargetContext.Provider value={ref}>
      <ScrollView
        ref={ref}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        {...props}
        style={[{ flex: 1 }, style]}
        contentContainerStyle={[
          { padding: 20, gap: 16, paddingBottom: layout.paddingBottom },
          contentContainerStyle,
        ]}
      />
    </ScrollTargetContext.Provider>
  );
}
