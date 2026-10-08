import { Show, useUser } from "@clerk/expo";
import { UserButton } from "@clerk/expo/native";

import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Dices } from "lucide-react-native";
import { View } from "react-native";

export function Header() {
  const { user } = useUser();
  const foreground = useThemeColor("foreground");

  return (
    <View className="mb-6 flex-row items-center justify-between">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        <Dices size={22} color={foreground} accessible={false} />
        <Typography className="text-xl font-bold text-foreground" numberOfLines={1}>
          Board Game Organizer
        </Typography>
      </View>
      <Show when="signed-in">
        <View className="flex-row items-center gap-2">
          <Typography className="text-sm text-muted">
            {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
          </Typography>
          <UserButton />
        </View>
      </Show>
    </View>
  );
}
