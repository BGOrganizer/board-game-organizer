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
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          backgroundColor: "transparent",
        }}
      >
        <Skeleton isLoading variant="pulse" style={{ width: 192, height: 48, borderRadius: 8 }} />
        <Skeleton isLoading variant="pulse" style={{ width: 128, height: 16, borderRadius: 4 }} />
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
