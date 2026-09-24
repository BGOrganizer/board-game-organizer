"use client";

import type {
  MatchChoice,
  MatchDetailResponse,
  SetMatchChoiceInput,
} from "@board-game-organizer/schemas";
import { resolveApiUrl, useMatchDetail } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Button, Card, Dropdown, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  Crown,
  Gamepad2,
  LogOut,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { MatchWizard } from "@/components/MatchWizard";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

const choiceValues = ["UNKNOWN", "YES", "NO", "IF_NEEDED"] as const;
const choiceColors: Record<MatchChoice, string> = {
  UNKNOWN: "text-default-500",
  YES: "text-success",
  NO: "text-danger",
  IF_NEEDED: "text-warning",
};

function ChoiceDropdown({
  label,
  choice,
  pending,
  onChoose,
}: {
  label: string;
  choice: MatchChoice;
  pending: boolean;
  onChoose: (choice: MatchChoice) => void;
}) {
  const { t } = useLingui();
  const labels: Record<MatchChoice, string> = {
    UNKNOWN: t`Not known`,
    YES: t`Yes`,
    NO: t`No`,
    IF_NEEDED: t`If I have to`,
  };
  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={`${label}: ${labels[choice]}`}
        className={`button button--icon-only button--sm button--ghost shrink-0 ${choiceColors[choice]}`}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ●
        </span>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label={label}
          selectionMode="single"
          selectedKeys={new Set([choice])}
          disabledKeys={pending ? choiceValues : []}
        >
          {choiceValues.map((value) => (
            <Dropdown.Item
              key={value}
              id={value}
              textValue={labels[value]}
              onAction={() => onChoose(value)}
            >
              <span
                className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-current ${choiceColors[value]}`}
                aria-hidden="true"
              >
                {choice === value && <span className="size-2 rounded-full bg-current" />}
              </span>
              <span className={choiceColors[value]}>{labels[value]}</span>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function MatchDetail({ matchId }: { matchId: string }) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { t } = useLingui();
  const router = useRouter();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"delete" | "leave" | null>(null);
  const [editingMatch, setEditingMatch] = useState<MatchDetailResponse | null>(null);

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

  const matches = useMatchDetail({
    apiUrl: apiUrl(),
    token,
    getToken,
    protectionBypass: protectionBypass(),
    userId,
    feedback: mutationFeedback,
    matchId,
  });

  // Keep the draft mounted when a background refetch or token rotation changes query state.
  if (
    editingMatch?.match.id === matchId &&
    isSignedIn &&
    editingMatch.match.adminUserId === userId
  ) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 pb-24">
        <Button variant="ghost" onPress={() => setEditingMatch(null)}>
          <ArrowLeft className="h-4 w-4" />
          {t`Back to match`}
        </Button>
        <MatchWizard initialData={editingMatch} onCreated={() => setEditingMatch(null)} />
      </div>
    );
  }

  if (matches.detail.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-6 w-32 rounded-lg" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (matches.detail.isError || !matches.detail.data) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Link href="/matches" className="inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft className="h-4 w-4" />
          {t`Back to matches`}
        </Link>
        <p className="text-sm text-danger">{t`Could not load match details`}</p>
      </div>
    );
  }

  const matchData = matches.detail.data;
  const { match, administrator, invitedPlayers, games } = matchData;
  const ownInvitation = match.invitations.find((invitation) => invitation.inviteeUserId === userId);
  const isAdmin = match.adminUserId === userId;
  const canLeave = match.status === "PLANNING" && ownInvitation?.status === "ACCEPTED";
  const canChoose = isAdmin || ownInvitation?.status === "ACCEPTED";
  const choose = (input: SetMatchChoiceInput) => matches.setChoice.mutate(input);
  const participants = [
    { ...administrator, status: "ACCEPTED" as const, isAdministrator: true },
    ...invitedPlayers.map((player) => ({
      ...player,
      status: player.invitation.status,
      isAdministrator: false,
    })),
  ];
  const actionBusy = matches.deleteMatch.isPending || matches.leaveMatch.isPending;

  const finishAction = () => {
    setConfirmAction(null);
    router.replace("/matches");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex flex-row-reverse items-center justify-between gap-3">
        {isAdmin ? (
          <Button
            size="sm"
            variant="danger"
            aria-label={t`Delete match`}
            onPress={() => setConfirmAction("delete")}
          >
            <Trash2 className="h-4 w-4" />
            {t`Delete match`}
          </Button>
        ) : canLeave ? (
          <Button
            size="sm"
            variant="danger"
            aria-label={t`Leave match`}
            onPress={() => setConfirmAction("leave")}
          >
            <LogOut className="h-4 w-4" />
            {t`Leave match`}
          </Button>
        ) : null}
        <Link href="/matches" className="inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft className="h-4 w-4" />
          {t`Back to matches`}
        </Link>
      </div>

      {ownInvitation?.status === "PENDING" && (
        <Card className="flex flex-col items-start justify-between gap-3 rounded-xl p-4 sm:flex-row sm:items-center">
          <p className="text-sm font-medium">{t`Your invitation is waiting for a response.`}</p>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              isDisabled={matches.respondInvitation.isPending}
              onPress={() =>
                matches.respondInvitation.mutate({
                  invitationId: ownInvitation.id,
                  decision: "decline",
                })
              }
            >
              <X className="h-4 w-4" />
              {t`Decline`}
            </Button>
            <Button
              size="sm"
              isDisabled={matches.respondInvitation.isPending}
              onPress={() =>
                matches.respondInvitation.mutate({
                  invitationId: ownInvitation.id,
                  decision: "accept",
                })
              }
            >
              <Check className="h-4 w-4" />
              {t`Accept`}
            </Button>
          </div>
        </Card>
      )}

      {matches.respondInvitation.isError && (
        <p className="text-sm text-danger">{t`Could not update the invitation`}</p>
      )}

      <Tabs aria-label={t`Match details`} defaultSelectedKey="overview">
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="overview">
              {t`Overview`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="players">
              {t`Players`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="games">
              {t`Games`}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="overview">
          <Card className="space-y-4 rounded-xl p-5">
            <h1 className="text-xl font-semibold">{match.name}</h1>
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t`Possible dates`}</h2>
              <ul className="space-y-2 text-sm text-default-600">
                {match.dates.map((date) => (
                  <li key={date} className="flex items-center justify-between gap-2">
                    <time dateTime={date}>{new Date(date).toLocaleString()}</time>
                    {canChoose && (
                      <ChoiceDropdown
                        label={t`Choose date`}
                        choice={matchData.choices?.dates?.[String(Date.parse(date))] ?? "UNKNOWN"}
                        pending={matches.setChoice.isPending}
                        onChoose={(choice) => choose({ kind: "dates", itemId: date, choice })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel id="players">
          <Card className="space-y-5 rounded-xl p-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-default-500">{t`Minimum players`}</p>
                <p className="font-semibold">{match.minPlayers}</p>
              </div>
              <div>
                <p className="text-default-500">{t`Maximum players`}</p>
                <p className="font-semibold">{match.maxPlayers}</p>
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t`Participants`}</h2>
              <ul className="space-y-1">
                {participants.map((player) => (
                  <li key={player.id} className="py-1">
                    <Card className="flex min-w-0 flex-row items-center gap-3 p-3">
                      <Avatar size="md" color="accent">
                        <Avatar.Image src={player.avatarUrl ?? undefined} alt={player.name} />
                        <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-medium">{player.name}</p>
                          {player.isAdministrator ? (
                            <Crown
                              className="h-4 w-4 shrink-0 text-warning"
                              aria-label={t`Administrator`}
                            />
                          ) : null}
                        </div>
                        {player.email ? (
                          <p className="truncate text-sm text-default-500">{player.email}</p>
                        ) : null}
                      </div>
                      <span
                        role="img"
                        aria-label={
                          player.status === "PENDING"
                            ? t`Pending`
                            : player.status === "ACCEPTED"
                              ? t`Accepted`
                              : t`Declined`
                        }
                      >
                        {player.status === "PENDING" ? (
                          <Clock3 className="h-5 w-5 text-warning" />
                        ) : player.status === "ACCEPTED" ? (
                          <CircleCheck className="h-5 w-5 text-success" />
                        ) : (
                          <CircleX className="h-5 w-5 text-danger" />
                        )}
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel id="games">
          <Card className="rounded-xl p-5">
            {games.length === 0 ? (
              <p className="text-sm text-default-500">{t`No selected games`}</p>
            ) : (
              <ul className="divide-y divide-default-200">
                {games.map((game) => (
                  <li key={game.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100">
                      {game.thumbnail ? (
                        // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
                        <img src={game.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Gamepad2 className="h-5 w-5 text-default-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{game.name}</p>
                      {game.yearPublished ? (
                        <p className="text-xs text-default-500">{game.yearPublished}</p>
                      ) : null}
                    </div>
                    {canChoose && (
                      <ChoiceDropdown
                        label={t`Choose game`}
                        choice={matchData.choices?.games?.[String(game.id)] ?? "UNKNOWN"}
                        pending={matches.setChoice.isPending}
                        onChoose={(choice) => choose({ kind: "games", itemId: game.id, choice })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>

      {isAdmin && match.status === "PLANNING" ? (
        <Button
          isIconOnly
          aria-label={t`Edit match`}
          className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg sm:right-6 sm:bottom-6 sm:h-14 sm:w-14"
          onPress={() => setEditingMatch(matchData)}
        >
          <Pencil className="h-6 w-6" />
        </Button>
      ) : null}

      {confirmAction && (
        <ContactConfirmDialog
          title={confirmAction === "delete" ? t`Delete match?` : t`Leave match?`}
          description={
            confirmAction === "delete"
              ? t`This deletes the match and all invitations. This action cannot be undone.`
              : t`You will leave this match. The administrator can invite you again.`
          }
          busy={actionBusy}
          actions={[
            {
              label: confirmAction === "delete" ? t`Delete match` : t`Leave match`,
              variant: "danger",
              onPress: () => {
                if (confirmAction === "delete") {
                  matches.deleteMatch.mutate(match.id, { onSuccess: finishAction });
                } else if (ownInvitation) {
                  matches.leaveMatch.mutate(ownInvitation.id, { onSuccess: finishAction });
                }
              },
            },
          ]}
          onCancel={() => {
            if (!actionBusy) setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}
