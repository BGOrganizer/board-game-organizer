"use client";

import type { MatchCardStatus } from "@board-game-organizer/shared";
import {
  matchCardData,
  matchCardStatusColor,
  resolveApiUrl,
  useMatches,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import bottts from "@dicebear/styles/bottts.json" with { type: "json" };
import { Button, Card, Chip, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Crown, Dices, Plus, UserRound, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MatchWizard } from "@/components/MatchWizard";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const botttsStyle = new Style(bottts);

function MatchMascot({ name }: { name: string }) {
  const src = useMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(new DiceBearAvatar(botttsStyle, { seed: name, size: 64 }).toString())}`,
    [name],
  );
  return (
    <span
      className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent/10"
      aria-hidden="true"
    >
      {/* biome-ignore lint/performance/noImgElement: Locally generated DiceBear SVG. */}
      <img src={src} alt="" className="size-16" />
    </span>
  );
}

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
          const card = matchCardData(match);
          const statusLabels: Record<MatchCardStatus, string> = {
            PLANNING: t`Planning`,
            CREATED: t`Confirmed`,
            IN_PROGRESS: t`In progress`,
            FINISHED: t`Finished`,
            CANCELLED: t`Cancelled`,
          };
          const gameLabel =
            card.gameCount === undefined
              ? (card.selectedGameName ?? t`Game unavailable`)
              : `${card.gameCount} ${card.gameCount === 1 ? t`game` : t`games`}`;
          return (
            <Card key={match.id} className="rounded-xl p-0">
              <Link
                href={match.optimistic ? "/matches" : `/matches/${match.id}`}
                aria-label={`${t`Open match`}: ${match.name}, ${statusLabels[match.status]}, ${card.dates.map((date) => new Date(date).toLocaleDateString()).join(", ")}, ${t`Players`}: ${card.players}/${card.maxPlayers}, ${gameLabel}`}
                aria-disabled={match.optimistic}
                onClick={(event) => {
                  if (match.optimistic) event.preventDefault();
                }}
                className="flex w-full cursor-pointer items-start gap-3 p-3 text-left"
              >
                <MatchMascot name={match.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <p className="min-w-0 font-semibold">{match.name}</p>
                      {match.adminUserId === userId ? (
                        <Crown
                          aria-label={t`Administrator`}
                          className="h-4 w-4 shrink-0 text-warning"
                        />
                      ) : (
                        <UserRound
                          aria-label={t`Player`}
                          className="h-4 w-4 shrink-0 text-default-500"
                        />
                      )}
                    </div>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={matchCardStatusColor[match.status]}
                      className="shrink-0"
                    >
                      {statusLabels[match.status]}
                    </Chip>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-default-600">
                    {card.dates.map((date) => (
                      <time key={date} dateTime={date} className="block">
                        {new Date(date).toLocaleDateString()}
                      </time>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-500">
                    <span className="inline-flex items-center gap-1">
                      <UsersRound className="h-4 w-4" aria-hidden="true" />
                      {card.players}/{card.maxPlayers}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Dices className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {gameLabel}
                    </span>
                  </div>
                </div>
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
