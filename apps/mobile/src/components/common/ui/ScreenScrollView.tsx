import { useRef } from "react";
import type { ScrollView, ScrollViewProps } from "react-native";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { InputScrollView } from "./InputScrollView";
import { ScrollTargetContext } from "./ScrollTargetContext";

export function ScreenScrollView({
  style,
  contentContainerStyle,
  hasFloatingActions = false,
  ...props
}: ScrollViewProps & { hasFloatingActions?: boolean }) {
  const layout = useFloatingActionLayout(hasFloatingActions);
  const ref = useRef<ScrollView>(null);
  return (
    <ScrollTargetContext.Provider value={ref}>
      <InputScrollView
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
