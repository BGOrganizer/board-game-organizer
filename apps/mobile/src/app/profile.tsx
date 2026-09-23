import { getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import { Redirect } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { View } from "react-native";
import { Profile } from "@/components/Profile";

export default function ProfileScreen() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();
  if (!isLoaded || (isSignedIn && !isUserLoaded)) {
    return (
      <View className="flex-1 bg-background p-6">
        <Skeleton isLoading variant="pulse" style={{ width: 192, height: 32, borderRadius: 8 }} />
      </View>
    );
  }
  if (!isSignedIn) return <Redirect href="/" />;
  if (!getMobileNumber(user?.unsafeMetadata)) return <Redirect href="/mobile-number" />;

  return (
    <View className="flex-1 bg-background p-6">
      <Profile />
    </View>
  );
}
