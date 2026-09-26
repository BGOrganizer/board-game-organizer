import type { ContactUser, RelationshipRow } from "@board-game-organizer/shared";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UserPlus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
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
  const { slotId, exclude } = useLocalSearchParams<{
    slotId: string;
    exclude?: string | string[];
  }>();
  const excludedIds = useMemo(() => {
    const value = Array.isArray(exclude) ? exclude[0] : exclude;
    return new Set((value ?? "").split(",").filter(Boolean));
  }, [exclude]);
  const setPendingUser = useAppStore((s) => s.setPendingUser);
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [friends, setFriends] = useState<RelationshipRow[]>([]);
  const friendIds = useMemo(
    () => new Set(friends.flatMap((friend) => (friend.profile ? [friend.profile.id] : []))),
    [friends],
  );
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
        // The endpoint returns a bare array of RelationshipRow (not an
        // envelope): mapping data.relationships would crash with
        // "cannot read property map of undefined".
        const data = (await res.json()) as RelationshipRow[] | { relationships: RelationshipRow[] };
        const rows = Array.isArray(data) ? data : (data.relationships ?? []);
        if (active) setFriends(rows);
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
        if (active) setResults(data.users.filter((user) => friendIds.has(user.id)));
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
  }, [query, token, friendIds, t]);

  const shown = (
    query.trim().length >= 4
      ? results
      : friends.map((f) => f.profile).filter((p): p is ContactUser => Boolean(p))
  ).filter((user) => !excludedIds.has(user.id));

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
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t("Search users (at least 4 characters)")}
        />
      </View>
      {error && (
        <Typography style={{ color: "#f31260", fontSize: 13, paddingHorizontal: 16, marginTop: 8 }}>
          {error}
        </Typography>
      )}
      {loading && (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton isLoading variant="pulse" style={{ height: 48, borderRadius: 12 }} />
          <Skeleton isLoading variant="pulse" style={{ height: 48, borderRadius: 12 }} />
        </View>
      )}
      {!loading && shown.length === 0 && query.trim().length >= 4 && (
        <Typography style={{ color: "#6b7280", fontSize: 14, padding: 16 }}>
          {t("No users found")}
        </Typography>
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
            <Avatar size="md">
              {u.avatarUrl ? <Avatar.Image source={{ uri: u.avatarUrl }} /> : null}
              <Avatar.Fallback>{u.name.charAt(0) || "?"}</Avatar.Fallback>
            </Avatar>
            <View style={{ flex: 1 }}>
              <Typography style={{ fontSize: 14, fontWeight: "500" }}>{u.name}</Typography>
              <Typography style={{ fontSize: 12, color: "#9ca3af" }}>{u.email}</Typography>
            </View>
            <Button
              isIconOnly
              size="sm"
              accessibilityLabel={`${t("Add")}: ${u.name}`}
              onPress={() => select(u)}
            >
              <UserPlus size={16} color="#fff" />
            </Button>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
