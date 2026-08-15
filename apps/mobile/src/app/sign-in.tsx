import { AuthView } from "@clerk/expo/native";
import { useRouter } from "expo-router";

export default function SignInScreen() {
  const router = useRouter();

  return <AuthView mode="signInOrUp" onDismiss={() => router.back()} />;
}
