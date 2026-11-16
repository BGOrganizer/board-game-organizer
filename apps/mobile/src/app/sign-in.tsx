import { getMobileNumber } from "@board-game-organizer/schemas";
import { useAuth, useUser } from "@clerk/expo";
import { AuthView } from "@clerk/expo/native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { View } from "react-native";

import { inviteDestination, inviteTokenParam } from "@/lib/inviteLinks";

export default function SignInScreen() {
  const { inviteToken: rawToken } = useLocalSearchParams<{ inviteToken?: string | string[] }>();
  const inviteToken = inviteTokenParam(rawToken);
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: isUserLoaded, user } = useUser();
  const router = useRouter();

  if (isAuthLoaded && isSignedIn) {
    if (!isUserLoaded) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Skeleton isLoading variant="pulse" style={{ width: 192, height: 48, borderRadius: 8 }} />
          <Skeleton isLoading variant="pulse" style={{ width: 128, height: 16, borderRadius: 4 }} />
        </View>
      );
    }
    return (
      <Redirect
        href={
          getMobileNumber(user?.unsafeMetadata)
            ? inviteDestination(rawToken)
            : { pathname: "/mobile-number", params: inviteToken ? { inviteToken } : {} }
        }
      />
    );
  }

  return <AuthView mode="signInOrUp" isDismissible={false} onHostBack={() => router.back()} />;
}
