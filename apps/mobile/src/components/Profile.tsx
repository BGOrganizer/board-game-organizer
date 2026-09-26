import { resolveApiUrl, useProfileQuery } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Surface } from "heroui-native/surface";
import { Typography } from "heroui-native/text";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { useT } from "@/lib/i18n";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export function Profile() {
  const { getToken, signOut, isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // NOTE: getToken from @clerk/expo has a NEW identity on every render, so it
  // must NOT be an effect dependency (it caused a "Maximum update depth"
  // render loop during sign-out). We key the effect on the stable auth state.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setToken(null);
      return;
    }
    let active = true;
    getToken()
      .then((t) => {
        if (active) setToken(t ?? null);
      })
      .catch(() => {
        if (active) setToken(null);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Server data lives in TanStack Query — Zustand never stores it.
  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfileQuery({ apiUrl: apiUrl(), token });

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

  if (!token) {
    return (
      <View className="mt-6 items-center">
        <Typography className="text-sm text-muted">{t("Sign-in unavailable")}</Typography>
      </View>
    );
  }

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

      <View className="mt-4 flex-row gap-6">
        <View>
          <Typography className="text-xl font-bold">{profile.stats.gamesOwned}</Typography>
          <Typography className="text-xs text-muted">{t("Owned")}</Typography>
        </View>
        <View>
          <Typography className="text-xl font-bold">{profile.stats.gamesPlayed}</Typography>
          <Typography className="text-xs text-muted">{t("Played")}</Typography>
        </View>
        <View>
          <Typography className="text-xl font-bold">{profile.stats.friends}</Typography>
          <Typography className="text-xs text-muted">{t("Friends")}</Typography>
        </View>
      </View>

      <Typography className="mt-3 text-xs text-muted">
        {t("Plan:")} {profile.plan} · {t("Language:")} {profile.preferredLanguage}
      </Typography>

      <Button className="mt-6" variant="outline" isDisabled={isSigningOut} onPress={handleLogout}>
        {t("Logout")}
      </Button>
    </Surface>
  );
}
