"use client";

import { resolveApiUrl, useMatches } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, Check, Crown, Plus, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MatchWizard } from "@/components/MatchWizard";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

export function Matches() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { t } = useLingui();
  const mutationFeedback = useMutationFeedback();
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
    userId,
    feedback: mutationFeedback,
  });

  if (creating) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <MatchWizard onCreated={() => setCreating(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-24">
      <h2 className="mb-4 text-lg font-semibold">{t`Matches`}</h2>

      {matches.list.isPending && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}
      {matches.list.isError && <p className="text-sm text-danger">{t`Could not load matches`}</p>}
      {matches.list.data && matches.list.data.length === 0 && (
        <p className="text-sm text-default-500">{t`No matches yet — create your first one!`}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {matches.list.data?.map((match) => {
          const invitation = match.invitations.find(
            (candidate) => candidate.inviteeUserId === userId,
          );
          return (
            <Card key={match.id} className="rounded-xl p-0">
              <Link
                href={match.optimistic ? "/matches" : `/matches/${match.id}`}
                aria-label={`${t`Open match`}: ${match.name}`}
                aria-disabled={match.optimistic}
                onClick={(event) => {
                  if (match.optimistic) event.preventDefault();
                }}
                className="w-full cursor-pointer p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{match.name}</p>
                  <span className="text-xs text-default-500">
                    {match.status === "CREATED" ? t`Confirmed` : t`Planning`}
                  </span>
                  {match.adminUserId === userId ? (
                    <Crown aria-label={t`Administrator`} className="h-4 w-4 text-warning" />
                  ) : (
                    <UserRound aria-label={t`Player`} className="h-4 w-4 text-default-500" />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-default-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {(match.status === "CREATED" && match.selectedDate
                    ? [match.selectedDate]
                    : match.dates
                  ).map((date) => (
                    <span key={date}>{new Date(date).toLocaleString()}</span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-default-400">
                  {t`Players`}: {match.minPlayers}–{match.maxPlayers}
                  {match.status === "PLANNING" &&
                    match.gameIds.length > 0 &&
                    ` · ${match.gameIds.length} ${t`games`}`}
                </p>
              </Link>

              {invitation?.status === "PENDING" && (
                <div className="flex gap-2 border-t border-default-200 p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t`Decline`}
                    isDisabled={matches.respondInvitation.isPending}
                    onPress={() =>
                      matches.respondInvitation.mutate({
                        invitationId: invitation.id,
                        decision: "decline",
                      })
                    }
                  >
                    <X className="h-4 w-4" />
                    <span className="hidden sm:inline">{t`Decline`}</span>
                  </Button>
                  <Button
                    size="sm"
                    aria-label={t`Accept`}
                    isDisabled={matches.respondInvitation.isPending}
                    onPress={() =>
                      matches.respondInvitation.mutate({
                        invitationId: invitation.id,
                        decision: "accept",
                      })
                    }
                  >
                    <Check className="h-4 w-4" />
                    <span className="hidden sm:inline">{t`Accept`}</span>
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {matches.respondInvitation.isError && (
        <p className="mt-3 text-sm text-danger">{t`Could not update the invitation`}</p>
      )}

      <Button
        aria-label={t`Create a match`}
        onPress={() => setCreating(true)}
        className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg sm:right-6 sm:bottom-6 sm:h-14 sm:w-14"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
