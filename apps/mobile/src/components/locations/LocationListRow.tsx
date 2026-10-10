import { formatLocationAddress } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { MapPin } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { GroupedRow } from "@/components/common/ui/GroupedRow";

export function LocationListRow({
  name,
  address,
  onPress,
  leading,
  actions,
  testID,
  accessibilityLabel,
  children,
}: {
  name: string;
  address?: string;
  onPress?: () => void;
  leading?: ReactNode;
  actions?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  const Identity = onPress ? Pressable : View;
  return (
    <GroupedRow>
      {leading ?? <MapPin size={20} color={muted} />}
      <Identity
        testID={testID}
        onPress={onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={onPress ? (accessibilityLabel ?? name) : undefined}
        style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 4 }}
      >
        <Typography className="font-medium text-foreground" numberOfLines={1}>
          {name}
        </Typography>
        {address ? (
          <Typography className="text-sm text-muted" numberOfLines={1} accessibilityLabel={address}>
            {formatLocationAddress(address)}
          </Typography>
        ) : null}
        {children}
      </Identity>
      {actions}
    </GroupedRow>
  );
}
