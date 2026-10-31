import { type MatchLocation, matchLocationSchema } from "@board-game-organizer/schemas";
import {
  formatLocationAddress,
  resolveApiUrl,
  useCurrentLocationAddress,
  useFavoriteLocations,
  withProtectionBypass,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
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
import { useHeaderHeight, usePreventRemove } from "expo-router/react-navigation";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, LocateFixed, MapPin } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { useT } from "@/lib/i18n";
import { locationMapPoint } from "@/lib/locations/map-location";
import { requestUserPosition } from "@/lib/locations/user-location";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { useSessionAuth } from "@/lib/useSessionAuth";
import { LocationFavoriteSelect } from "./LocationFavoriteSelect";

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
  const headerHeight = useHeaderHeight();
  const resultsList = useRef<FlatList<Result>>(null);
  const addressFocused = useRef(false);
  const [searchMode, setSearchMode] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => {
      if (addressFocused.current) setSearchMode(true);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      setSearchMode(false);
      resultsList.current?.scrollToOffset({ offset: 0, animated: false });
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
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
    Keyboard.dismiss();
    addressFocused.current = false;
    setSearchMode(false);
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen
        options={{
          title: t("Select location"),
          headerLeft: undefined,
          headerBackVisible: true,
          headerTitle: ({ children }) => <HeaderTitle title={children} icon={MapPin} />,
        }}
      />
      <FlatList
        ref={resultsList}
        style={{ flex: 1 }}
        data={results}
        keyExtractor={(item) => item.id}
        accessibilityLabel={t("Address results")}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        contentInsetAdjustmentBehavior="never"
        // Keep the native map attached when its header scrolls out of view.
        removeClippedSubviews={false}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: searchMode ? 16 : Math.max(insets.bottom, 16) + 24,
          gap: 4,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {mapStyle ? (
              <View
                collapsable={false}
                style={{
                  height: 240,
                  width: "100%",
                  top: 0,
                  left: 0,
                  position: searchMode ? "absolute" : "relative",
                  opacity: searchMode ? 0 : 1,
                }}
                pointerEvents={searchMode ? "none" : "auto"}
                accessibilityElementsHidden={searchMode}
                importantForAccessibility={searchMode ? "no-hide-descendants" : "auto"}
              >
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
                  style={{
                    position: "absolute",
                    right: 12,
                    bottom: 40,
                    minWidth: 44,
                    minHeight: 44,
                  }}
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
              <Typography style={{ display: searchMode ? "none" : "flex" }} className="text-danger">
                {t("Map unavailable")}
              </Typography>
            )}
            <View
              style={{ gap: 12, display: searchMode ? "none" : "flex" }}
              accessibilityElementsHidden={searchMode}
              importantForAccessibility={searchMode ? "no-hide-descendants" : "auto"}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MapPin size={18} color={foreground} />
                <Typography className="font-medium text-foreground">
                  {t("Location name")}
                </Typography>
              </View>
              <Input
                accessibilityLabel={t("Location name")}
                placeholder={t("Location name")}
                value={name}
                onChangeText={setName}
                maxLength={120}
              />
              <LocationFavoriteSelect
                favorites={favorites}
                selectedKey={favoriteKey}
                onSelect={chooseFavorite}
              />
            </View>
            <View
              onLayout={() => {
                if (searchMode) resultsList.current?.scrollToOffset({ offset: 0, animated: false });
              }}
            >
              <SearchInput
                value={query}
                onFocus={() => {
                  addressFocused.current = true;
                  setSearchMode(true);
                }}
                onBlur={() => {
                  addressFocused.current = false;
                }}
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
            </View>
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
              <EmptyList icon={<MapPin size={28} color={muted} />}>
                {t("No addresses found")}
              </EmptyList>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            testID={`address-result-${index}`}
            accessibilityRole="button"
            accessibilityLabel={item.address}
            onPress={() => {
              cancelLocate();
              Keyboard.dismiss();
              addressFocused.current = false;
              setSearchMode(false);
              resultsList.current?.scrollToOffset({ offset: 0, animated: false });
              setSelected(item);
              setFavoriteKey(null);
              setResults([]);
              setQuery(item.address);
              moveTo(item.longitude, item.latitude);
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 }}
          >
            <Typography className="text-foreground" numberOfLines={2}>
              {formatLocationAddress(item.address)}
            </Typography>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {error ? (
              <Typography className="text-danger" accessibilityRole="alert">
                {error}
              </Typography>
            ) : null}
            <View
              style={{ display: searchMode ? "none" : "flex" }}
              accessibilityElementsHidden={searchMode}
              importantForAccessibility={searchMode ? "no-hide-descendants" : "auto"}
            >
              <Button
                variant="primary"
                isDisabled={
                  locating || !mapStyle || !selected || !selectedPoint || name.trim().length < 4
                }
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
            </View>
          </View>
        }
      />
      {searchMode && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom,
          }}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("Map by MapTiler")}
            onPress={() => void Linking.openURL("https://www.maptiler.com/")}
            style={{
              minHeight: 44,
              minWidth: 44,
              justifyContent: "center",
              padding: 4,
              backgroundColor: "#fff",
              borderRadius: 4,
            }}
          >
            <Image
              source={require("../../../assets/maptiler-logo.png")}
              resizeMode="contain"
              style={{ width: 92, height: 24 }}
            />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("© OpenStreetMap contributors")}
            onPress={() => void Linking.openURL("https://www.openstreetmap.org/copyright")}
            style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
          >
            <Typography className="text-xs text-foreground">
              {t("© OpenStreetMap contributors")}
            </Typography>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
