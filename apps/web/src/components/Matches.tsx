"use client";

import { resolveApiUrl, useMatches } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { MatchWizard } from "@/components/MatchWizard";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

export function Matches() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useLingui();
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((tok) => active && setToken(tok ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const matches = useMatches({
    apiUrl: apiUrl(),
    token,
    getToken,
    protectionBypass: protectionBypass(),
  });

  if (creating) {
    return (
      <div className="mx-auto w-full max-w-md">
        <MatchWizard onCreated={() => setCreating(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md pb-24">
      <h2 className="mb-4 text-lg font-semibold">{t`Matches`}</h2>

      {matches.list.isPending && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}
      {matches.list.isError && <p className="text-sm text-danger">{t`Could not load matches`}</p>}
      {matches.list.data && matches.list.data.length === 0 && (
        <p className="text-sm text-default-500">{t`No matches yet — create your first one!`}</p>
      )}

      <div className="space-y-2">
        {matches.list.data?.map((m) => (
          <Card key={m.id} className="rounded-xl p-4">
            <p className="font-semibold">{m.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-default-500">
              <CalendarClock className="h-3.5 w-3.5" />
              {m.dates.map((d) => (
                <span key={d}>{new Date(d).toLocaleString()}</span>
              ))}
            </div>
            <p className="mt-1 text-xs text-default-400">
              {t`Players`}: {m.minPlayers}–{m.maxPlayers}
              {m.gameIds.length > 0 && ` · ${m.gameIds.length} ${t`games`}`}
            </p>
          </Card>
        ))}
      </div>

      <Button
        isIconOnly
        variant="primary"
        aria-label={t`Create a match`}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        onPress={() => setCreating(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
