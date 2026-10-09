import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { CircleHelp } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";

export function HelpPopover({
  label,
  title,
  width = 260,
  align,
  onOpenChange,
  children,
}: {
  label: string;
  title: string;
  width?: number;
  align?: Extract<ComponentProps<typeof Popover.Content>, { presentation: "popover" }>["align"];
  onOpenChange?: ComponentProps<typeof Popover>["onOpenChange"];
  children: ReactNode;
}) {
  const muted = useThemeColor("muted");
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
          <CircleHelp size={18} color={muted} />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" placement="bottom" align={align} width={width}>
          <Popover.Title>{title}</Popover.Title>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
