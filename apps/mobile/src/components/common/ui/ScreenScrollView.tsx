import { ScrollView, type ScrollViewProps } from "react-native";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";

export function ScreenScrollView({ style, contentContainerStyle, ...props }: ScrollViewProps) {
  const layout = useFloatingActionLayout();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      {...props}
      style={[{ flex: 1 }, style]}
      contentContainerStyle={[
        { padding: 20, gap: 16, paddingBottom: layout.paddingBottom },
        contentContainerStyle,
      ]}
    />
  );
}
