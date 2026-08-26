"use client";

import { resolveApiUrl, useProfileQuery } from "@board-game-organizer/shared";
import { useAuth, useClerk } from "@clerk/nextjs";
import { Avatar, Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

// NEXT_PUBLIC_* reads are only inlined by Next.js in project files, so the
// bypass must be read here and passed down to the shared API helpers.
function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

export function Profile() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { t } = useLingui();
  const [token, setToken] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // NOTE: getToken from @clerk/nextjs has a NEW identity on every render, so it
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
  } = useProfileQuery({ apiUrl: apiUrl(), token, protectionBypass: protectionBypass() });

  const handleLogout = useCallback(async () => {
    try {
      setIsSigningOut(true);
      await signOut({ redirectUrl: "/" });
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut]);

  // Full-screen placeholder while the logout is in flight (mirrors the
  // mobile behaviour).
  if (isSigningOut) {
    return (
      <div className="mt-6 flex min-h-[60vh] items-center justify-center">
        <Skeleton animationType="pulse" className="h-16 w-48 rounded-lg" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card className="mt-4 rounded-xl p-6">
        <div className="flex flex-row items-center gap-4">
          <Skeleton animationType="pulse" className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton animationType="pulse" className="h-4 w-2/3 rounded" />
            <Skeleton animationType="pulse" className="h-3 w-1/2 rounded" />
          </div>
        </div>
        <div className="mt-4 flex flex-row gap-6">
          {[0, 1, 2].map((n) => (
            <Skeleton key={`stat-${n}`} animationType="pulse" className="h-8 w-12 rounded" />
          ))}
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="mt-4 rounded-xl p-4">
        <p className="text-sm text-danger">
          {t`Error while loading the profile:`}{" "}
          {error instanceof Error ? error.message : String(error)}
        </p>
        <div className="mt-3 flex gap-3">
          <Button variant="outline" onPress={() => refetch()}>
            {t`Retry`}
          </Button>
          {/* Logout must stay reachable even when the profile fails to load
              (e.g. API 401): it is a global action, not part of the
              profile data. E2E relies on it after a failed profile load. */}
          <Button variant="outline" isDisabled={isSigningOut} onPress={handleLogout}>
            {t`Logout`}
          </Button>
        </div>
      </Card>
    );
  }

  if (!profile) return null;

  return (
    <Card className="mt-6 rounded-xl p-6">
      <div className="flex items-center gap-4">
        <Avatar size="lg" color="accent">
          <Avatar.Image src={profile.avatarUrl} alt={profile.name} />
          <Avatar.Fallback>{profile.name?.charAt(0) ?? "?"}</Avatar.Fallback>
        </Avatar>
        <div>
          <h2 className="text-lg font-semibold">{profile.name}</h2>
          <p className="text-sm text-default-500">{profile.email}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-6">
        <div>
          <p className="text-xl font-bold">{profile.stats.gamesOwned}</p>
          <p className="text-xs text-default-400">{t`Owned`}</p>
        </div>
        <div>
          <p className="text-xl font-bold">{profile.stats.gamesPlayed}</p>
          <p className="text-xs text-default-400">{t`Played`}</p>
        </div>
        <div>
          <p className="text-xl font-bold">{profile.stats.friends}</p>
          <p className="text-xs text-default-400">{t`Friends`}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-default-400">
        {t`Plan:`} {profile.plan} &middot; {t`Language:`} {profile.preferredLanguage}
      </p>

      <Button className="mt-6" variant="outline" isDisabled={isSigningOut} onPress={handleLogout}>
        {t`Logout`}
      </Button>
    </Card>
  );
}
