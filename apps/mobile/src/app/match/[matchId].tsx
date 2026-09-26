import type { MatchChoice, MatchDetailResponse } from "@board-game-organizer/schemas";
import { resolveApiUrl, useMatchDetail } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
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
import { Text } from "heroui-native/text";
import {
  CalendarCheck2,
  Check,
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  Clock3,
  Crown,
  Gamepad2,
  LogOut,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { VoteCounts, VoteLegend } from "@/components/VoteCounts";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

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
  UNKNOWN: CircleQuestionMark,
  YES: CircleCheck,
  NO: CircleX,
  IF_NEEDED: CircleAlert,
} as const;

function ChoiceIcon({ choice, color }: { choice: MatchChoice; color: string }) {
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
  const { matchId: matchIdParam } = useLocalSearchParams<{ matchId: string | string[] }>();
  const matchId = Array.isArray(matchIdParam) ? matchIdParam[0] : matchIdParam;
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [activeChoice, setActiveChoice] = useState<ActiveChoice | null>(null);

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
  const match = matches.detail.data?.match;
  const ownInvitation = match?.invitations.find(
    (invitation) => invitation.inviteeUserId === userId,
  );
  const matchAction =
    match?.adminUserId === userId
      ? "delete"
      : match?.status === "PLANNING" && ownInvitation?.status === "ACCEPTED"
        ? "leave"
        : null;
  const matchActionPending = matches.deleteMatch.isPending || matches.leaveMatch.isPending;
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
    const date = summary?.selectedDate ? new Date(summary.selectedDate).toLocaleString() : "";
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

  return (
    <>
      <Stack.Screen
        options={{
          title: t("Match details"),
          headerRight: matchAction
            ? () => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {match?.adminUserId === userId &&
                    (statusUnavailable ? (
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
                        accessibilityLabel={
                          match?.status === "PLANNING" ? t("Confirm match") : t("Back to planning")
                        }
                        style={{ minHeight: 44, minWidth: 44 }}
                        testID="change-match-status"
                        onPress={confirmStatusAction}
                      >
                        {match?.status === "PLANNING" ? (
                          <CalendarCheck2 size={18} color="#17c964" />
                        ) : (
                          <RotateCcw size={18} color="#737373" />
                        )}
                      </Button>
                    ))}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    isDisabled={matchActionPending}
                    accessibilityLabel={
                      matchAction === "delete" ? t("Delete match") : t("Leave match")
                    }
                    onPress={confirmMatchAction}
                    style={{ minHeight: 44, minWidth: 44 }}
                  >
                    {matchAction === "delete" ? (
                      <Trash2 size={17} color="#f31260" />
                    ) : (
                      <LogOut size={17} color="#f31260" />
                    )}
                  </Button>
                </View>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
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
          <Text className="text-sm text-danger">{t("Could not load match details")}</Text>
        )}

        {matches.detail.data && (
          <MatchDetailContent
            data={matches.detail.data}
            userId={userId}
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
                  <Text className={`text-base ${choiceColors[choice]}`}>{label}</Text>
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
            bottom: 24,
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
    </>
  );
}

function MatchDetailContent({
  data,
  userId,
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
  activeTab: string;
  setActiveTab: (value: string) => void;
  isResponding: boolean;
  responseError: boolean;
  choicePending: boolean;
  openChoice: (choice: ActiveChoice) => void;
  respond: (invitationId: string, decision: "accept" | "decline") => void;
}) {
  const t = useT();
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
    { ...administrator, status: "ACCEPTED" as const, isAdministrator: true },
    ...invitedPlayers.map((player) => ({
      ...player,
      status: player.invitation.status,
      isAdministrator: false,
    })),
  ];

  return (
    <View style={{ gap: 16 }}>
      {ownInvitation?.status === "PENDING" && (
        <Card style={{ padding: 16, borderRadius: 12 }}>
          <Text className="font-medium text-foreground">
            {t("Your invitation is waiting for a response.")}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
            <Button
              isIconOnly
              size="sm"
              variant="outline"
              accessibilityLabel={t("Decline")}
              isDisabled={isResponding}
              onPress={() => respond(ownInvitation.id, "decline")}
            >
              <X size={14} color="#6b7280" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              accessibilityLabel={t("Accept")}
              isDisabled={isResponding}
              onPress={() => respond(ownInvitation.id, "accept")}
            >
              <Check size={14} color="#fff" />
            </Button>
          </View>
        </Card>
      )}

      {responseError && (
        <Text className="text-sm text-danger">{t("Could not update the invitation")}</Text>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} variant="primary">
        <Tabs.List>
          <Tabs.Indicator />
          <Tabs.Trigger value="overview" style={{ flex: 1 }}>
            <Tabs.Label>{t("Overview")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="players" style={{ flex: 1 }}>
            <Tabs.Label>{t("Players")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="games" style={{ flex: 1 }}>
            <Tabs.Label>{t("Games")}</Tabs.Label>
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" style={{ marginTop: 16 }}>
          <Card style={{ padding: 18, borderRadius: 12 }}>
            <Text className="text-xl font-semibold text-foreground">{match.name}</Text>
            <Text className="mt-5 font-semibold text-foreground">
              {match.status === "CREATED" ? t("Confirmed date") : t("Possible dates")}
            </Text>
            {data.voteSummary && <VoteLegend />}
            <GroupedList>
              {(match.status === "CREATED" && match.selectedDate
                ? [match.selectedDate]
                : match.dates
              ).map((date) => {
                const choice = data.choices?.dates?.[String(Date.parse(date))] ?? "UNKNOWN";
                return (
                  <GroupedRow key={date}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text className="text-sm text-foreground">
                        {new Date(date).toLocaleString()}
                      </Text>
                      {data.voteSummary?.dates[String(Date.parse(date))] && (
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
          </Card>
        </Tabs.Content>

        <Tabs.Content value="players" style={{ marginTop: 16 }}>
          <Card style={{ padding: 18, borderRadius: 12 }}>
            <View style={{ flexDirection: "row", gap: 28 }}>
              <View>
                <Text className="text-sm text-muted">{t("Minimum players")}</Text>
                <Text className="font-semibold text-foreground">{match.minPlayers}</Text>
              </View>
              <View>
                <Text className="text-sm text-muted">{t("Maximum players")}</Text>
                <Text className="font-semibold text-foreground">{match.maxPlayers}</Text>
              </View>
            </View>

            <Text className="mt-5 font-semibold text-foreground">{t("Participants")}</Text>
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
                    <Avatar size="md">
                      {player.avatarUrl ? (
                        <Avatar.Image source={{ uri: player.avatarUrl }} />
                      ) : null}
                      <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
                    </Avatar>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text className="font-medium text-foreground" numberOfLines={1}>
                          {player.name}
                        </Text>
                        {player.isAdministrator ? (
                          <View accessible accessibilityLabel={t("Administrator")}>
                            <Crown size={16} color="#f5a524" />
                          </View>
                        ) : null}
                      </View>
                      {player.email ? (
                        <Text className="text-sm text-muted" numberOfLines={1}>
                          {player.email}
                        </Text>
                      ) : null}
                    </View>
                    <View accessible accessibilityRole="image" accessibilityLabel={statusLabel}>
                      {player.status === "PENDING" ? (
                        <Clock3 size={20} color="#f5a524" />
                      ) : player.status === "ACCEPTED" ? (
                        <CircleCheck size={20} color="#17c964" />
                      ) : (
                        <CircleX size={20} color="#f31260" />
                      )}
                    </View>
                  </GroupedRow>
                );
              })}
            </GroupedList>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="games" style={{ marginTop: 16 }}>
          <Card style={{ padding: 18, borderRadius: 12 }}>
            {games.length === 0 ? (
              <Text className="text-sm text-muted">{t("No selected games")}</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {data.voteSummary && <VoteLegend />}
                <GroupedList>
                  {games
                    .filter(
                      (game) => match.status !== "CREATED" || game.id === match.selectedGameId,
                    )
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
                          <Text className="font-medium text-foreground">{game.name}</Text>
                          {game.yearPublished ? (
                            <Text className="text-xs text-muted">{game.yearPublished}</Text>
                          ) : null}
                          {data.voteSummary?.games[String(game.id)] && (
                            <VoteCounts counts={data.voteSummary.games[String(game.id)]} />
                          )}
                        </View>
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
                              color={
                                iconColors[data.choices?.games?.[String(game.id)] ?? "UNKNOWN"]
                              }
                            />
                          </Button>
                        )}
                      </GroupedRow>
                    ))}
                </GroupedList>
              </View>
            )}
          </Card>
        </Tabs.Content>
      </Tabs>
    </View>
  );
}
