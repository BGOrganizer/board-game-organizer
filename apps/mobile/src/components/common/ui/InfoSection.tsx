import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

export function InfoSection({
  label,
  helpLabel,
  help,
  icon: Icon,
  headerAccessory,
  children,
}: {
  label: string;
  helpLabel: string;
  help: string;
  icon: LucideIcon;
  headerAccessory?: ReactNode;
  children: ReactNode;
}) {
  const muted = useThemeColor("muted");
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon size={18} color={muted} accessible={false} />
        <Typography
          accessibilityRole="header"
          className="font-semibold text-foreground"
          style={{ flexShrink: 1 }}
        >
          {label}
        </Typography>
        <HelpPopover label={helpLabel} title={label}>
          <Popover.Description>{help}</Popover.Description>
        </HelpPopover>
        {headerAccessory ? <View style={{ marginLeft: "auto" }}>{headerAccessory}</View> : null}
      </View>
      <GroupedList>{children}</GroupedList>
    </View>
  );
}
