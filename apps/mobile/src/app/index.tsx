import { useAuth } from "@clerk/expo";

import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { Spinner } from "heroui-native/spinner";

import { LoginFallback } from "@/components/LoginFallback";
import { Header } from "@/components/Header";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  // Navigate with router.replace in an effect instead of rendering <Redirect>
  // (a rendered Redirect caused a "Maximum update depth" loop during auth
  // state transitions).
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner color="accent" />
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
