import { Text, View } from "react-native";
import { useRouter } from "expo-router";

export function LoginFallback() {

    const router = useRouter();
    return (

        <View className="items-center gap-4 pt-16">
            <Text className="text-center text-2xl font-bold">
                Benvenuto in Board Game Organizer
            </Text>
            <Text className="max-w-xs text-center text-default-500">
                Organizza la tua collezione di giochi da tavolo, tieni traccia
                delle partite e connettiti con altri giocatori.
            </Text>
            <View className="mt-2">
                <Text
                    className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white"
                    onPress={() => router.push("/sign-in")}
                >
                    Accedi / Registrati
                </Text>
            </View>
        </View>
    )
}