import { type MatchLocation, matchLocationSchema } from "@board-game-organizer/schemas";
import {
  formatLocationAddress,
  resolveApiUrl,
  useCurrentLocationAddress,
  useFavoriteLocations,
  withProtectionBypass,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
} from "@maplibre/maplibre-react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, Heart, LocateFixed, MapPin } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Keyboard, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { useT } from "@/lib/i18n";
import { locationMapPoint } from "@/lib/locations/map-location";
import { requestUserPosition } from "@/lib/locations/user-location";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { useSessionAuth } from "@/lib/useSessionAuth";

type Result = Pick<MatchLocation, "address" | "longitude" | "latitude" | "timeZone"> & {
  id: string;
};
const apiKey = Constants.expoConfig?.extra?.maptilerApiKey as string | undefined;
const mapStyle = apiKey
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(apiKey)}`
  : null;

export default function LocationPicker({
  onSelect,
  onClose,
  initial: initialValue,
}: {
  onSelect?: (location: MatchLocation) => void;
  onClose?: () => void;
  initial?: MatchLocation;
} = {}) {
  const t = useT();
  const router = useRouter();
  // Inline pickers share the wizard route: native Back must close the picker, not discard the draft.
  usePreventRemove(Boolean(onClose), () => onClose?.());
  const insets = useSafeAreaInsets();
  const { getToken, userId } = useSessionAuth();
  const feedback = useMutationFeedback();
  const [foreground, accentForeground, muted] = useThemeColor([
    "foreground",
    "accent-foreground",
    "muted",
  ]);
  const [locating, setLocating] = useState(false);
  const { slotId, initial: initialParam } = useLocalSearchParams<{
    slotId: string;
    initial?: string;
  }>();
  const initial =
    initialValue ??
    (() => {
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
  const [favoriteKey, setFavoriteKey] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState({ granted: false, canAskAgain: true });
  const locationRequest = useRef(0);
  const { lookup, cancel } = useCurrentLocationAddress({
    apiUrl: resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined),
    getToken,
    userId,
  });
  useEffect(
    () => () => {
      locationRequest.current++;
    },
    [],
  );
  const cancelLocate = () => {
    locationRequest.current++;
    cancel();
    setLocating(false);
  };
  const camera = useRef<CameraRef>(null);
  const favorites = useFavoriteLocations({
    apiUrl: resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined),
    getToken,
    userId,
    feedback,
  });
  const selectedFavorite = favorites.items.find((item) => item.key === favoriteKey);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [initialViewState] = useState<{ center: [number, number]; zoom: number }>(() => {
    const point = locationMapPoint(initial?.longitude, initial?.latitude);
    return { center: point ?? [0, 20], zoom: point ? 13 : 1.5 };
  });
  const [mapReady, setMapReady] = useState(false);
  const [mapActive, setMapActive] = useState(AppState.currentState === "active");
  const selectedPoint = locationMapPoint(selected?.longitude, selected?.latitude);
  useEffect(() => {
    // A native ref exists before its style is usable. Keep only the latest target while loading/paused.
    if (!mapReady || !mapActive || !center) return;
    camera.current?.easeTo({ center, zoom: 14, duration: 500 });
  }, [center, mapReady, mapActive]);

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
        if (!controller.signal.aborted) {
          setResults(body.items.slice(0, 5));
          setError("");
        }
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
      setMapActive(state === "active");
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [t]);

  const moveTo = (longitude: number, latitude: number) => {
    const point = locationMapPoint(longitude, latitude);
    if (!point) {
      setError(t("Location unavailable"));
      return;
    }
    setCenter(point);
  };
  const chooseFavorite = (key: string, location: MatchLocation) => {
    cancelLocate();
    if (!locationMapPoint(location.longitude, location.latitude)) {
      setError(t("Location unavailable"));
      return;
    }
    setError("");
    setSelected(location);
    setFavoriteKey(key);
    setName(location.name);
    setQuery(location.address);
    setResults([]);
    moveTo(location.longitude, location.latitude);
  };
  const locate = async () => {
    cancelLocate();
    const requestId = locationRequest.current;
    setLocating(true);
    setError("");
    let resolvingAddress = false;
    try {
      const position = await requestUserPosition(Location, Linking.openSettings, (permission) => {
        if (requestId === locationRequest.current) setPermission(permission);
      });
      if (requestId !== locationRequest.current) return;
      if (!position) {
        setError(t("Location permission denied"));
        return;
      }
      moveTo(position.coords.longitude, position.coords.latitude);
      setSelected(null);
      setFavoriteKey(null);
      setResults([]);
      setQuery("");
      resolvingAddress = true;
      const address = await lookup(position.coords.longitude, position.coords.latitude);
      if (requestId !== locationRequest.current) return;
      setSelected(address);
      setQuery(address.address);
      moveTo(address.longitude, address.latitude);
    } catch {
      if (requestId === locationRequest.current)
        setError(t(resolvingAddress ? "Could not search addresses" : "Location unavailable"));
    } finally {
      if (requestId === locationRequest.current) setLocating(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{
        padding: 16,
        paddingBottom: Math.max(insets.bottom, 16) + 24,
        gap: 12,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: t("Select location"),
          headerLeft: undefined,
          headerBackVisible: true,
          headerTitle: ({ children }) => <HeaderTitle title={children} icon={MapPin} />,
        }}
      />
      {mapStyle ? (
        <View style={{ height: 240 }}>
          <MapLibreMap
            style={{ flex: 1 }}
            mapStyle={mapStyle}
            androidView="texture"
            onWillStartLoadingMap={() => setMapReady(false)}
            onDidFinishLoadingStyle={() => setMapReady(true)}
            onDidFailLoadingMap={() => {
              setMapReady(false);
              setError(t("Map unavailable"));
            }}
            attribution
            logo
          >
            <Camera ref={camera} initialViewState={initialViewState} />
            {mapReady && selectedPoint && (
              <GeoJSONSource
                id="selected-location"
                data={{
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: selectedPoint },
                }}
              >
                <Layer
                  id="selected-location-point"
                  type="circle"
                  paint={{ "circle-radius": 9, "circle-color": "#006fee" }}
                />
              </GeoJSONSource>
            )}
          </MapLibreMap>
          <Button
            testID="location-map-locate"
            isIconOnly
            size="sm"
            variant="secondary"
            // Leave native map attribution reachable below the GPS control.
            style={{ position: "absolute", right: 12, bottom: 40, minWidth: 44, minHeight: 44 }}
            isDisabled={locating}
            accessibilityLabel={
              !permission.granted && !permission.canAskAgain
                ? t("Open settings")
                : t("Center map on my location")
            }
            onPress={() => void locate()}
          >
            <LocateFixed size={20} color={foreground} />
          </Button>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("Map by MapTiler")}
            onPress={() => void Linking.openURL("https://www.maptiler.com/")}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              padding: 4,
              borderRadius: 4,
              backgroundColor: "#fff",
            }}
          >
            <Image
              source={require("../../../assets/maptiler-logo.png")}
              resizeMode="contain"
              style={{ width: 92, height: 24 }}
            />
          </Pressable>
        </View>
      ) : (
        <Typography className="text-danger">{t("Map unavailable")}</Typography>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MapPin size={18} color={foreground} />
        <Typography className="font-medium text-foreground">{t("Location name")}</Typography>
      </View>
      <Input
        accessibilityLabel={t("Location name")}
        placeholder={t("Location name")}
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Heart size={18} color={foreground} />
        <Typography className="font-medium text-foreground">{t("Favorite locations")}</Typography>
      </View>
      {favorites.list.isPending ? (
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 48, borderRadius: 12 }}
        />
      ) : (
        <Select
          presentation="bottom-sheet"
          onOpenChange={(open) => {
            if (open) Keyboard.dismiss();
          }}
          value={
            selectedFavorite
              ? {
                  value: selectedFavorite.key,
                  label: selectedFavorite.location.name,
                }
              : undefined
          }
          onValueChange={(value) => {
            const item = favorites.items.find((item) => item.key === value?.value);
            if (item) chooseFavorite(item.key, item.location);
          }}
          isDisabled={!favorites.items.length}
        >
          <Select.Trigger
            testID="favorite-location-select"
            accessibilityLabel={t("Favorite locations")}
          >
            <Select.Value
              placeholder={
                favorites.list.isError || favorites.items.length
                  ? t("Select a favorite location")
                  : t("No favorite locations")
              }
            />
            <Select.TriggerIndicator />
          </Select.Trigger>
          <Select.Portal>
            <Select.Overlay />
            <Select.Content
              presentation="bottom-sheet"
              snapPoints={["60%", "85%"]}
              enableDynamicSizing={false}
              bottomInset={insets.bottom}
              topInset={insets.top}
              contentContainerProps={{ style: { flex: 1 } }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Heart size={18} color={foreground} />
                <Select.ListLabel>{t("Favorite locations")}</Select.ListLabel>
              </View>
              <BottomSheetFlatList
                style={{ flex: 1 }}
                data={favorites.items}
                ListEmptyComponent={
                  !favorites.list.isPending && !favorites.list.isError ? (
                    <EmptyList icon={<Heart size={28} color={muted} />}>
                      {t("No favorite locations")}
                    </EmptyList>
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
                keyExtractor={(item) => item.key}
                onEndReachedThreshold={0.5}
                onEndReached={() => {
                  if (
                    favorites.list.hasNextPage &&
                    !favorites.list.isFetchingNextPage &&
                    !favorites.list.isError
                  )
                    void favorites.list.fetchNextPage();
                }}
                renderItem={({ item, index }) => (
                  <Select.Item
                    testID={`favorite-location-${index}`}
                    value={item.key}
                    label={item.location.name}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Select.ItemLabel />
                      <Select.ItemDescription numberOfLines={2}>
                        {formatLocationAddress(item.location.address)}
                      </Select.ItemDescription>
                    </View>
                    <Select.ItemIndicator />
                  </Select.Item>
                )}
                ListFooterComponent={
                  favorites.list.isFetchingNextPage ? (
                    <Skeleton isLoading style={{ width: "100%", height: 48, borderRadius: 12 }} />
                  ) : favorites.list.isError ? (
                    <View style={{ gap: 8 }}>
                      <Typography accessibilityRole="alert" className="text-danger">
                        {t("Could not load favorite locations")}
                      </Typography>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={favorites.list.isFetching}
                        onPress={() => {
                          if (favorites.list.isFetchNextPageError)
                            void favorites.list.fetchNextPage();
                          else void favorites.list.refetch();
                        }}
                      >
                        <Button.Label>{t("Retry")}</Button.Label>
                      </Button>
                    </View>
                  ) : null
                }
              />
            </Select.Content>
          </Select.Portal>
        </Select>
      )}
      {favorites.list.isError && (
        <Typography className="text-danger" accessibilityRole="alert">
          {t("Could not load favorite locations")}
        </Typography>
      )}
      <SearchInput
        value={query}
        onChange={(text) => {
          cancelLocate();
          setQuery(text);
          setSelected(null);
          setFavoriteKey(null);
          setResults([]);
        }}
        testID="location-address-input"
        label={t("Search address")}
        placeholder={t("Search address")}
      />
      {(searching || locating) && (
        <Skeleton
          isLoading
          variant="pulse"
          style={{ width: "100%", height: 48, borderRadius: 12 }}
        />
      )}
      {!searching &&
      !locating &&
      !error &&
      query.trim().length >= 4 &&
      selected?.address !== query.trim() &&
      results.length === 0 ? (
        <EmptyList icon={<MapPin size={28} color={muted} />}>{t("No addresses found")}</EmptyList>
      ) : null}
      {results.length > 0 && (
        <View accessibilityLabel={t("Address results")}>
          {results.map((item, index) => (
            <Pressable
              key={item.id}
              testID={`address-result-${index}`}
              accessibilityRole="button"
              accessibilityLabel={item.address}
              onPress={() => {
                cancelLocate();
                setSelected(item);
                setFavoriteKey(null);
                setResults([]);
                setQuery(item.address);
                moveTo(item.longitude, item.latitude);
              }}
              style={{ padding: 12 }}
            >
              <Typography className="text-foreground" numberOfLines={2}>
                {formatLocationAddress(item.address)}
              </Typography>
            </Pressable>
          ))}
        </View>
      )}
      {error ? (
        <Typography className="text-danger" accessibilityRole="alert">
          {error}
        </Typography>
      ) : null}
      <Button
        variant="primary"
        isDisabled={locating || !mapStyle || !selected || !selectedPoint || name.trim().length < 4}
        onPress={() => {
          if (!selected || !selectedPoint || name.trim().length < 4) return;
          const location: MatchLocation = {
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
            timeZone: selected.timeZone,
          };
          if (onSelect) onSelect(location);
          else {
            setPendingLocation(slotId, location);
            router.back();
          }
        }}
      >
        <Check size={20} color={accentForeground} />
        <Button.Label>{t("Confirm location")}</Button.Label>
      </Button>
    </ScrollView>
  );
}
