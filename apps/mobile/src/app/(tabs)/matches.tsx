import type { MatchCardStatus } from "@board-game-organizer/shared";
import {
  formatMatchDateTime,
  matchCardData,
  matchCardStatusColor,
  resolveApiUrl,
  useListFilters,
  useMatches,
} from "@board-game-organizer/shared";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import waves from "@dicebear/styles/waves.json" with { type: "json" };
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Chip } from "heroui-native/chip";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, Clock3, Crown, Dices, Medal, Plus, UsersRound } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
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
import { InvitationActions } from "@/components/InvitationActions";
import { LinkedListCard } from "@/components/LinkedListCard";
import { ListSearchFilters } from "@/components/ListSearchFilters";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { useSessionAuth } from "@/lib/useSessionAuth";

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
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const t = useT();
  const { i18n } = useLingui();
  const mutationFeedback = useMutationFeedback();
  const filters = useListFilters();
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
    listFilters: filters.filters,
  });

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={matches.list.data ?? []}
        keyExtractor={(match) => match.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 12, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (
            matches.paging.hasNextPage &&
            !matches.paging.isFetchingNextPage &&
            !matches.paging.isFetchNextPageError
          )
            void matches.paging.fetchNextPage();
        }}
        ListHeaderComponent={
          <ListSearchFilters
            query={filters.query}
            onQueryChange={filters.setQuery}
            roles={filters.roles}
            onToggle={filters.toggleRole}
            label={t("Search matches")}
            placeholder={t("Search matches (at least 4 characters)")}
          />
        }
        ListEmptyComponent={
          matches.list.isPending ? (
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
          ) : matches.list.isError ? null : (
            <Typography className="text-muted">
              {filters.roles.length === 3 && !filters.filters.query
                ? t("No matches yet — create your first one!")
                : t("No matches match your filters")}
            </Typography>
          )
        }
        renderItem={({ item: match }) => {
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
          const dateLabel = card.date ? formatMatchDateTime(card.date, i18n.locale) : null;
          const playersLabel =
            match.status === "PLANNING"
              ? `${card.players}/${card.maxPlayers}`
              : String(card.players);
          const extraDates = card.additionalDates
            ? `+${card.additionalDates} ${card.additionalDates === 1 ? t("date") : t("dates")}`
            : "";
          return (
            <LinkedListCard
              key={match.id}
              label={`${t("Open match")}: ${match.name}, ${statusLabels[match.status]}, ${dateLabel ? `${dateLabel.date} ${dateLabel.time}` : ""} ${extraDates}, ${t("Players")}: ${playersLabel}, ${gameLabel}${match.adminUserId === userId ? `, ${t("Administrator")}` : ""}${card.winnerNames?.length ? `, ${card.winnerNames.length === 1 ? t("Winner") : t("Winners")}: ${card.winnerNames.join(", ")}` : ""}`}
              disabled={match.optimistic}
              onPress={() =>
                router.push({ pathname: "/match/[matchId]", params: { matchId: match.id } })
              }
              actions={
                invitation?.status === "PENDING" ? (
                  <InvitationActions
                    placement="card"
                    name={match.name}
                    pending={matches.respondInvitation.isPending}
                    onDecline={() =>
                      matches.respondInvitation.mutate({
                        invitationId: invitation.id,
                        decision: "decline",
                      })
                    }
                    onAccept={() =>
                      matches.respondInvitation.mutate({
                        invitationId: invitation.id,
                        decision: "accept",
                      })
                    }
                  />
                ) : undefined
              }
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
                {card.date && dateLabel && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <CalendarDays size={14} color="#6b7280" />
                    <Typography className="text-sm text-muted">{dateLabel.date}</Typography>
                    <Clock3 size={14} color="#6b7280" />
                    <Typography className="text-sm text-muted">{dateLabel.time}</Typography>
                    {extraDates && (
                      <Typography className="text-sm text-muted">{extraDates}</Typography>
                    )}
                  </View>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingRight: invitation?.status === "PENDING" ? 88 : 0,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <UsersRound size={14} color="#6b7280" />
                    <Typography className="text-xs text-muted">{playersLabel}</Typography>
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
                    <Typography
                      className="text-xs text-muted"
                      style={{ flexShrink: 1 }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {gameLabel}
                    </Typography>
                  </View>
                </View>
                {card.winnerNames && card.winnerNames.length > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
                    <View
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel={
                        card.winnerNames.length === 1 ? t("Winner") : t("Winners")
                      }
                    >
                      <Medal size={14} color="#f59e0b" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Typography className="text-xs font-bold text-foreground">
                        {card.winnerNames.join("\n")}
                      </Typography>
                    </View>
                  </View>
                )}
              </View>
            </LinkedListCard>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {matches.list.isError && (
              <View style={{ gap: 8 }}>
                <Typography className="text-danger">{t("Could not load matches")}</Typography>
                <Button variant="outline" onPress={() => void matches.list.refetch()}>
                  {t("Try again")}
                </Button>
              </View>
            )}
            {matches.paging.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
            ) : matches.paging.hasNextPage ? (
              <Button variant="outline" onPress={() => void matches.paging.fetchNextPage()}>
                {matches.paging.isFetchNextPageError
                  ? t("Could not load matches. Retry")
                  : t("Load more")}
              </Button>
            ) : null}
            {matches.respondInvitation.isError && (
              <Typography style={{ color: "#f31260", fontSize: 14, marginTop: 12 }}>
                {t("Could not update the invitation")}
              </Typography>
            )}
          </View>
        }
      />

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
