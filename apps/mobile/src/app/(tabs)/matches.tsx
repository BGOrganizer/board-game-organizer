import { resolveApiUrl, useMatches } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarClock, Check, Crown, Plus, UserRound, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
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
            return (
              <Card key={match.id} style={{ borderRadius: 12 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("Open match")}: ${match.name}`}
                  accessibilityState={{ disabled: match.optimistic }}
                  disabled={match.optimistic}
                  onPress={() =>
                    router.push({ pathname: "/match/[matchId]", params: { matchId: match.id } })
                  }
                  style={{ padding: 16, paddingTop: 40 }}
                >
                  <View
                    accessible
                    accessibilityLabel={
                      match.adminUserId === userId ? t("Administrator") : t("Player")
                    }
                    style={{ position: "absolute", top: 12, left: 16 }}
                  >
                    {match.adminUserId === userId ? (
                      <Crown size={16} color="#f59e0b" />
                    ) : (
                      <UserRound size={16} color="#6b7280" />
                    )}
                  </View>
                  <Typography style={{ fontSize: 15, fontWeight: "600" }}>{match.name}</Typography>
                  <Typography className="text-xs text-muted">
                    {match.status === "CREATED" ? t("Confirmed") : t("Planning")}
                  </Typography>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    <CalendarClock size={14} color="#6b7280" />
                    {(match.status === "CREATED" && match.selectedDate
                      ? [match.selectedDate]
                      : match.dates
                    ).map((date) => (
                      <Typography key={date} style={{ fontSize: 12, color: "#6b7280" }}>
                        {new Date(date).toLocaleString()}
                      </Typography>
                    ))}
                  </View>
                  <Typography style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                    {t("Players")}: {match.minPlayers}–{match.maxPlayers}
                    {match.status === "PLANNING" && match.gameIds.length > 0
                      ? ` · ${match.gameIds.length} ${t("games")}`
                      : ""}
                  </Typography>
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
