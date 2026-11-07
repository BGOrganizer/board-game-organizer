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
  titleAccessory,
  actions,
  testID,
  accessibilityLabel,
  children,
}: {
  name: string;
  address?: string;
  onPress?: () => void;
  leading?: ReactNode;
  titleAccessory?: ReactNode;
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
        style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center", gap: 4 }}
      >
        <View style={{ minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Typography
            className="font-medium text-foreground"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {name}
          </Typography>
          {titleAccessory}
        </View>
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
