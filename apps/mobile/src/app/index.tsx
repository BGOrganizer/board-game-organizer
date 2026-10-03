import { getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import { Redirect } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { View } from "react-native";

import { Header } from "@/components/Header";
import { LoginFallback } from "@/components/LoginFallback";

export default function Index() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();

  if (!isAuthLoaded || (isSignedIn && !isUserLoaded)) {
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

  // Declarative redirects remain race-free during cold-start navigation.
  // Users without required signup metadata must finish onboarding first.
  if (isSignedIn) {
    return (
      <Redirect href={getMobileNumber(user?.unsafeMetadata) ? "/matches" : "/mobile-number"} />
    );
  }

  return (
    <View className="flex-1 bg-background p-6">
      <Header />
      <LoginFallback />
    </View>
  );
}
