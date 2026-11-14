import { getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import { Redirect } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import type { ReactNode } from "react";
import { View } from "react-native";

export function ProfileAccess({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();
  if (!isLoaded || (isSignedIn && !isUserLoaded))
    return (
      <View style={{ flex: 1, padding: 20 }}>
        <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
      </View>
    );
  if (!isSignedIn) return <Redirect href="/" />;
  if (!getMobileNumber(user?.unsafeMetadata)) return <Redirect href="/mobile-number" />;
  return (
    <View className="bg-background" style={{ flex: 1 }}>
      {children}
    </View>
  );
}
