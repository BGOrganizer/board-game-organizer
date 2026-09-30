import type { MatchChoice, MatchDetailResponse } from "@board-game-organizer/schemas";
import {
  formatMatchDateTime,
  matchContactState,
  resolveApiUrl,
  useContacts,
  useMatchDetail,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Popover } from "heroui-native/popover";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import {
  CalendarCheck2,
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock3,
  Crown,
  Ellipsis,
  Gamepad2,
  LogOut,
  Medal,
  Minus,
  Pencil,
  RotateCcw,
  Trash2,
  Trophy,
  UserRoundX,
  UsersRound,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyList } from "@/components/EmptyList";
import { GameCatalogMetadata } from "@/components/GameCatalogMetadata";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { InvitationActions } from "@/components/InvitationActions";
import { GameRating, MatchStandingIdentity } from "@/components/MatchStandingIdentity";
import { UserActionsSheet } from "@/components/UserActionsSheet";
import { VoteCounts, VoteLegend } from "@/components/VoteCounts";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import type { UserActionKey } from "@/lib/user-actions";
import { useSessionAuth } from "@/lib/useSessionAuth";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

const choiceValues = ["UNKNOWN", "YES", "NO", "IF_NEEDED"] as const;
const choiceColors: Record<MatchChoice, string> = {
  UNKNOWN: "text-muted",
  YES: "text-success",
  NO: "text-danger",
  IF_NEEDED: "text-warning",
};
const choiceIcons = {
  UNKNOWN: Minus,
  YES: CircleCheck,
  NO: CircleX,
} as const;

function ChoiceIcon({ choice, color }: { choice: MatchChoice; color: string }) {
  if (choice === "IF_NEEDED")
    return (
      <Typography style={{ color, fontSize: 22, fontWeight: "700", lineHeight: 22 }}>~</Typography>
    );
  const Icon = choiceIcons[choice];
  return <Icon size={18} color={color} />;
}
const choiceBorders: Record<MatchChoice, string> = {
  UNKNOWN: "border-muted",
  YES: "border-success",
  NO: "border-danger",
  IF_NEEDED: "border-warning",
};
const choiceBackgrounds: Record<MatchChoice, string> = {
  UNKNOWN: "bg-muted",
  YES: "bg-success",
  NO: "bg-danger",
  IF_NEEDED: "bg-warning",
};

function choiceLabel(choice: MatchChoice, t: ReturnType<typeof useT>): string {
  if (choice === "YES") return t("Yes");
  if (choice === "NO") return t("No");
  if (choice === "IF_NEEDED") return t("If I have to");
  return t("Not known");
}

type ActiveChoice =
  | { kind: "dates"; itemId: string; title: string }
  | { kind: "games"; itemId: number; title: string };

