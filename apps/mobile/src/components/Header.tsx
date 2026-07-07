import { Text, View } from "react-native";
import { Show, useUser } from "@clerk/expo";
import { UserButton } from "@clerk/expo/native";

export function Header() {
    const { user } = useUser();

    return (
        <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-foreground">
                Board Game Organizer
            </Text>
            <Show when="signed-in">
                <View className="flex-row items-center gap-2">
                    <Text className="text-sm text-default-500">
                        {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
                    </Text>
                    <UserButton />
                </View>
            </Show>
        </View>
    )
}