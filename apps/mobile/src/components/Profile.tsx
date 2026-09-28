import { resolveApiUrl, useProfileQuery } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Surface } from "heroui-native/surface";
import { Typography } from "heroui-native/text";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { useT } from "@/lib/i18n";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export function Profile() {
  const { getToken, signOut, isLoaded, isSignedIn, userId } = useAuth();
  const t = useT();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Server data lives in TanStack Query — Zustand never stores it.
  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfileQuery({
    apiUrl: apiUrl(),
    getToken,
    userId,
    enabled: isLoaded && Boolean(isSignedIn),
  });

  const handleLogout = useCallback(async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      // The (tabs) guard also redirects when the session state flips;
      // this replace makes the transition immediate.
      router.replace("/");
    } catch {
      // Clerk keeps the current session active when sign-out fails.
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, router]);

  if (isLoading) {
    return (
      <View style={{ marginTop: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Skeleton isLoading variant="pulse" style={{ width: 64, height: 64, borderRadius: 32 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton
              isLoading
              variant="pulse"
              style={{ width: "60%", height: 18, borderRadius: 4 }}
            />
            <Skeleton
              isLoading
              variant="pulse"
              style={{ width: "40%", height: 14, borderRadius: 4 }}
            />
          </View>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <Surface className="mt-4 rounded-lg p-4">
        <Typography className="text-danger">
          {t("Error while loading the profile:")}{" "}
          {error instanceof Error ? error.message : String(error)}
        </Typography>
        <Button className="mt-3" variant="outline" onPress={() => refetch()}>
          {t("Retry")}
        </Button>
        <Button className="mt-3" variant="danger" isDisabled={isSigningOut} onPress={handleLogout}>
          {t("Logout")}
        </Button>
      </Surface>
    );
  }

  if (!profile) return null;

  return (
    <Surface className="mt-6 rounded-xl p-6">
      <View className="flex-row items-center gap-4">
        <Avatar size="lg" color="accent">
          <Avatar.Image source={{ uri: profile.avatarUrl }} alt={profile.name} />
          <Avatar.Fallback>{profile.name?.charAt(0) ?? "?"}</Avatar.Fallback>
        </Avatar>
        <View>
          <Typography className="text-lg font-semibold">{profile.name}</Typography>
          <Typography className="text-sm text-muted">{profile.email}</Typography>
        </View>
      </View>

      <View style={{ gap: 16, marginTop: 16 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Typography className="text-xl font-bold">{profile.stats.friends}</Typography>
            <Typography className="text-xs text-muted">{t("Friends")}</Typography>
          </View>
          <View style={{ flex: 1 }}>
            <Typography className="text-xl font-bold">{profile.stats.followers}</Typography>
            <Typography className="text-xs text-muted">{t("Followers")}</Typography>
          </View>
          <View style={{ flex: 1 }}>
            <Typography className="text-xl font-bold">{profile.stats.following}</Typography>
            <Typography className="text-xs text-muted">{t("Following")}</Typography>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Typography className="text-xl font-bold">{profile.stats.playedMatches}</Typography>
            <Typography className="text-xs text-muted">{t("Matches played")}</Typography>
          </View>
          <View style={{ flex: 1 }}>
            <Typography className="text-xl font-bold">{profile.stats.adminGroups}</Typography>
            <Typography className="text-xs text-muted">{t("Admin groups")}</Typography>
          </View>
          <View style={{ flex: 1 }}>
            <Typography className="text-xl font-bold">{profile.stats.joinedGroups}</Typography>
            <Typography className="text-xs text-muted">{t("Joined groups")}</Typography>
          </View>
        </View>
      </View>

      <Typography className="mt-3 text-xs text-muted">
        {t("Plan:")} {profile.plan} · {t("Language:")} {profile.preferredLanguage}
      </Typography>

      <Button className="mt-6" variant="danger" isDisabled={isSigningOut} onPress={handleLogout}>
        {t("Logout")}
      </Button>
    </Surface>
  );
}
