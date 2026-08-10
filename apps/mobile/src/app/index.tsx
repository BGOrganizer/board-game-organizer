import { Show } from "@clerk/expo";

import { Redirect } from "expo-router";
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
        {/* Redirect (non Stack.Screen) quando autenticati: Stack.Screen con name
            può essere usato solo dentro un Layout route */}
        <Redirect href="/(tabs)" />
      </Show>
    </View>
  );
}