export default function MatchDetailScreen() {
  const { matchId: matchIdParam, tab } = useLocalSearchParams<{
    matchId: string | string[];
    tab?: string;
  }>();
  const matchId = Array.isArray(matchIdParam) ? matchIdParam[0] : matchIdParam;
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const router = useRouter();
  const t = useT();
  const { i18n } = useLingui();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(tab === "standings" ? "standings" : "overview");
  const [activeChoice, setActiveChoice] = useState<ActiveChoice | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);

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
    userId,
    feedback: mutationFeedback,
    matchId: matchId ?? "",
  });
  const contacts = useContacts(apiUrl(), token, getToken, undefined, userId, mutationFeedback);
  const match = matches.detail.data?.match;
  const ownInvitation = match?.invitations.find(
    (invitation) => invitation.inviteeUserId === userId,
  );
  const matchAction =
    match?.adminUserId === userId && match?.status !== "TERMINATED"
      ? "delete"
      : match?.status === "PLANNING" && ownInvitation?.status === "ACCEPTED"
        ? "leave"
        : null;
  const matchActionPending =
    matches.deleteMatch.isPending || matches.leaveMatch.isPending || matches.removePlayer.isPending;
  const summary = matches.detail.data?.voteSummary;
  const statusUnavailable =
    match?.status === "PLANNING" &&
    (summary?.reasons.length !== 0 || !summary.selectedDate || !summary.selectedGameId);
  const statusReason =
    summary?.reasons
      .map((reason) =>
        reason === "NOT_ENOUGH_PLAYERS"
          ? t("Not enough accepted players")
          : reason === "NO_SHARED_DATE"
            ? t("No shared date")
            : t("No shared game"),
      )
      .join(" · ") || t("Match readiness unavailable");
  const editableMatch =
    match?.adminUserId === userId && match?.status === "PLANNING" ? match : null;
  const confirmStatusAction = () => {
    if (
      !match ||
      match.adminUserId !== userId ||
      statusUnavailable ||
      matches.setStatus.isPending ||
      matches.setChoice.isPending
    )
      return;
    const creating = match.status === "PLANNING";
    const date = summary?.selectedDate
      ? Object.values(formatMatchDateTime(summary.selectedDate, i18n.locale)).join(" · ")
      : "";
    const game =
      matches.detail.data?.games.find((item) => item.id === summary?.selectedGameId)?.name ??
      String(summary?.selectedGameId ?? "");
    Alert.alert(
      creating ? t("Confirm match?") : t("Back to planning?"),
      creating
        ? `${t("Confirm match with")} ${date} · ${game}?`
        : t(
            "Reopen planning? Pending invitees will regain access and accepted players will be notified.",
          ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: creating ? t("Confirm match") : t("Back to planning"),
          onPress: () => matches.setStatus.mutate(creating ? "CREATED" : "PLANNING"),
        },
      ],
    );
  };
  const confirmMatchAction = () => {
    if (!matchAction) return;
    const deleting = matchAction === "delete";
    Alert.alert(
      deleting ? t("Delete match?") : t("Leave match?"),
      deleting
        ? t("This deletes the match and all invitations. This action cannot be undone.")
        : t("You will leave this match. The administrator can invite you again."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: deleting ? t("Delete match") : t("Leave match"),
          style: "destructive",
          onPress: () => {
            if (deleting) {
              if (!matchId) return;
              matches.deleteMatch.mutate(matchId, {
                onSuccess: () => router.replace("/matches"),
              });
            } else if (ownInvitation) {
              matches.leaveMatch.mutate(ownInvitation.id, {
                onSuccess: () => router.replace("/matches"),
              });
            }
          },
        },
      ],
    );
  };

  const confirmRemovePlayer = (invitationId: string) => {
    if (
      !match ||
      match.adminUserId !== userId ||
      match.status !== "PLANNING" ||
      matches.removePlayer.isPending
    )
      return;
    Alert.alert(
      t("Remove player?"),
      t(
        "This removes the invitation and the player from this match. Blocking or removing a friend alone does not remove them.",
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Remove player"),
          style: "destructive",
          onPress: () => matches.removePlayer.mutate(invitationId),
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t("Match details"),
          headerRight: matchAction
            ? () => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {match?.adminUserId === userId &&
                    match?.status !== "TERMINATED" &&
                    (match?.status === "CREATED" ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="outline"
                        accessibilityLabel={t("Register results")}
                        testID="open-match-results"
                        style={{ minHeight: 44, minWidth: 44 }}
                        onPress={() =>
                          router.push({ pathname: "/match/results", params: { matchId } })
                        }
                      >
                        <Trophy size={18} color="#17c964" />
                      </Button>
                    ) : statusUnavailable ? (
                      <Popover>
                        <Popover.Trigger asChild>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="outline"
                            className="opacity-50"
                            accessibilityLabel={t("Confirm match")}
                            accessibilityHint={statusReason}
                            accessibilityState={{ disabled: true }}
                            style={{ minHeight: 44, minWidth: 44 }}
                            testID="confirm-match-unavailable"
                          >
                            <CalendarCheck2 size={18} color="#737373" />
                          </Button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Overlay />
                          <Popover.Content
                            presentation="popover"
                            placement="bottom"
                            align="end"
                            width={260}
                          >
                            <Popover.Title>{t("Cannot confirm match")}</Popover.Title>
                            <Popover.Description>{statusReason}</Popover.Description>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover>
                    ) : (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="outline"
                        isDisabled={matches.setStatus.isPending || matches.setChoice.isPending}
                        accessibilityLabel={t("Confirm match")}
                        style={{ minHeight: 44, minWidth: 44 }}
                        testID="change-match-status"
                        onPress={confirmStatusAction}
                      >
                        <CalendarCheck2 size={18} color="#17c964" />
                      </Button>
                    ))}
                  {matchAction === "delete" ? (
                    <Popover isOpen={moreActionsOpen} onOpenChange={setMoreActionsOpen}>
                      <Popover.Trigger asChild>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="outline"
                          accessibilityLabel={t("More match actions")}
                          testID="more-match-actions"
                          style={{ minHeight: 44, minWidth: 44 }}
                        >
                          <Ellipsis size={18} color="#737373" />
                        </Button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Overlay />
                        <Popover.Content
                          presentation="popover"
                          placement="bottom"
                          align="end"
                          width={230}
                          style={{ gap: 12, padding: 8 }}
                        >
                          {match?.status === "CREATED" && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="outline"
                                accessibilityLabel={t("Back to planning")}
                                testID="replan-match-action"
                                style={{ minWidth: 44, minHeight: 44 }}
                                onPress={() => {
                                  setMoreActionsOpen(false);
                                  confirmStatusAction();
                                }}
                              >
                                <RotateCcw size={17} color="#737373" />
                              </Button>
                              <Typography className="text-sm text-foreground">
                                {t("Back to planning")}
                              </Typography>
                            </View>
                          )}
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="danger-soft"
                              accessibilityLabel={t("Delete match")}
                              testID="delete-match-action"
                              style={{ minWidth: 44, minHeight: 44 }}
                              onPress={() => {
                                setMoreActionsOpen(false);
                                confirmMatchAction();
                              }}
                            >
                              <Trash2 size={17} color="#f31260" />
                            </Button>
                            <Typography className="text-sm text-danger">
                              {t("Delete match")}
                            </Typography>
                          </View>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover>
                  ) : (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      isDisabled={matchActionPending}
                      accessibilityLabel={t("Leave match")}
                      onPress={confirmMatchAction}
                      style={{ minHeight: 44, minWidth: 44 }}
                    >
                      <LogOut size={17} color="#f31260" />
                    </Button>
                  )}
                </View>
              )
            : undefined,
        }}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {matches.detail.isPending && (
          <View style={{ gap: 12, width: "100%" }}>
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
        )}

        {matches.detail.isError && (
          <Typography className="text-sm text-danger">
            {t("Could not load match details")}
          </Typography>
        )}

        {matches.detail.data && (
          <MatchDetailContent
            data={matches.detail.data}
            userId={userId}
            contacts={contacts}
            removePlayer={confirmRemovePlayer}
            isRemoving={matches.removePlayer.isPending}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isResponding={matches.respondInvitation.isPending}
            responseError={matches.respondInvitation.isError}
            choicePending={matches.setChoice.isPending}
            openChoice={setActiveChoice}
            respond={(invitationId, decision) =>
              matches.respondInvitation.mutate(
                { invitationId, decision },
                {
                  onSuccess: () => {
                    if (decision === "decline") router.back();
                  },
                },
              )
            }
          />
        )}
      </ScrollView>
      <BottomSheet
        isOpen={activeChoice !== null}
        onOpenChange={(open) => {
          if (!open) setActiveChoice(null);
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <BottomSheet.Title>{activeChoice?.title ?? t("Choose preference")}</BottomSheet.Title>
            {choiceValues.map((choice) => {
              const label = choiceLabel(choice, t);
              const selected =
                activeChoice?.kind === "dates"
                  ? (matches.detail.data?.choices?.dates?.[
                      String(Date.parse(activeChoice.itemId))
                    ] ?? "UNKNOWN") === choice
                  : (matches.detail.data?.choices?.games?.[String(activeChoice?.itemId)] ??
                      "UNKNOWN") === choice;
              return (
                <Pressable
                  key={choice}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: selected, disabled: matches.setChoice.isPending }}
                  disabled={matches.setChoice.isPending}
                  onPress={() => {
                    if (activeChoice?.kind === "dates")
                      matches.setChoice.mutate({
                        kind: "dates",
                        itemId: activeChoice.itemId,
                        choice,
                      });
                    else if (activeChoice)
                      matches.setChoice.mutate({
                        kind: "games",
                        itemId: activeChoice.itemId,
                        choice,
                      });
                    setActiveChoice(null);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 14,
                  }}
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full border-2 ${choiceBorders[choice]}`}
                  >
                    {selected && (
                      <View className={`h-2.5 w-2.5 rounded-full ${choiceBackgrounds[choice]}`} />
                    )}
                  </View>
                  <Typography className={`text-base ${choiceColors[choice]}`}>{label}</Typography>
                </Pressable>
              );
            })}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
      {editableMatch ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Edit match")}
          onPress={() =>
            router.push({ pathname: "/match/wizard", params: { matchId: editableMatch.id } })
          }
          style={{
            position: "absolute",
            right: 20,
            bottom: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#006fee",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
            elevation: 6,
          }}
        >
          <Pencil color="#fff" size={24} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

function MatchDetailContent({
  data,
  userId,
  contacts,
  removePlayer,
  isRemoving,
  activeTab,
  setActiveTab,
  isResponding,
  responseError,
  choicePending,
  openChoice,
  respond,
}: {
  data: MatchDetailResponse;
  userId: string | null | undefined;
  contacts: ReturnType<typeof useContacts>;
  removePlayer: (invitationId: string) => void;
  isRemoving: boolean;
  activeTab: string;
  setActiveTab: (value: string) => void;
  isResponding: boolean;
  responseError: boolean;
  choicePending: boolean;
  openChoice: (choice: ActiveChoice) => void;
  respond: (invitationId: string, decision: "accept" | "decline") => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [muted, success, danger, warning] = useThemeColor([
    "muted",
    "success",
    "danger",
    "warning",
  ]);
  const iconColors: Record<MatchChoice, string> = {
    UNKNOWN: muted,
    YES: success,
    NO: danger,
    IF_NEEDED: warning,
  };
  const { match, administrator, invitedPlayers, games } = data;
  const ownInvitation = match.invitations.find((invitation) => invitation.inviteeUserId === userId);
  const canChoose =
    match.status === "PLANNING" &&
    (match.adminUserId === userId || ownInvitation?.status === "ACCEPTED");
  const participants = [
    { ...administrator, status: "ACCEPTED" as const, isAdministrator: true as const },
    ...invitedPlayers.map((player) => ({
      ...player,
      status: player.invitation.status,
      isAdministrator: false as const,
    })),
  ];
  const winnerNames = match.results?.entries
    .filter((entry) => entry.rank === 1)
    .map((entry) => participants.find((player) => player.id === entry.userId)?.name ?? entry.userId)
    .join(", ");
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
  const selectedPlayer = participants.find((player) => player.id === menuUserId);
  const selectedContact = selectedPlayer ? matchContactState(selectedPlayer, socialLists) : null;
  const socialAction = async (key: UserActionKey) => {
    if (!selectedContact || key === "profile") return;
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
    if (mutation)
      await mutation.mutateAsync({
        targetUserId: selectedContact.user.id,
        targetUser: selectedContact.user,
      });
  };
  const socialMenu = (player: typeof administrator, showDisabledForSelf = false) =>
    player.id === userId && !showDisabledForSelf ? null : (
      <Button
        isDisabled={player.id === userId}
        isIconOnly
        size="sm"
        variant="ghost"
        accessibilityLabel={`${t("Actions")}: ${player.name}`}
        testID={`match-player-actions-${player.id}`}
        style={{ minHeight: 44, minWidth: 44 }}
        onPress={() => setMenuUserId(player.id)}
      >
        <Ellipsis size={18} color={muted} />
      </Button>
    );

  return (
    <View style={{ gap: 16 }}>
      {ownInvitation?.status === "PENDING" && (
        <Card
          style={{
            padding: 12,
            paddingRight: 100,
            minHeight: 56,
            borderRadius: 12,
            position: "relative",
          }}
        >
          <Typography className="font-medium text-foreground">
            {t("Your invitation is waiting for a response.")}
          </Typography>
          <InvitationActions
            placement="detail"
            pending={isResponding}
            onDecline={() => respond(ownInvitation.id, "decline")}
            onAccept={() => respond(ownInvitation.id, "accept")}
          />
        </Card>
      )}

      {responseError && (
        <Typography className="text-sm text-danger">
          {t("Could not update the invitation")}
        </Typography>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} variant="primary">
        <Tabs.List>
          <Tabs.Indicator />
          <Tabs.Trigger value="overview" style={{ flex: 1 }}>
            <Tabs.Label>{t("Overview")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger
            value={match.status === "TERMINATED" ? "standings" : "players"}
            style={{ flex: 1 }}
            testID={match.status === "TERMINATED" ? "standings-tab" : undefined}
          >
            <Tabs.Label>{match.status === "TERMINATED" ? t("Standings") : t("Players")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="games" style={{ flex: 1 }}>
            <Tabs.Label>{t("Games")}</Tabs.Label>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" style={{ marginTop: 16 }}>
          <View style={{ gap: 12 }}>
            <Typography className="text-xl font-semibold text-foreground">{match.name}</Typography>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <CalendarDays size={18} color={muted} />
              <Typography accessibilityRole="header" className="font-semibold text-foreground">
                {match.status !== "PLANNING" ? t("Confirmed date") : t("Date selection")}
              </Typography>
              {match.status === "PLANNING" && data.voteSummary && <VoteLegend />}
            </View>
            <GroupedList>
              {(match.status !== "PLANNING" && match.selectedDate
                ? [match.selectedDate]
                : match.dates
              ).map((date) => {
                const choice = data.choices?.dates?.[String(Date.parse(date))] ?? "UNKNOWN";
                return (
                  <GroupedRow key={date}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <CalendarDays size={16} color={muted} />
                        <Typography className="text-sm text-foreground">
                          {formatMatchDateTime(date, i18n.locale).date}
                        </Typography>
                        <Clock3 size={16} color={muted} />
                        <Typography className="text-sm text-foreground">
                          {formatMatchDateTime(date, i18n.locale).time}
                        </Typography>
                      </View>
                      {match.status === "PLANNING" &&
                        data.voteSummary?.dates[String(Date.parse(date))] && (
                          <VoteCounts counts={data.voteSummary.dates[String(Date.parse(date))]} />
                        )}
                    </View>
                    {canChoose && (
                      <Button
                        variant="outline"
                        isIconOnly
                        size="sm"
                        isDisabled={choicePending}
                        testID="choose-date"
                        accessibilityLabel={`${t("Choose date")}: ${choiceLabel(choice, t)}`}
                        onPress={() =>
                          openChoice({ kind: "dates", itemId: date, title: t("Choose date") })
                        }
                      >
                        <ChoiceIcon choice={choice} color={iconColors[choice]} />
                      </Button>
                    )}
                  </GroupedRow>
                );
              })}
            </GroupedList>
          </View>
        </Tabs.Content>

        {match.status !== "TERMINATED" && (
          <Tabs.Content value="players" style={{ marginTop: 16 }}>
            <View style={{ gap: 12 }}>
              {match.status === "PLANNING" && (
                <View style={{ flexDirection: "row", gap: 28 }}>
                  <View>
                    <Typography className="text-sm text-muted">{t("Minimum players")}</Typography>
                    <Typography className="font-semibold text-foreground">
                      {match.minPlayers}
                    </Typography>
                  </View>
                  <View>
                    <Typography className="text-sm text-muted">{t("Maximum players")}</Typography>
                    <Typography className="font-semibold text-foreground">
                      {match.maxPlayers}
                    </Typography>
                  </View>
                </View>
              )}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <UsersRound size={18} color={muted} />
                <Typography accessibilityRole="header" className="font-semibold text-foreground">
                  {t("Participants")}
                </Typography>
              </View>
              <GroupedList>
                {participants.map((player) => {
                  const statusLabel =
                    player.status === "PENDING"
                      ? t("Pending")
                      : player.status === "ACCEPTED"
                        ? t("Accepted")
                        : t("Declined");
                  return (
                    <GroupedRow key={player.id}>
                      <View style={{ position: "relative" }}>
                        <Avatar size="md">
                          {player.avatarUrl ? (
                            <Avatar.Image source={{ uri: player.avatarUrl }} />
                          ) : null}
                          <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
                        </Avatar>
                        <View
                          accessible
                          accessibilityRole="image"
                          accessibilityLabel={statusLabel}
                          className="bg-background"
                          style={{
                            position: "absolute",
                            right: -4,
                            bottom: -4,
                            borderRadius: 12,
                            padding: 2,
                          }}
                        >
                          {player.status === "PENDING" ? (
                            <Clock3 size={15} color="#f5a524" />
                          ) : player.status === "ACCEPTED" ? (
                            <CircleCheck size={15} color="#17c964" />
                          ) : (
                            <CircleX size={15} color="#f31260" />
                          )}
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Typography className="font-medium text-foreground" numberOfLines={1}>
                            {player.name}
                          </Typography>
                          {player.isAdministrator ? (
                            <View accessible accessibilityLabel={t("Administrator")}>
                              <Crown size={16} color="#f5a524" />
                            </View>
                          ) : null}
                        </View>
                        {match.status === "CREATED" ? (
                          <GameRating
                            rating={data.currentGameRatings?.find(
                              (item) => item.userId === player.id,
                            )}
                          />
                        ) : player.email ? (
                          <Typography className="text-sm text-muted" numberOfLines={1}>
                            {player.email}
                          </Typography>
                        ) : null}
                      </View>
                      {match.adminUserId === userId &&
                        match.status === "PLANNING" &&
                        !player.isAdministrator && (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="danger-soft"
                            isDisabled={isRemoving}
                            accessibilityLabel={`${t("Remove player")}: ${player.name}`}
                            testID={`remove-match-player-${player.id}`}
                            style={{ minHeight: 44, minWidth: 44 }}
                            onPress={() => removePlayer(player.invitation.id)}
                          >
                            <UserRoundX size={18} color={danger} />
                          </Button>
                        )}
                      {socialMenu(player)}
                    </GroupedRow>
                  );
                })}
              </GroupedList>
            </View>
          </Tabs.Content>
        )}

        <Tabs.Content value="games" style={{ marginTop: 16 }}>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Gamepad2 size={18} color={muted} />
              <Typography accessibilityRole="header" className="font-semibold text-foreground">
                {match.status !== "PLANNING" ? t("Confirmed game") : t("Game selection")}
              </Typography>
              {match.status === "PLANNING" && data.voteSummary && <VoteLegend />}
            </View>
            {games.length === 0 ? (
              <EmptyList icon={<Gamepad2 size={28} color="#737373" />}>
                {t("No selected games")}
              </EmptyList>
            ) : (
              <GroupedList>
                {games
                  .filter((game) => match.status === "PLANNING" || game.id === match.selectedGameId)
                  .map((game) => (
                    <GroupedRow key={game.id}>
                      <View
                        className="bg-muted/20"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          overflow: "hidden",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {game.thumbnail ? (
                          <Image
                            source={{ uri: game.thumbnail }}
                            accessible={false}
                            style={{ width: 40, height: 40 }}
                          />
                        ) : (
                          <Gamepad2 size={18} color="#6b7280" />
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Typography
                          className="font-medium text-foreground"
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {game.name}
                        </Typography>
                        <GameCatalogMetadata
                          year={game.yearPublished}
                          average={game.average}
                          rank={game.rank}
                        />
                        {match.status === "PLANNING" &&
                          data.voteSummary?.games[String(game.id)] && (
                            <VoteCounts counts={data.voteSummary.games[String(game.id)]} />
                          )}
                      </View>
                      {match.status === "TERMINATED" && winnerNames && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            flexShrink: 1,
                          }}
                        >
                          <View
                            accessible
                            accessibilityRole="image"
                            accessibilityLabel={t("Winner")}
                          >
                            <Medal size={16} color="#f59e0b" />
                          </View>
                          <Typography className="font-bold text-foreground" numberOfLines={1}>
                            {winnerNames}
                          </Typography>
                        </View>
                      )}
                      {canChoose && (
                        <Button
                          variant="outline"
                          isIconOnly
                          size="sm"
                          isDisabled={choicePending}
                          testID="choose-game"
                          accessibilityLabel={`${t("Choose game")}: ${choiceLabel(data.choices?.games?.[String(game.id)] ?? "UNKNOWN", t)}`}
                          onPress={() =>
                            openChoice({
                              kind: "games",
                              itemId: game.id,
                              title: t("Choose game"),
                            })
                          }
                        >
                          <ChoiceIcon
                            choice={data.choices?.games?.[String(game.id)] ?? "UNKNOWN"}
                            color={iconColors[data.choices?.games?.[String(game.id)] ?? "UNKNOWN"]}
                          />
                        </Button>
                      )}
                    </GroupedRow>
                  ))}
              </GroupedList>
            )}
          </View>
        </Tabs.Content>
        {match.status === "TERMINATED" && match.results && (
          <Tabs.Content value="standings" style={{ marginTop: 16 }}>
            <View style={{ gap: 12 }}>
              <Typography className="text-sm text-muted">
                {match.results.lowerWins ? t("Lowest score wins") : t("Highest score wins")}
              </Typography>
              <GroupedList>
                {match.results.entries.map((entry) => {
                  const player = participants.find((item) => item.id === entry.userId);
                  return (
                    <GroupedRow key={entry.userId}>
                      {player && (
                        <MatchStandingIdentity
                          player={player}
                          rank={entry.rank}
                          showGameRating
                          gameRating={data.gameRatings?.find(
                            (item) => item.userId === entry.userId,
                          )}
                        />
                      )}
                      <Typography className="font-semibold text-foreground">
                        {entry.score ?? "ND"}
                      </Typography>
                      {player && socialMenu(player, true)}
                    </GroupedRow>
                  );
                })}
              </GroupedList>
            </View>
          </Tabs.Content>
        )}
      </Tabs>
      {socialQueries.some((query) => query.isError) && (
        <Button
          variant="ghost"
          onPress={() => void contacts.refreshContacts()}
          accessibilityLabel={t("Could not load social actions. Retry")}
        >
          <Button.Label>{t("Could not load social actions. Retry")}</Button.Label>
        </Button>
      )}
      <UserActionsSheet
        visible={selectedContact !== null}
        user={selectedContact?.user ?? null}
        busy={socialBusy}
        canSendFriendRequest={selectedContact?.canSendFriendRequest}
        friendRequest={selectedContact?.friendRequest}
        matchContext
        onClose={() => setMenuUserId(null)}
        onAction={socialAction}
      />
    </View>
  );
}
