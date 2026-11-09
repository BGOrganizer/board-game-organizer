import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { CircleHelp, type LucideIcon } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";

export function HelpPopover({
  label,
  title,
  width = 260,
  align,
  onOpenChange,
  icon: Icon = CircleHelp,
  tone = "muted",
  size = "default",
  indicator,
  triggerClassName,
  children,
}: {
  label: string;
  title: string;
  icon?: LucideIcon;
  tone?: "muted" | "warning" | "success" | "accent" | "danger";
  size?: "default" | "compact";
  width?: Extract<ComponentProps<typeof Popover.Content>, { presentation: "popover" }>["width"];
  indicator?: ReactNode;
  triggerClassName?: string;
  align?: Extract<ComponentProps<typeof Popover.Content>, { presentation: "popover" }>["align"];
  onOpenChange?: ComponentProps<typeof Popover>["onOpenChange"];
  children: ReactNode;
}) {
  const colors = {
    muted: "muted",
    warning: "warning-soft-foreground",
    success: "success-soft-foreground",
    accent: "accent-soft-foreground",
    danger: "danger-soft-foreground",
  } as const;
  const color = useThemeColor(colors[tone]);
  const symbol = (
    <>
      <Icon size={size === "compact" ? 16 : 20} color={color} accessible={false} />
      {indicator}
    </>
  );
  return (
    <Popover onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          className={size === "compact" ? undefined : triggerClassName}
          accessibilityLabel={label}
          style={{
            position: "relative",
            minWidth: 44,
            minHeight: 44,
            ...(size === "compact" ? { padding: 0 } : {}),
          }}
        >
          {size === "compact" ? (
            <View
              className={triggerClassName}
              style={{
                position: "relative",
                width: 28,
                height: 28,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {symbol}
            </View>
          ) : (
            symbol
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content
          presentation="popover"
          placement="bottom"
          align={align}
          width={width}
          accessible={false}
        >
          <Popover.Title accessibilityRole="header" importantForAccessibility="yes">
            {title}
          </Popover.Title>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
