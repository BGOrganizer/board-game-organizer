import { Show, useUser } from "@clerk/expo";
import { UserButton } from "@clerk/expo/native";

import { Typography } from "heroui-native/text";
import { View } from "react-native";

export function Header() {
  const { user } = useUser();

  return (
    <View className="mb-6 flex-row items-center justify-between">
      <Typography className="text-xl font-bold">Board Game Organizer</Typography>
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
