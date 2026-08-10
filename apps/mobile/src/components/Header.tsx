import { Show, useUser } from "@clerk/expo";
import { UserButton } from "@clerk/expo/native";

import { Text } from "heroui-native/text";
import { View } from "react-native";

export function Header() {
  const { user } = useUser();

  return (
    <View className="mb-6 flex-row items-center justify-between">
      <Text className="text-xl font-bold">Board Game Organizer</Text>
      <Show when="signed-in">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-muted">
            {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
          </Text>
          <UserButton />
        </View>
      </Show>
    </View>
  );
}
