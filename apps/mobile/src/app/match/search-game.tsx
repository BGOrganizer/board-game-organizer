import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Text } from "heroui-native/text";
import { ArrowLeft, Gamepad2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";

function apiUrl(): string {
  return (
    (Constants.expoConfig?.extra?.apiUrl as string | undefined)?.trim() || "http://localhost:4000"
  );
}

export default function SearchGameScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const { slotId, exclude } = useLocalSearchParams<{ slotId: string; exclude?: string }>();
  const setPendingGame = useAppStore((s) => s.setPendingGame);
  const excludedIds = useMemo(
    () =>
      new Set(
        (exclude ?? "")
          .split(",")
          .filter(Boolean)
          .map((x) => Number(x)),
      ),
    [exclude],
  );
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BggSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
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
    if (query.trim().length < 4) {
      setItems([]);
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
            `${apiUrl()}/api/bgg/search?query=${encodeURIComponent(query.trim())}`,
          ),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: BggSearchItem[] };
        // Games already chosen in another wizard slot stay hidden: a game
        // can only be played once in a match.
        if (active) setItems(data.items.filter((i) => !excludedIds.has(i.id)));
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
  }, [query, token, t, excludedIds]);

  const select = async (item: BggSearchItem) => {
    setPicking(item.id);
    setError(null);
    try {
      const res = await fetch(withProtectionBypass(`${apiUrl()}/api/bgg/thing?id=${item.id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const details = (await res.json()) as BggThingResponse;
      setPendingGame(slotId, {
        id: details.id,
        name: details.name,
        imageUrl: details.imageUrl,
        year: details.year,
      });
      router.back();
    } catch {
      setError(t("Could not load game details"));
    } finally {
      setPicking(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 16 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft color="#111" size={22} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>{t("Select a board game")}</Text>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t("Search board games (at least 4 characters)")}
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
      {!loading && items.length === 0 && query.trim().length >= 4 && (
        <Text style={{ color: "#6b7280", fontSize: 14, padding: 16 }}>{t("No games found")}</Text>
      )}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {items.map((item) => (
          <View
            key={item.id}
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
                borderRadius: 8,
                backgroundColor: "#e5e7eb",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Gamepad2 size={18} color="#6b7280" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "500" }}>{item.name}</Text>
            </View>
            <Button size="sm" isDisabled={picking === item.id} onPress={() => void select(item)}>
              <Text style={{ color: "#fff" }}>{t("Select")}</Text>
            </Button>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
