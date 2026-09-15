import { getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import { AuthView, useAuthViewState } from "@clerk/expo/native";
import { Redirect, useRouter } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { View } from "react-native";

export default function SignInScreen() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isLoaded: isAuthFlowLoaded, isAuthFlowComplete } = useAuthViewState();
  const router = useRouter();

  if (isAuthLoaded && isSignedIn && isAuthFlowLoaded && isAuthFlowComplete) {
    if (!isUserLoaded) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Skeleton isLoading variant="pulse" style={{ width: 192, height: 48, borderRadius: 8 }} />
          <Skeleton isLoading variant="pulse" style={{ width: 128, height: 16, borderRadius: 4 }} />
        </View>
      );
    }
    return (
      <Redirect href={getMobileNumber(user?.unsafeMetadata) ? "/matches" : "/mobile-number"} />
    );
  }

  return <AuthView mode="signInOrUp" isDismissible={false} onHostBack={() => router.back()} />;
}
