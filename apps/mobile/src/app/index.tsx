import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { View } from "react-native";

import { Header } from "@/components/Header";
import { LoginFallback } from "@/components/LoginFallback";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <Skeleton isLoading variant="pulse" className="h-12 w-48 rounded-lg" />
        <Skeleton isLoading variant="pulse" className="h-4 w-32 rounded" />
      </View>
    );
  }

  // Signed-in users land on the tabs directly. A declarative <Redirect> (not
  // a router.replace effect) is race-free: expo-router performs the swap
  // once the navigator is ready, which fixes intermittent cold-start crashes
  // when reopening the app while still signed in.
  if (isSignedIn) {
    return <Redirect href="/matches" />;
  }

  return (
    <View className="flex-1 bg-background p-6">
      <Header />
      <LoginFallback />
    </View>
  );
}
