"use client";

import type {
  MatchChoice,
  MatchDetailResponse,
  SetMatchChoiceInput,
} from "@board-game-organizer/schemas";
import {
  formatMatchDateTime,
  matchContactState,
  resolveApiUrl,
  useContacts,
  useMatchDetail,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Button, Card, Dropdown, Popover, Skeleton, Tabs, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarDays,
  Check,
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  Clock3,
  Crown,
  Ellipsis,
  Gamepad2,
  LogOut,
  Medal,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
  Trophy,
  UserRoundX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ContactConfirmDialog } from "@/components/ContactConfirmDialog";
import { GameCatalogMetadata } from "@/components/GameCatalogMetadata";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { MatchResultsEditor } from "@/components/MatchResultsEditor";
import { MatchStandingIdentity } from "@/components/MatchStandingIdentity";
import { MatchWizard } from "@/components/MatchWizard";
import { type UserActionKey, UserMenu } from "@/components/UserMenu";
import { VoteCounts, VoteLegend } from "@/components/VoteCounts";
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
const choiceIcons = {
  UNKNOWN: CircleQuestionMark,
  YES: CircleCheck,
  NO: CircleX,
  IF_NEEDED: CircleAlert,
} as const;

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
  const ChoiceIcon = choiceIcons[choice];
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
        className={`button button--icon-only button--sm button--outline shrink-0 ${choiceColors[choice]}`}
      >
        <ChoiceIcon aria-hidden="true" className="h-4 w-4" />
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
  const { t, i18n } = useLingui();
  const router = useRouter();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "delete" | "leave" | "confirm" | "replan" | null
  >(null);
  const [showBlockedReason, setShowBlockedReason] = useState(false);
  const [removePlayerId, setRemovePlayerId] = useState<string | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchDetailResponse | null>(null);
  const [registeringMatch, setRegisteringMatch] = useState<MatchDetailResponse | null>(null);

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
  const contacts = useContacts(
    apiUrl(),
    token,
    getToken,
    protectionBypass(),
    userId,
    mutationFeedback,
  );

  // Keep drafts mounted when a background refetch or token rotation changes query state.
  if (
    registeringMatch?.match.id === matchId &&
    isSignedIn &&
    registeringMatch.match.adminUserId === userId
  ) {
    return (
      <MatchResultsEditor
        data={registeringMatch}
        busy={matches.registerResults.isPending}
        onBack={() => setRegisteringMatch(null)}
        onSubmit={(input) =>
          matches.registerResults.mutate(input, { onSuccess: () => setRegisteringMatch(null) })
        }
      />
    );
  }
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
  const canChoose =
    match.status === "PLANNING" && (isAdmin || ownInvitation?.status === "ACCEPTED");
  const choose = (input: SetMatchChoiceInput) => matches.setChoice.mutate(input);
  const participants = [
    { ...administrator, status: "ACCEPTED" as const, isAdministrator: true as const },
    ...invitedPlayers.map((player) => ({
      ...player,
      status: player.invitation.status,
      isAdministrator: false as const,
    })),
  ];
  const actionBusy =
    matches.deleteMatch.isPending ||
    matches.leaveMatch.isPending ||
    matches.setStatus.isPending ||
    matches.registerResults.isPending ||
    matches.removePlayer.isPending;
  const socialQueries = [
    contacts.following,
    contacts.followers,
    contacts.friends,
    contacts.pending,
    contacts.sent,
    contacts.blocked,
  ];
  const socialBusy =
    !socialQueries.every((query) => query.isSuccess) ||
    [
      contacts.follow,
      contacts.unfollow,
      contacts.unfriend,
      contacts.friendRequest,
      contacts.cancelFriendRequest,
      contacts.acceptFriendRequest,
      contacts.rejectFriendRequest,
      contacts.block,
      contacts.unblock,
    ].some((mutation) => mutation.isPending);
  const socialLists = {
    following: contacts.following.data,
    followers: contacts.followers.data,
    friends: contacts.friends.data,
    pending: contacts.pending.data,
    sent: contacts.sent.data,
    blocked: contacts.blocked.data,
  };
  const socialAction = (player: typeof administrator, key: UserActionKey) => {
    if (key === "profile") return;
    const targetUser = matchContactState(player, socialLists).user;
    const mutation = {
      follow: contacts.follow,
      unfollow: contacts.unfollow,
      unfriend: contacts.unfriend,
      friend_request: contacts.friendRequest,
      cancel_friend_request: contacts.cancelFriendRequest,
      accept_friend_request: contacts.acceptFriendRequest,
      reject_friend_request: contacts.rejectFriendRequest,
      block: contacts.block,
      unblock: contacts.unblock,
    }[key];
    mutation?.mutate({ targetUserId: player.id, targetUser });
  };
  const socialMenu = (player: typeof administrator, showDisabledForSelf = false) => {
    if (player.id === userId)
      return showDisabledForSelf ? (
        <Button isIconOnly size="sm" variant="ghost" isDisabled aria-label={t`Actions`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      ) : null;
    const state = matchContactState(player, socialLists);
    return (
      <UserMenu
        user={state.user}
        busy={socialBusy}
        canSendFriendRequest={state.canSendFriendRequest}
        friendRequest={state.friendRequest}
        matchContext
        onAction={(key) => socialAction(player, key)}
      />
    );
  };
  const summary = matchData.voteSummary;
  const reasons = summary?.reasons.map((reason) =>
    reason === "NOT_ENOUGH_PLAYERS"
      ? t`Not enough accepted players`
      : reason === "NO_SHARED_DATE"
        ? t`No shared date`
        : t`No shared game`,
  ) ?? [t`Match readiness unavailable`];
  const canConfirm =
    match.status === "PLANNING" &&
    summary?.reasons.length === 0 &&
    Boolean(summary.selectedDate) &&
    Boolean(summary.selectedGameId);
  const chosenGame =
    games.find((game) => game.id === summary?.selectedGameId)?.name ??
    String(summary?.selectedGameId ?? "");
  const chosenDate = summary?.selectedDate
    ? Object.values(formatMatchDateTime(summary.selectedDate, i18n.locale)).join(" · ")
    : "";
  const winnerNames = match.results?.entries
    .filter((entry) => entry.rank === 1)
    .map((entry) => participants.find((player) => player.id === entry.userId)?.name ?? entry.userId)
    .join(", ");

  const finishAction = () => {
    setConfirmAction(null);
    router.replace("/matches");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex flex-row-reverse items-center justify-between gap-3">
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            {match.status === "CREATED" ? (
              <Button
                size="sm"
                isDisabled={actionBusy}
                onPress={() => setRegisteringMatch(matchData)}
              >
                <Trophy className="h-4 w-4" />
                {t`Register results`}
              </Button>
            ) : match.status === "PLANNING" && !canConfirm ? (
              <Tooltip delay={0} isOpen={showBlockedReason}>
                <Tooltip.Trigger
                  onFocus={() => setShowBlockedReason(true)}
                  onBlur={() => setShowBlockedReason(false)}
                  onMouseEnter={() => setShowBlockedReason(true)}
                  onMouseLeave={() => setShowBlockedReason(false)}
                  aria-disabled="true"
                  aria-description={reasons.join(" · ")}
                  className="button button--sm button--outline cursor-not-allowed opacity-50"
                >
                  <CalendarCheck2 className="h-4 w-4" />
                  {t`Confirm match`}
                </Tooltip.Trigger>
                <Tooltip.Content>{reasons.join(" · ")}</Tooltip.Content>
              </Tooltip>
            ) : match.status === "PLANNING" ? (
              <Button
                size="sm"
                variant="outline"
                isDisabled={actionBusy || matches.setChoice.isPending}
                onPress={() => setConfirmAction("confirm")}
              >
                <CalendarCheck2 className="h-4 w-4" />
                {t`Confirm match`}
              </Button>
            ) : null}
            {match.status !== "TERMINATED" && (
              <Popover isOpen={moreActionsOpen} onOpenChange={setMoreActionsOpen}>
                <Popover.Trigger
                  aria-label={t`More match actions`}
                  className="button button--icon-only button--sm button--outline"
                >
                  <Ellipsis className="h-4 w-4" />
                </Popover.Trigger>
                <Popover.Content placement="bottom end" className="w-56">
                  <Popover.Dialog className="flex flex-col gap-3 p-2">
                    {match.status === "CREATED" && (
                      <div className="flex items-center gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="outline"
                          aria-label={t`Back to planning`}
                          onPress={() => {
                            setMoreActionsOpen(false);
                            setConfirmAction("replan");
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">{t`Back to planning`}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="danger-soft"
                        aria-label={t`Delete match`}
                        onPress={() => {
                          setMoreActionsOpen(false);
                          setConfirmAction("delete");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-danger">{t`Delete match`}</span>
                    </div>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            )}
          </div>
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
        <Card className="relative min-h-14 rounded-xl p-3 pr-24">
          <p className="text-sm font-medium">{t`Your invitation is waiting for a response.`}</p>
          <div className="absolute right-2 bottom-2 flex gap-1">
            <Button
              isIconOnly
              size="sm"
              className="h-8 min-h-8 w-8 min-w-8"
              aria-label={t`Decline`}
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
            </Button>
            <Button
              isIconOnly
              size="sm"
              className="h-8 min-h-8 w-8 min-w-8"
              aria-label={t`Accept`}
              isDisabled={matches.respondInvitation.isPending}
              onPress={() =>
                matches.respondInvitation.mutate({
                  invitationId: ownInvitation.id,
                  decision: "accept",
                })
              }
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {matches.respondInvitation.isError && (
        <p className="text-sm text-danger">{t`Could not update the invitation`}</p>
      )}

      {socialQueries.some((query) => query.isError) && (
        <p className="text-sm text-danger">
          {t`Could not load social actions`}{" "}
          <Button
            size="sm"
            variant="ghost"
            onPress={() => void contacts.refreshContacts()}
          >{t`Retry`}</Button>
        </p>
      )}
      <Tabs aria-label={t`Match details`} defaultSelectedKey="overview">
        <Tabs.ListContainer>
          <Tabs.List>
            <Tabs.Tab id="overview">
              {t`Overview`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id={match.status === "TERMINATED" ? "standings" : "players"}>
              {match.status === "TERMINATED" ? t`Standings` : t`Players`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="games">
              {t`Games`}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="overview">
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">{match.name}</h1>
            <div>
              <div className="mb-2 flex items-center gap-1">
                <h2 className="text-sm font-semibold">
                  {match.status !== "PLANNING" ? t`Confirmed date` : t`Date selection`}
                </h2>
                {match.status === "PLANNING" && summary && <VoteLegend />}
              </div>
              <GroupedList className="text-sm text-default-600">
                {(match.status !== "PLANNING" && match.selectedDate
                  ? [match.selectedDate]
                  : match.dates
                ).map((date) => (
                  <GroupedRow key={date} className="flex-wrap">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <time dateTime={date}>{formatMatchDateTime(date, i18n.locale).date}</time>
                      <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <time dateTime={date}>{formatMatchDateTime(date, i18n.locale).time}</time>
                    </div>
                    {canChoose && (
                      <ChoiceDropdown
                        label={t`Choose date`}
                        choice={matchData.choices?.dates?.[String(Date.parse(date))] ?? "UNKNOWN"}
                        pending={matches.setChoice.isPending}
                        onChoose={(choice) => choose({ kind: "dates", itemId: date, choice })}
                      />
                    )}
                    {match.status === "PLANNING" && summary?.dates[String(Date.parse(date))] && (
                      <VoteCounts counts={summary.dates[String(Date.parse(date))]} />
                    )}
                  </GroupedRow>
                ))}
              </GroupedList>
            </div>
          </div>
        </Tabs.Panel>

        {match.status !== "TERMINATED" && (
          <Tabs.Panel id="players">
            <div className="space-y-5">
              {match.status === "PLANNING" && (
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
              )}
              <div>
                <h2 className="mb-2 text-sm font-semibold">{t`Participants`}</h2>
                <GroupedList>
                  {participants.map((player) => (
                    <GroupedRow key={player.id}>
                      <div className="relative shrink-0">
                        <Avatar size="md" color="accent">
                          <Avatar.Image src={player.avatarUrl ?? undefined} alt={player.name} />
                          <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
                        </Avatar>
                        <span
                          className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5"
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
                            <Clock3 className="h-4 w-4 text-warning" />
                          ) : player.status === "ACCEPTED" ? (
                            <CircleCheck className="h-4 w-4 text-success" />
                          ) : (
                            <CircleX className="h-4 w-4 text-danger" />
                          )}
                        </span>
                      </div>
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
                      {isAdmin && match.status === "PLANNING" && !player.isAdministrator && (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="danger-soft"
                          isDisabled={actionBusy}
                          aria-label={`${t`Remove player`}: ${player.name}`}
                          onPress={() => setRemovePlayerId(player.invitation.id)}
                        >
                          <UserRoundX className="h-4 w-4" />
                        </Button>
                      )}
                      {socialMenu(player)}
                    </GroupedRow>
                  ))}
                </GroupedList>
              </div>
            </div>
          </Tabs.Panel>
        )}

        <Tabs.Panel id="games">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <h2 className="text-sm font-semibold">
                {match.status !== "PLANNING" ? t`Confirmed game` : t`Game selection`}
              </h2>
              {match.status === "PLANNING" && summary && <VoteLegend />}
            </div>
            {games.length === 0 ? (
              <p className="text-sm text-default-500">{t`No selected games`}</p>
            ) : (
              <GroupedList>
                {games
                  .filter((game) => match.status === "PLANNING" || game.id === match.selectedGameId)
                  .map((game) => (
                    <GroupedRow key={game.id} className="flex-wrap">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100">
                        {game.thumbnail ? (
                          // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
                          <img src={game.thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Gamepad2 className="h-5 w-5 text-default-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="max-w-[40ch] truncate text-sm font-medium" title={game.name}>
                          {game.name}
                        </p>
                        <GameCatalogMetadata
                          year={game.yearPublished}
                          average={game.average}
                          rank={game.rank}
                        />
                      </div>
                      {match.status === "TERMINATED" && winnerNames && (
                        <span className="inline-flex min-w-0 items-center gap-1 text-sm">
                          <Medal className="h-4 w-4 shrink-0 text-warning" aria-label={t`Winner`} />
                          <strong className="truncate">{winnerNames}</strong>
                        </span>
                      )}
                      {canChoose && (
                        <ChoiceDropdown
                          label={t`Choose game`}
                          choice={matchData.choices?.games?.[String(game.id)] ?? "UNKNOWN"}
                          pending={matches.setChoice.isPending}
                          onChoose={(choice) => choose({ kind: "games", itemId: game.id, choice })}
                        />
                      )}
                      {match.status === "PLANNING" && summary?.games[String(game.id)] && (
                        <VoteCounts counts={summary.games[String(game.id)]} />
                      )}
                    </GroupedRow>
                  ))}
              </GroupedList>
            )}
          </div>
        </Tabs.Panel>
        {match.status === "TERMINATED" && match.results && (
          <Tabs.Panel id="standings">
            <div className="space-y-3">
              <p className="text-sm text-default-500">
                {match.results.lowerWins ? t`Lowest score wins` : t`Highest score wins`}
              </p>
              <GroupedList>
                {match.results.entries.map((entry) => {
                  const player = participants.find((item) => item.id === entry.userId);
                  return (
                    <GroupedRow key={entry.userId}>
                      {player && <MatchStandingIdentity player={player} rank={entry.rank} />}
                      <span className="shrink-0 font-semibold">{entry.score ?? "ND"}</span>
                      {player && socialMenu(player, true)}
                    </GroupedRow>
                  );
                })}
              </GroupedList>
            </div>
          </Tabs.Panel>
        )}
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

      {removePlayerId && isAdmin && match.status === "PLANNING" && (
        <ContactConfirmDialog
          title={t`Remove player?`}
          description={t`This removes the invitation and the player from this match. Blocking or removing a friend alone does not remove them.`}
          busy={matches.removePlayer.isPending}
          actions={[
            {
              label: t`Remove player`,
              variant: "danger",
              onPress: () =>
                matches.removePlayer.mutate(removePlayerId, {
                  onSuccess: () => setRemovePlayerId(null),
                }),
            },
          ]}
          onCancel={() => {
            if (!matches.removePlayer.isPending) setRemovePlayerId(null);
          }}
        />
      )}
      {confirmAction && (
        <ContactConfirmDialog
          title={
            confirmAction === "confirm"
              ? t`Confirm match?`
              : confirmAction === "replan"
                ? t`Back to planning?`
                : confirmAction === "delete"
                  ? t`Delete match?`
                  : t`Leave match?`
          }
          description={
            confirmAction === "confirm"
              ? i18n._("match.confirm.summary", { date: chosenDate, game: chosenGame })
              : confirmAction === "replan"
                ? t`Reopen planning? Pending invitees will regain access and accepted players will be notified.`
                : confirmAction === "delete"
                  ? t`This deletes the match and all invitations. This action cannot be undone.`
                  : t`You will leave this match. The administrator can invite you again.`
          }
          busy={actionBusy}
          actions={[
            {
              label:
                confirmAction === "confirm"
                  ? t`Confirm match`
                  : confirmAction === "replan"
                    ? t`Back to planning`
                    : confirmAction === "delete"
                      ? t`Delete match`
                      : t`Leave match`,
              variant:
                confirmAction === "delete" || confirmAction === "leave" ? "danger" : "primary",
              onPress: () => {
                if (confirmAction === "confirm" && canConfirm) {
                  matches.setStatus.mutate("CREATED", { onSuccess: () => setConfirmAction(null) });
                } else if (confirmAction === "replan") {
                  matches.setStatus.mutate("PLANNING", { onSuccess: () => setConfirmAction(null) });
                } else if (confirmAction === "delete") {
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
