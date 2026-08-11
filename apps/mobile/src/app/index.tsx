import { useAuth } from "@clerk/expo";

import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { Spinner } from "heroui-native/spinner";

import { LoginFallback } from "@/components/LoginFallback";
import { Header } from "@/components/Header";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Navigate with router.replace in an effect instead of rendering <Redirect>.
  // With the (tabs) group's first screen at "/matches" (not "/"), the root
  // index is the ONLY route at "/" — no ambiguity with the tabs, so this
  // effect cannot ping-pong with the (tabs) guard.
  useEffect(() => {
    if (isLoaded && isSignedIn && pathname === "/") {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isSignedIn, router, pathname]);

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background p-6">
      <Header />
      {isSignedIn ? null : <LoginFallback />}
    </View>
  );
}
