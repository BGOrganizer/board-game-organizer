import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { resolveApiUrl, useMatchDetail } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Text } from "heroui-native/text";
import {
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  Crown,
  LogOut,
  Pencil,
  Trash2,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export default function MatchDetailScreen() {
  const { matchId: matchIdParam } = useLocalSearchParams<{ matchId: string | string[] }>();
  const matchId = Array.isArray(matchIdParam) ? matchIdParam[0] : matchIdParam;
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const t = useT();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

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
  const editableMatch =
    match?.adminUserId === userId && match?.status === "PLANNING" ? match : null;
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
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  isDisabled={matchActionPending}
                  accessibilityLabel={
                    matchAction === "delete" ? t("Delete match") : t("Leave match")
                  }
                  onPress={confirmMatchAction}
                >
                  {matchAction === "delete" ? (
                    <Trash2 size={17} color="#f31260" />
                  ) : (
                    <LogOut size={17} color="#f31260" />
                  )}
                </Button>
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
  respond,
}: {
  data: MatchDetailResponse;
  userId: string | null | undefined;
  activeTab: string;
  setActiveTab: (value: string) => void;
  isResponding: boolean;
  responseError: boolean;
  respond: (invitationId: string, decision: "accept" | "decline") => void;
}) {
  const t = useT();
  const { match, administrator, invitedPlayers, games } = data;
  const ownInvitation = match.invitations.find((invitation) => invitation.inviteeUserId === userId);
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
            <Text className="mt-5 font-semibold text-foreground">{t("Possible dates")}</Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {match.dates.map((date) => (
                <Text key={date} className="text-sm text-muted">
                  {new Date(date).toLocaleString()}
                </Text>
              ))}
            </View>
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
            <View style={{ gap: 8, marginTop: 10 }}>
              {participants.map((player) => {
                const statusLabel =
                  player.status === "PENDING"
                    ? t("Pending")
                    : player.status === "ACCEPTED"
                      ? t("Accepted")
                      : t("Declined");
                return (
                  <Card
                    key={player.id}
                    style={{
                      width: "100%",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                    }}
                  >
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
                  </Card>
                );
              })}
            </View>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="games" style={{ marginTop: 16 }}>
          <Card style={{ padding: 18, borderRadius: 12 }}>
            {games.length === 0 ? (
              <Text className="text-sm text-muted">{t("No selected games")}</Text>
            ) : (
              <View style={{ gap: 14 }}>
                {games.map((game) => (
                  <View key={game.id}>
                    <Text className="font-medium text-foreground">{game.name}</Text>
                    {game.yearPublished && (
                      <Text className="text-xs text-muted">{game.yearPublished}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>
        </Tabs.Content>
      </Tabs>
    </View>
  );
}
