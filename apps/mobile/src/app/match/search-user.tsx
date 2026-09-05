import type { ContactUser, RelationshipRow } from "@board-game-organizer/shared";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { ArrowLeft, UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";

function apiUrl(): string {
  return (
    (Constants.expoConfig?.extra?.apiUrl as string | undefined)?.trim() || "http://localhost:4000"
  );
}

export default function SearchUserScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const { slotId } = useLocalSearchParams<{ slotId: string }>();
  const setPendingUser = useAppStore((s) => s.setPendingUser);
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [friends, setFriends] = useState<RelationshipRow[]>([]);
  const [results, setResults] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          withProtectionBypass(`${apiUrl()}/api/relationships?type=friends`),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { relationships: RelationshipRow[] };
        if (active) setFriends(data.relationships);
      } catch {
        if (active) setError(t("Could not load friends"));
      }
    })();
    return () => {
      active = false;
    };
  }, [token, t]);

  useEffect(() => {
    if (query.trim().length < 4) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (!token) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          withProtectionBypass(
            `${apiUrl()}/api/users/search?query=${encodeURIComponent(query.trim())}`,
          ),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { users: ContactUser[] };
        if (active) setResults(data.users);
      } catch {
        if (active) setError(t("Search failed"));
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, token, t]);

  const shown =
    query.trim().length >= 4
      ? results
      : friends.map((f) => f.profile).filter((p): p is ContactUser => Boolean(p));

  const select = (u: ContactUser) => {
    if (!slotId) {
      // Route param missing (deep link / stale navigation): the selection
      // can't be routed back to a wizard slot — drop it instead of leaving
      // a dangling pending that would confuse the next pick.
      console.warn("[match] select user without slotId, ignoring");
      return;
    }
    setPendingUser(slotId, {
      id: u.id,
      name: u.name ?? "",
      email: u.email ?? null,
      avatarUrl: u.avatarUrl ?? null,
    });
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 16 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft color="#111" size={22} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>{t("Invite friends")}</Text>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t("Search users (at least 4 characters)")}
        />
      </View>
      {error && (
        <Text style={{ color: "#f31260", fontSize: 13, paddingHorizontal: 16, marginTop: 8 }}>
          {error}
        </Text>
      )}
      {loading && (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton isLoading variant="pulse" style={{ height: 48, borderRadius: 12 }} />
          <Skeleton isLoading variant="pulse" style={{ height: 48, borderRadius: 12 }} />
        </View>
      )}
      {!loading && shown.length === 0 && query.trim().length >= 4 && (
        <Text style={{ color: "#6b7280", fontSize: 14, padding: 16 }}>{t("No users found")}</Text>
      )}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {shown.map((u) => (
          <View
            key={u.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e5e7eb",
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#e5e7eb",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontWeight: "600" }}>{u.name?.charAt(0) ?? "?"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500" }}>{u.name}</Text>
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>{u.email}</Text>
            </View>
            <Button size="sm" onPress={() => select(u)}>
              <UserPlus size={14} color="#fff" />
              <Text style={{ color: "#fff" }}>{t("Add")}</Text>
            </Button>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
