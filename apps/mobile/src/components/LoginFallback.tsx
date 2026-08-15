import { useRouter } from "expo-router";

import { Button } from "heroui-native/button";
import { Text } from "heroui-native/text";
import { View } from "react-native";

export function LoginFallback() {
  const router = useRouter();

  return (
    <View className="items-center gap-4 pt-16">
      <Text className="text-center text-2xl font-bold">Benvenuto in Board Game Organizer</Text>
      <Text className="max-w-xs text-center text-muted">
        Organizza la tua collezione di giochi da tavolo, tieni traccia delle partite e connettiti
        con altri giocatori.
      </Text>
      <View className="mt-2">
        <Button variant="primary" onPress={() => router.push("/sign-in")}>
          Accedi / Registrati
        </Button>
      </View>
    </View>
  );
}
