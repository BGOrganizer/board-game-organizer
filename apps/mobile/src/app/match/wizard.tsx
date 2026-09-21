import { resolveApiUrl, useMatchDetail } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams } from "expo-router";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { MatchWizard } from "@/components/MatchWizard";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export default function MatchWizardScreen() {
  const { matchId: matchIdParam } = useLocalSearchParams<{ matchId?: string | string[] }>();
  const matchId = Array.isArray(matchIdParam) ? matchIdParam[0] : matchIdParam;
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const t = useT();
  const feedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((nextToken) => active && setToken(nextToken ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const detail = useMatchDetail({
    apiUrl: apiUrl(),
    token,
    getToken,
    userId,
    feedback,
    matchId: matchId ?? "",
  });

  if (!matchId) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: t("Configure match") }} />
        <MatchWizard />
      </View>
    );
  }

  if (detail.detail.isPending) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <Stack.Screen options={{ title: t("Edit match") }} />
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 56, borderRadius: 12 }}
        />
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 220, borderRadius: 12 }}
        />
      </View>
    );
  }

  if (
    detail.detail.isError ||
    !detail.detail.data ||
    detail.detail.data.match.adminUserId !== userId
  ) {
    return (
      <View style={{ flex: 1, padding: 20 }}>
        <Stack.Screen options={{ title: t("Edit match") }} />
        <Text className="text-sm text-danger">{t("Could not load match details")}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t("Edit match") }} />
      <MatchWizard initialData={detail.detail.data} />
    </View>
  );
}
