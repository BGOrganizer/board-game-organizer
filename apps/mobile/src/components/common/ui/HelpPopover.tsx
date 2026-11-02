import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { CircleHelp, type LucideIcon } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";

export function HelpPopover({
  label,
  title,
  width = 260,
  align,
  onOpenChange,
  icon: Icon = CircleHelp,
  tone = "muted",
  children,
}: {
  label: string;
  title: string;
  icon?: LucideIcon;
  tone?: "muted" | "warning" | "success";
  width?: number;
  align?: Extract<ComponentProps<typeof Popover.Content>, { presentation: "popover" }>["align"];
  onOpenChange?: ComponentProps<typeof Popover>["onOpenChange"];
  children: ReactNode;
}) {
  const colors = {
    muted: "muted",
    warning: "warning-soft-foreground",
    success: "success-soft-foreground",
  } as const;
  const color = useThemeColor(colors[tone]);
  return (
    <Popover onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          accessibilityLabel={label}
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <Icon size={20} color={color} accessible={false} />
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
