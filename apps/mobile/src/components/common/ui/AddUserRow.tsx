import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { UserRoundPlus } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { GroupedList } from "./GroupedList";
import { GroupedRow } from "./GroupedRow";

export function AddUserRow({
  label,
  description,
  onPress,
  isDisabled,
  actions,
}: {
  label: string;
  description?: string;
  onPress: () => void;
  isDisabled?: boolean;
  actions?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  return (
    <GroupedList>
      <GroupedRow>
        <View
          className="bg-muted/20"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserRoundPlus size={20} color={muted} />
        </View>
        <Button
          variant="ghost"
          accessibilityLabel={label}
          onPress={onPress}
          isDisabled={isDisabled}
          style={{ flex: 1, minHeight: 44, justifyContent: "flex-start" }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Typography className="text-muted">{label}</Typography>
            {description ? (
              <Typography className="text-sm text-muted">{description}</Typography>
            ) : null}
          </View>
        </Button>
        {actions}
      </GroupedRow>
    </GroupedList>
  );
}
