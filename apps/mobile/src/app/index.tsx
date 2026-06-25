import { Show } from "@clerk/expo";

import { Stack } from 'expo-router';
import { View } from "react-native";

import { LoginFallback } from "@/components/LoginFallback";
import { Header } from "@/components/Header";

export default function Index() {

  return (
    <View className="flex-1 bg-background p-6">
      <Header />
      <Show
        when="signed-in"
        fallback={<LoginFallback />}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      </Show>
    </View>
  );
}