"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Avatar, Button, Card, Spinner } from "@heroui/react";

import { resolveApiUrl, useProfileQuery } from "@board-game-organizer/shared";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

export function Profile() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
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
  } = useProfileQuery({ apiUrl: apiUrl(), token });

  const handleLogout = useCallback(async () => {
    try {
      setIsSigningOut(true);
      await signOut({ redirectUrl: "/" });
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, router]);

  // Full-screen placeholder while the logout is in flight (mirrors the
  // mobile behaviour).
  if (isSigningOut) {
    return (
      <div className="mt-6 flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mt-6 flex items-center justify-center gap-2">
        <Spinner size="sm" />
        <p className="text-sm text-default-400">Caricamento...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="mt-4 rounded-xl p-4">
        <p className="text-sm text-danger">
          Errore durante il caricamento del profilo:{" "}
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button className="mt-3" variant="outline" onPress={() => refetch()}>
          Riprova
        </Button>
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
          <p className="text-xs text-default-400">Owned</p>
        </div>
        <div>
          <p className="text-xl font-bold">{profile.stats.gamesPlayed}</p>
          <p className="text-xs text-default-400">Played</p>
        </div>
        <div>
          <p className="text-xl font-bold">{profile.stats.friends}</p>
          <p className="text-xs text-default-400">Friends</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-default-400">
        Plan: {profile.plan} &middot; Language: {profile.preferredLanguage}
      </p>

      <Button
        className="mt-6"
        variant="outline"
        isDisabled={isSigningOut}
        onPress={handleLogout}
      >
        Logout
      </Button>
    </Card>
  );
}
