import type { MatchCardStatus } from "@board-game-organizer/shared";
import {
  matchCardData,
  matchCardStatusColor,
  resolveApiUrl,
  useMatches,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import bottts from "@dicebear/styles/bottts.json" with { type: "json" };
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Chip } from "heroui-native/chip";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, Crown, Dices, Plus, UserRound, UsersRound, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

const botttsStyle = new Style(bottts);

function MatchMascot({ name }: { name: string }) {
  const xml = useMemo(
    () => new DiceBearAvatar(botttsStyle, { seed: name, size: 64 }).toString(),
    [name],
  );
  return (
    <View
      accessible={false}
      className="bg-accent/10"
      style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}
    >
      <SvgXml xml={xml} width={64} height={64} />
    </View>
  );
}

export default function MatchesScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const t = useT();
  const mutationFeedback = useMutationFeedback();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((nextToken) => active && setToken(nextToken ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const matches = useMatches({
    apiUrl: apiUrl(),
    token,
    getToken,
    userId,
    feedback: mutationFeedback,
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Typography style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
          {t("Matches")}
        </Typography>

        {matches.list.isPending && (
          <View style={{ gap: 12, width: "100%" }}>
            <Skeleton
              isLoading
              variant="pulse"
              style={{ width: "100%", height: 96, borderRadius: 12 }}
            />
            <Skeleton
              isLoading
              variant="pulse"
              style={{ width: "100%", height: 96, borderRadius: 12 }}
            />
            <Skeleton
              isLoading
              variant="pulse"
              style={{ width: "100%", height: 96, borderRadius: 12 }}
            />
          </View>
        )}
        {matches.list.isError && (
          <Typography style={{ color: "#f31260", fontSize: 14 }}>
            {t("Could not load matches")}
          </Typography>
        )}
        {matches.list.data && matches.list.data.length === 0 && (
          <Typography style={{ color: "#6b7280", fontSize: 14 }}>
            {t("No matches yet — create your first one!")}
          </Typography>
        )}

        <View style={{ gap: 12 }}>
          {matches.list.data?.map((match) => {
            const invitation = match.invitations.find(
              (candidate) => candidate.inviteeUserId === userId,
            );
            const card = matchCardData(match);
            const statusLabels: Record<MatchCardStatus, string> = {
              PLANNING: t("Planning"),
              CREATED: t("Confirmed"),
              IN_PROGRESS: t("In progress"),
              FINISHED: t("Finished"),
              CANCELLED: t("Cancelled"),
            };
            const gameLabel =
              card.gameCount === undefined
                ? (card.selectedGameName ?? t("Game unavailable"))
                : `${card.gameCount} ${card.gameCount === 1 ? t("game") : t("games")}`;
            return (
              <Card key={match.id} style={{ borderRadius: 12 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("Open match")}: ${match.name}, ${statusLabels[match.status]}, ${card.dates.map((date) => new Date(date).toLocaleDateString()).join(", ")}, ${t("Players")}: ${card.players}/${card.maxPlayers}, ${gameLabel}`}
                  accessibilityState={{ disabled: match.optimistic }}
                  disabled={match.optimistic}
                  onPress={() =>
                    router.push({ pathname: "/match/[matchId]", params: { matchId: match.id } })
                  }
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}
                >
                  <MatchMascot name={match.name} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Typography
                          className="text-foreground"
                          style={{ flexShrink: 1, fontSize: 15, fontWeight: "600" }}
                        >
                          {match.name}
                        </Typography>
                        <View
                          accessible
                          accessibilityLabel={
                            match.adminUserId === userId ? t("Administrator") : t("Player")
                          }
                        >
                          {match.adminUserId === userId ? (
                            <Crown size={16} color="#f59e0b" />
                          ) : (
                            <UserRound size={16} color="#6b7280" />
                          )}
                        </View>
                      </View>
                      <Chip size="sm" variant="soft" color={matchCardStatusColor[match.status]}>
                        {statusLabels[match.status]}
                      </Chip>
                    </View>
                    <View style={{ gap: 4 }}>
                      {card.dates.map((date) => (
                        <Typography key={date} className="text-sm text-muted">
                          {new Date(date).toLocaleDateString()}
                        </Typography>
                      ))}
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <UsersRound size={14} color="#6b7280" />
                        <Typography className="text-xs text-muted">
                          {card.players}/{card.maxPlayers}
                        </Typography>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          flexShrink: 1,
                        }}
                      >
                        <Dices size={14} color="#6b7280" />
                        <Typography className="text-xs text-muted" style={{ flexShrink: 1 }}>
                          {gameLabel}
                        </Typography>
                      </View>
                    </View>
                  </View>
                </Pressable>

                {invitation?.status === "PENDING" && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-end",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingBottom: 10,
                    }}
                  >
                    <Button
                      isIconOnly
                      size="sm"
                      variant="outline"
                      accessibilityLabel={t("Decline")}
                      isDisabled={matches.respondInvitation.isPending}
                      onPress={() =>
                        matches.respondInvitation.mutate({
                          invitationId: invitation.id,
                          decision: "decline",
                        })
                      }
                    >
                      <X size={14} color="#6b7280" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      accessibilityLabel={t("Accept")}
                      isDisabled={matches.respondInvitation.isPending}
                      onPress={() =>
                        matches.respondInvitation.mutate({
                          invitationId: invitation.id,
                          decision: "accept",
                        })
                      }
                    >
                      <Check size={14} color="#fff" />
                    </Button>
                  </View>
                )}
              </Card>
            );
          })}
        </View>

        {matches.respondInvitation.isError && (
          <Typography style={{ color: "#f31260", fontSize: 14, marginTop: 12 }}>
            {t("Could not update the invitation")}
          </Typography>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Create a match")}
        onPress={() => router.push("/match/wizard")}
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
        <Plus color="#fff" size={26} />
      </Pressable>
    </View>
  );
}
