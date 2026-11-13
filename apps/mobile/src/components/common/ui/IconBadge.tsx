import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { type LucideIcon, Plus } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

type Props = {
  icon: LucideIcon;
  label: string;
  color?: "default" | "accent" | "success" | "warning" | "danger";
  multiple?: boolean;
} & (
  | { onPress: () => void; isDisabled?: boolean; title?: never; children?: never }
  | { title: string; children: ReactNode; onPress?: never; isDisabled?: never }
  | { onPress?: never; title?: never; children?: never; isDisabled?: never }
);

export function IconBadge({
  icon: Icon,
  label,
  color = "default",
  multiple,
  onPress,
  isDisabled,
  title,
  children,
}: Props) {
  const foreground = useThemeColor(
    color === "default" ? "default-foreground" : `${color}-soft-foreground`,
  );
  const interactive = Boolean(onPress || title);
  const chip = (
    <Chip
      color={color}
      variant="soft"
      accessible={interactive}
      accessibilityRole={interactive ? "button" : undefined}
      accessibilityLabel={interactive ? label : undefined}
      accessibilityState={interactive ? { disabled: Boolean(isDisabled) } : undefined}
      disabled={!interactive || isDisabled}
      pointerEvents={interactive ? "auto" : "none"}
      importantForAccessibility={interactive ? "yes" : "no-hide-descendants"}
      hitSlop={interactive ? 11 : undefined}
      onPress={
        interactive
          ? (event) => {
              event.stopPropagation();
              onPress?.();
            }
          : undefined
      }
      style={{
        width: 22,
        height: 22,
        minHeight: 0,
        padding: 0,
        borderRadius: 11,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={13} color={foreground} accessible={false} />
      {multiple ? (
        <View
          className="bg-background"
          style={{ position: "absolute", right: 2, top: 2, width: 8, height: 8, borderRadius: 4 }}
        >
          <Plus size={8} color={foreground} accessible={false} />
        </View>
      ) : null}
    </Chip>
  );
  if (!interactive)
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label} pointerEvents="none">
        {chip}
      </View>
    );
  return (
    <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      {title ? (
        <Popover style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Popover.Trigger asChild>{chip}</Popover.Trigger>
          <Popover.Portal>
            <Popover.Overlay />
            <Popover.Content
              presentation="popover"
              placement="bottom"
              width={260}
              accessible={false}
            >
              <Popover.Title accessibilityRole="header" importantForAccessibility="yes">
                {title}
              </Popover.Title>
              {children}
            </Popover.Content>
          </Popover.Portal>
        </Popover>
      ) : (
        chip
      )}
    </View>
  );
}
