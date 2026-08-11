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
  // The pathname check prevents a ping-pong with the (tabs) guard while
  // Clerk's auth state settles during sign-in/sign-out.
  useEffect(() => {
    if (isLoaded && isSignedIn && !pathname.startsWith("/(tabs)")) {
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
