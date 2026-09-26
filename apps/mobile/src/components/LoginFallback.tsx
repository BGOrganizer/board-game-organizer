import { useRouter } from "expo-router";

import { Button } from "heroui-native/button";
import { Typography } from "heroui-native/text";
import { View } from "react-native";

import { useT } from "@/lib/i18n";

export function LoginFallback() {
  const router = useRouter();
  const t = useT();

  return (
    <View className="items-center gap-4 pt-16">
      <Typography className="text-center text-2xl font-bold">
        {t("Welcome to Board Game Organizer")}
      </Typography>
      <Typography className="max-w-xs text-center text-muted">
        {t(
          "Organize your board game collection, track your matches and connect with other players.",
        )}
      </Typography>
      <View className="mt-2">
        <Button variant="primary" onPress={() => router.push("/sign-in")}>
          {t("Sign in / Register")}
        </Button>
      </View>
    </View>
  );
}
