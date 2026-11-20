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
  const [foreground, muted] = useThemeColor(["segment-foreground", "muted"]);
  return (
    <Tabs.Trigger
      {...props}
      testID={props.testID ?? `top-tab-${props.value}`}
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
          <Icon size={16} color={state.isSelected ? foreground : muted} accessible={false} />
          {typeof children === "function" ? children(state) : children}
        </>
      )}
    </Tabs.Trigger>
  );
}
