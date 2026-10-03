import { type MatchLocation, matchLocationSchema } from "@board-game-organizer/schemas";
import { resolveApiUrl, withProtectionBypass } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

type Result = Pick<MatchLocation, "address" | "longitude" | "latitude"> & { id: string };
const accessToken = Constants.expoConfig?.extra?.mapboxAccessToken as string | undefined;
if (accessToken) Mapbox.setAccessToken(accessToken);

export default function SearchLocationScreen() {
  const t = useT();
  const router = useRouter();
  const { getToken } = useSessionAuth();
  const { slotId, initial: initialParam } = useLocalSearchParams<{
    slotId: string;
    initial?: string;
  }>();
  const initial = (() => {
    try {
      return matchLocationSchema.safeParse(JSON.parse(initialParam ?? "null")).data;
    } catch {
      return undefined;
    }
  })();
  const setPendingLocation = useAppStore((state) => state.setPendingLocation);
  const [name, setName] = useState(initial?.name ?? "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Result | null>(initial ? { ...initial } : null);
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState({ granted: false, canAskAgain: true });
  const camera = useRef<Mapbox.Camera>(null);
  const [center, setCenter] = useState<[number, number]>(
    initial ? [initial.longitude, initial.latitude] : [0, 20],
  );

  useEffect(() => {
    if (query.trim().length < 4 || selected?.address === query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Unauthorized");
        const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
        const url = withProtectionBypass(
          `${apiUrl}/api/locations/search?query=${encodeURIComponent(query.trim())}`,
        );
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Geocoding unavailable");
        const body = (await response.json()) as { items: Result[] };
        setResults(body.items.slice(0, 5));
        setError("");
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(t("Could not search addresses"));
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected?.address, getToken, t]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await Location.getForegroundPermissionsAsync();
        if (active) {
          setPermission({ granted: next.granted, canAskAgain: next.canAskAgain });
          if (next.granted)
            setError((current) => (current === t("Location permission denied") ? "" : current));
        }
      } catch {
        /* Explicit request reports errors. */
      }
    };
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [t]);

  const moveTo = (longitude: number, latitude: number) => {
    setCenter([longitude, latitude]);
    camera.current?.setCamera({
      centerCoordinate: [longitude, latitude],
      zoomLevel: 14,
      animationDuration: 500,
    });
  };
  const locate = async () => {
    try {
      if (!permission.granted && !permission.canAskAgain) {
        await Linking.openSettings();
        return;
      }
      await Location.requestForegroundPermissionsAsync();
      const current = await Location.getForegroundPermissionsAsync();
      setPermission({ granted: current.granted, canAskAgain: current.canAskAgain });
      if (!current.granted) {
        setError(t("Location permission denied"));
        return;
      }
      setError("");
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      moveTo(position.coords.longitude, position.coords.latitude);
    } catch {
      setError(t("Location unavailable"));
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: t("Select location") }} />
      <Input
        accessibilityLabel={t("Location name")}
        placeholder={t("Location name")}
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Input
        accessibilityLabel={t("Search address")}
        placeholder={t("Search address")}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setSelected(null);
          setResults([]);
        }}
      />
      {searching && (
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 48, borderRadius: 12 }}
        />
      )}
      {results.length > 0 && (
        <ScrollView
          style={{ maxHeight: 196 }}
          keyboardShouldPersistTaps="always"
          accessibilityLabel={t("Address results")}
        >
          {results.map((item, index) => (
            <Pressable
              key={item.id}
              testID={`address-result-${index}`}
              accessibilityRole="button"
              accessibilityLabel={item.address}
              onPress={() => {
                setSelected(item);
                setResults([]);
                setQuery(item.address);
                moveTo(item.longitude, item.latitude);
              }}
              style={{ padding: 12 }}
            >
              <Typography className="text-foreground">{item.address}</Typography>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {error ? (
        <Typography className="text-danger" accessibilityRole="alert">
          {error}
        </Typography>
      ) : null}
      {accessToken ? (
        <View style={{ flex: 1, minHeight: 180 }}>
          <Mapbox.MapView style={{ flex: 1 }}>
            <Mapbox.Camera ref={camera} zoomLevel={initial ? 13 : 1.5} centerCoordinate={center} />
            {selected && (
              <Mapbox.PointAnnotation
                id="selected-location"
                coordinate={[selected.longitude, selected.latitude]}
              >
                <View
                  style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#006fee" }}
                />
              </Mapbox.PointAnnotation>
            )}
          </Mapbox.MapView>
        </View>
      ) : (
        <Typography className="text-danger">{t("Map unavailable")}</Typography>
      )}
      <Button variant="secondary" onPress={() => void locate()}>
        {!permission.granted && !permission.canAskAgain ? t("Open settings") : t("Use my location")}
      </Button>
      {selected && <Typography className="text-foreground">{selected.address}</Typography>}
      <Button
        variant="primary"
        isDisabled={!accessToken || !selected || name.trim().length < 4}
        onPress={() => {
          if (!selected || name.trim().length < 4) return;
          setPendingLocation(slotId, {
            id:
              initial?.id ??
              "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
                const digit = Math.floor(Math.random() * 16);
                return (char === "x" ? digit : (digit & 3) | 8).toString(16);
              }),
            name: name.trim(),
            address: selected.address,
            longitude: selected.longitude,
            latitude: selected.latitude,
          });
          router.back();
        }}
      >
        {t("Confirm location")}
      </Button>
    </View>
  );
}
