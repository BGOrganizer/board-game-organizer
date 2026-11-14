import { useThemeColor } from "heroui-native/hooks";
import { Tabs } from "heroui-native/tabs";
import type { LucideIcon } from "lucide-react-native";
import type { ComponentProps } from "react";

export function TabTrigger({
  icon: Icon,
  children,
  style,
  ...props
}: ComponentProps<typeof Tabs.Trigger> & { icon: LucideIcon }) {
  const [accent, muted] = useThemeColor(["accent", "muted"]);
  return (
    <Tabs.Trigger
      {...props}
      style={
        typeof style === "function"
          ? (state) => [
              { minHeight: 44, flexShrink: 0, flexDirection: "row", gap: 6 },
              style(state),
            ]
          : [{ minHeight: 44, flexShrink: 0, flexDirection: "row", gap: 6 }, style]
      }
    >
      {(state) => (
        <>
          <Icon size={16} color={state.isSelected ? accent : muted} accessible={false} />
          {typeof children === "function" ? children(state) : children}
        </>
      )}
    </Tabs.Trigger>
  );
}
