import { resolveApiUrl, useMatches } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Card } from "heroui-native/card";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { CalendarClock, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";

function apiUrl(): string {
  return (
    (Constants.expoConfig?.extra?.apiUrl as string | undefined)?.trim() || "http://localhost:4000"
  );
}

export default function MatchesScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

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

  const matches = useMatches({ apiUrl: apiUrl(), token, getToken });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>{t("Matches")}</Text>

        {matches.list.isPending && (
          <View style={{ gap: 12 }}>
            <Skeleton isLoading variant="pulse" style={{ height: 80, borderRadius: 12 }} />
            <Skeleton isLoading variant="pulse" style={{ height: 80, borderRadius: 12 }} />
          </View>
        )}
        {matches.list.isError && (
          <Text style={{ color: "#f31260", fontSize: 14 }}>{t("Could not load matches")}</Text>
        )}
        {matches.list.data && matches.list.data.length === 0 && (
          <Text style={{ color: "#6b7280", fontSize: 14 }}>
            {t("No matches yet — create your first one!")}
          </Text>
        )}

        <View style={{ gap: 12 }}>
          {matches.list.data?.map((m) => (
            <Card key={m.id} style={{ padding: 16, borderRadius: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600" }}>{m.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <CalendarClock size={14} color="#6b7280" />
                {m.dates.map((d) => (
                  <Text key={d} style={{ fontSize: 12, color: "#6b7280" }}>
                    {new Date(d).toLocaleString()}
                  </Text>
                ))}
              </View>
              <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                {t("Players")}: {m.minPlayers}–{m.maxPlayers}
                {m.gameIds.length > 0 ? ` · ${m.gameIds.length} ${t("games")}` : ""}
              </Text>
            </Card>
          ))}
        </View>
      </ScrollView>

      <Pressable
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
