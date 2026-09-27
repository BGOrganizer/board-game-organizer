import type { MatchCardStatus } from "@board-game-organizer/shared";
import {
  matchCardData,
  matchCardStatusColor,
  resolveApiUrl,
  useMatches,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import waves from "@dicebear/styles/waves.json" with { type: "json" };
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Chip } from "heroui-native/chip";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, Crown, Dices, Medal, Plus, UsersRound, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

const wavesStyle = new Style(waves);

function MatchArtwork({ name, adminLabel }: { name: string; adminLabel?: string }) {
  const xml = useMemo(
    () => new DiceBearAvatar(wavesStyle, { seed: name, size: 72 }).toString(),
    [name],
  );
  const reducedMotion = useReducedMotion();
  const shift = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      shift.set(0);
      return;
    }
    shift.set(
      withRepeat(withTiming(4, { duration: 3000, reduceMotion: ReduceMotion.System }), -1, true),
    );
    return () => cancelAnimation(shift);
  }, [reducedMotion, shift]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }));
  return (
    <View style={{ width: 64, height: 64, flexShrink: 0 }}>
      <View
        accessible={false}
        className="bg-accent/10"
        style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden" }}
      >
        <Animated.View
          testID="match-waves-image"
          style={[{ position: "absolute", left: -4, top: -4 }, animatedStyle]}
        >
          <SvgXml xml={xml} width={72} height={72} />
        </Animated.View>
      </View>
      {adminLabel && (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={adminLabel}
          testID="admin-match-badge"
          className="bg-surface"
          style={{ position: "absolute", top: 0, left: 0, padding: 4, borderBottomRightRadius: 8 }}
        >
          <Crown size={16} color="#f59e0b" />
        </View>
      )}
    </View>
  );
}

export default function MatchesScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const t = useT();
  const { i18n } = useLingui();
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
              TERMINATED: t("Terminated"),
              CANCELLED: t("Cancelled"),
            };
            const gameLabel =
              card.gameCount === undefined
                ? (card.selectedGameName ?? t("Game unavailable"))
                : `${card.gameCount} ${card.gameCount === 1 ? t("game") : t("games")}`;
            const dateLabel = card.date
              ? new Date(card.date).toLocaleDateString(i18n.locale, {
                  day: "numeric",
                  month: "long",
                })
              : "";
            const extraDates = card.additionalDates
              ? `+${card.additionalDates} ${card.additionalDates === 1 ? t("date") : t("dates")}`
              : "";
            return (
              <Card key={match.id} style={{ borderRadius: 12 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("Open match")}: ${match.name}, ${statusLabels[match.status]}, ${dateLabel} ${extraDates}, ${t("Players")}: ${card.players}/${card.maxPlayers}, ${gameLabel}${match.adminUserId === userId ? `, ${t("Administrator")}` : ""}${card.winnerNames?.length ? `, ${t("Winner")}: ${card.winnerNames.join(", ")}` : ""}`}
                  accessibilityState={{ disabled: match.optimistic }}
                  disabled={match.optimistic}
                  onPress={() =>
                    router.push({ pathname: "/match/[matchId]", params: { matchId: match.id } })
                  }
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}
                >
                  <MatchArtwork
                    name={match.name}
                    adminLabel={match.adminUserId === userId ? t("Administrator") : undefined}
                  />
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <Typography
                        className="flex-1 text-foreground"
                        style={{ fontSize: 15, fontWeight: "600" }}
                      >
                        {match.name}
                      </Typography>
                      <Chip size="sm" variant="soft" color={matchCardStatusColor[match.status]}>
                        {statusLabels[match.status]}
                      </Chip>
                    </View>
                    {card.date && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                        <Typography className="text-sm text-muted">{dateLabel}</Typography>
                        {extraDates && (
                          <Typography className="text-sm text-muted">{extraDates}</Typography>
                        )}
                      </View>
                    )}
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
                      {card.winnerNames && card.winnerNames.length > 0 && (
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
                            <Medal size={14} color="#f59e0b" />
                          </View>
                          <Typography
                            className="text-xs font-bold text-foreground"
                            numberOfLines={1}
                          >
                            {card.winnerNames.join(", ")}
                          </Typography>
                        </View>
                      )}
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
