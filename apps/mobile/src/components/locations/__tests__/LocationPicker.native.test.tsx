import { createRequire } from "node:module";
import type { FavoriteLocation, MatchLocation } from "@board-game-organizer/schemas";
import { locationFavoriteKey, matchLocationSchema } from "@board-game-organizer/schemas";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { type ReactNode, type Ref, useImperativeHandle } from "react";
import {
  AppState,
  type AppStateStatus,
  type FlatList,
  Keyboard,
  Linking,
  View,
} from "react-native";
import { Uniwind } from "uniwind";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  NativeStackHeader,
  nativeStackOptionsSnapshot,
  resetNativeStackOptionsPort,
} from "@/test/nativeStackOptionsPort";
import LocationPicker from "../LocationPicker";

const headerPaths = () =>
  screen
    .getByTestId("native-stack-header")
    .queryAll((node) => node.type === "RNSVGPath")
    .map((node) => node.props.d);

const API = "https://location-fixtures.test";
const boundary = vi.hoisted(() => ({
  back: vi.fn(),
  easeTo: vi.fn(),
  params: { slotId: "venue-slot", initial: undefined as string | undefined },
  getToken: vi.fn(),
  tokenValue: "fixture-session-token" as string | null,
  permission: { granted: false, canAskAgain: true },
  grantOnRequest: false,
  permissions: vi.fn(),
  requestPermission: vi.fn(),
  position: vi.fn(),
  prevented: undefined as (() => void) | undefined,
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "session-owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-router", async () => ({
  useRouter: () => ({ back: boundary.back }),
  useLocalSearchParams: () => boundary.params,
  Stack: { Screen: (await import("@/test/nativeStackOptionsPort")).NativeStackScreen },
}));
vi.mock("expo-router/react-navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("expo-router/react-navigation")>()),
  usePreventRemove: (enabled: boolean, callback: () => void) => {
    boundary.prevented = enabled ? callback : undefined;
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: "https://location-fixtures.test", maptilerApiKey: "fixture-public-map-key" },
    },
  },
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: boundary.permissions,
  requestForegroundPermissionsAsync: boundary.requestPermission,
  getCurrentPositionAsync: boundary.position,
}));
// MapLibre is an external native/GPU boundary. The application picker, all
// HeroUI controls, real inputs, favorites and Query hooks remain unchanged.
// These hosts expose only public SDK events and the imperative camera command.
vi.mock("@maplibre/maplibre-react-native", () => ({
  Map: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <View {...props} testID="native-map-boundary">
      {children}
    </View>
  ),
  Camera: ({
    ref,
    initialViewState,
  }: {
    ref?: Ref<{ easeTo: typeof boundary.easeTo }>;
    initialViewState?: unknown;
  }) => {
    useImperativeHandle(ref, () => ({ easeTo: boundary.easeTo }), []);
    const props = { initialViewState };
    return <View {...props} testID="native-camera-boundary" />;
  },
  GeoJSONSource: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <View {...props} testID="native-location-source">
      {children}
    </View>
  ),
  Layer: (props: Record<string, unknown>) => <View {...props} testID="native-location-layer" />,
}));

const venue: MatchLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Games club",
  address: "Via Roma 1, Rome, Italy",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};
type Result = Pick<MatchLocation, "address" | "longitude" | "latitude" | "timeZone"> & {
  id: string;
};
const places: Result[] = Array.from({ length: 7 }, (_, index) => ({
  id: `verified-place-${index}`,
  address: `Verified venue ${index + 1}, Rome, Italy`,
  longitude: 12.5 + index / 100,
  latitude: 41.9 + index / 100,
  timeZone: "Europe/Rome",
}));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let client: QueryClient;
let favorites: FavoriteLocation[];
let favoriteStatus = 200;
let searchStatus = 200;
let searchItems: Result[];
let reverseItems: Result[];
let pendingSearch: Promise<Response> | undefined;
let pendingReverse: Promise<Response> | undefined;
const searches: {
  query: string;
  authorization: string | null;
  signal: AbortSignal | null | undefined;
}[] = [];
const appListeners = new Set<(state: AppStateStatus) => void>();
const originalAppState = Object.getOwnPropertyDescriptor(AppState, "currentState");

beforeEach(() => {
  vi.clearAllMocks();
  resetNativeStackOptionsPort();
  useAppStore.getState().clearPending();
  boundary.params = { slotId: "venue-slot", initial: undefined };
  boundary.prevented = undefined;
  boundary.tokenValue = "fixture-session-token";
  boundary.getToken.mockImplementation(async () => boundary.tokenValue);
  boundary.permission = { granted: false, canAskAgain: true };
  boundary.grantOnRequest = false;
  boundary.permissions.mockImplementation(async () => boundary.permission);
  boundary.requestPermission.mockImplementation(async () => {
    boundary.permission = { granted: boundary.grantOnRequest, canAskAgain: true };
    return boundary.permission;
  });
  boundary.position.mockResolvedValue({ coords: { longitude: 12.5, latitude: 41.9 } });
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    writable: true,
    value: "active",
  });
  appListeners.clear();
  vi.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    const callback = listener as (state: AppStateStatus) => void;
    appListeners.add(callback);
    return { remove: () => appListeners.delete(callback) };
  });
  favorites = [];
  favoriteStatus = 200;
  searchStatus = 200;
  searchItems = places;
  reverseItems = [places[0]];
  pendingSearch = undefined;
  pendingReverse = undefined;
  searches.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      if (url.pathname === "/api/locations/favorites")
        return json(
          favoriteStatus === 200
            ? { items: favorites, nextCursor: null }
            : { error: "Favorite service unavailable" },
          favoriteStatus,
        );
      if (url.pathname !== "/api/locations/search")
        throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
      const query = url.searchParams.get("query") ?? "";
      searches.push({
        query,
        authorization: new Headers(init?.headers).get("authorization"),
        signal: init?.signal,
      });
      const reverse = /^-?\d+\.\d+,-?\d+\.\d+$/.test(query);
      if (reverse && pendingReverse) return pendingReverse;
      if (!reverse && pendingSearch) return pendingSearch;
      return json({ items: reverse ? reverseItems : searchItems }, searchStatus);
    }),
  );
});
afterEach(() => {
  client.clear();
  useAppStore.getState().clearPending();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalAppState) Object.defineProperty(AppState, "currentState", originalAppState);
});

function Fixture({
  showHeader,
  canGoBack,
  ...props
}: Parameters<typeof LocationPicker>[0] & { showHeader?: boolean; canGoBack?: boolean } = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <LocationPicker {...props} />
        {showHeader ? <NativeStackHeader canGoBack={canGoBack} /> : null}
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function search(text = "Rome") {
  await fireEvent.changeText(screen.getByTestId("location-address-input"), text);
  return screen.findByTestId("address-result-0");
}
async function choose(index = 0) {
  const result = await screen.findByTestId(`address-result-${index}`);
  await userEvent.setup().press(result);
}
async function confirm() {
  await userEvent.setup().press(screen.getByRole("button", { name: "Confirm Location" }));
}
async function mapReady() {
  await fireEvent(screen.getByTestId("native-map-boundary"), "didFinishLoadingStyle");
}
async function appState(state: AppStateStatus) {
  await act(() => {
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      writable: true,
      value: state,
    });
    for (const callback of appListeners) callback(state);
  });
}

it("preserves the native map/form controls while searching and caps verified source results at five", async () => {
  await render(<Fixture />);
  const map = screen.getByTestId("native-map-boundary");
  expect(screen.getByTestId("native-camera-boundary").props.initialViewState).toEqual({
    center: [0, 20],
    zoom: 1.5,
  });
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Rom");
  expect(searches).toHaveLength(0);
  await search("  Rome  ");
  expect(searches.map((item) => item.query)).toEqual(["Rome"]);
  for (let index = 0; index < 5; index++) {
    const result = screen.getByTestId(`address-result-${index}`);
    expect(result).toBeVisible();
    expect(screen.getByRole("button", { name: places[index].address })).toBe(result);
    expect(within(result).getAllByText(`Verified venue ${index + 1}, Rome`)).toHaveLength(1);
    expect(within(result).queryByText(places[index].address)).toBeNull();
    expect(result.parent?.queryAll((node) => node.type === "RNSVGPath").length).toBeGreaterThan(0);
  }
  expect(screen.queryByTestId("address-result-5")).toBeNull();
  expect(screen.getByTestId("native-map-boundary")).toBe(map);
  expect(screen.getByRole("button", { name: "Center map on my location" })).toBeVisible();
  expect(screen.getByLabelText("Location name")).toBeVisible();
  expect(screen.getByTestId("favorite-location-select")).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm Location" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Map by MapTiler" })).toBeVisible();
});

it("requires a valid name and a verified address before returning a trimmed valid location", async () => {
  const onSelect = vi.fn();
  await render(<Fixture onSelect={onSelect} />);
  await confirm();
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByText("Enter a location name between 4 and 120 characters.")).toBeVisible();
  expect(screen.getByText("Choose a verified address.")).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText("Location name"), "  Games venue  ");
  await search();
  await choose();
  expect(screen.queryByTestId("address-result-0")).toBeNull();
  expect(screen.getByTestId("location-address-input")).toHaveDisplayValue(places[0].address);
  await confirm();
  expect(onSelect).toHaveBeenCalledOnce();
  const value = onSelect.mock.calls[0][0];
  expect(matchLocationSchema.safeParse(value).success).toBe(true);
  expect(value).toMatchObject({
    name: "Games venue",
    address: places[0].address,
    longitude: places[0].longitude,
    latitude: places[0].latitude,
    timeZone: places[0].timeZone,
  });
  expect(boundary.back).not.toHaveBeenCalled();
});

it.each(["abc", " ", "a".repeat(121)])(
  "does not accept an invalid prefilled venue name (%s)",
  async (name) => {
    const onSelect = vi.fn();
    await render(<Fixture initial={{ ...venue, name }} onSelect={onSelect} />);
    await confirm();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a location name between 4 and 120 characters.")).toBeVisible();
  },
);

it("preserves an edited location ID and dispatches standalone results through the actual local store", async () => {
  boundary.params.initial = JSON.stringify(venue);
  await render(<Fixture />);
  expect(screen.getByLabelText("Location name")).toHaveDisplayValue(venue.name);
  expect(screen.getByTestId("native-camera-boundary").props.initialViewState).toEqual({
    center: [venue.longitude, venue.latitude],
    zoom: 13,
  });
  await confirm();
  expect(useAppStore.getState().pendingLocation).toEqual({ slotId: "venue-slot", location: venue });
  expect(boundary.back).toHaveBeenCalledOnce();
});

it.each(["{", JSON.stringify({ name: "Incomplete" })])(
  "rejects malformed route initial data (%s)",
  async (initial) => {
    boundary.params.initial = initial;
    const close = vi.fn();
    await render(<Fixture onClose={close} />);
    expect(screen.getByLabelText("Location name")).toHaveDisplayValue("");
    expect(screen.getByTestId("location-address-input")).toHaveDisplayValue("");
    if (!boundary.prevented) throw new Error("Expected the Expo navigation removal guard");
    await act(() => boundary.prevented?.());
    expect(close).toHaveBeenCalledOnce();
    expect(boundary.back).not.toHaveBeenCalled();
  },
);

it("does not confirm free text or an invalid coordinate response, and clears selection when the address changes", async () => {
  const onSelect = vi.fn();
  await render(<Fixture initial={venue} onSelect={onSelect} />);
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "New address");
  await confirm();
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByText("Choose a verified address.")).toBeVisible();
  await screen.findByTestId("address-result-0");
  await choose();
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Another address");
  await confirm();
  expect(onSelect).not.toHaveBeenCalled();
  searchItems = [{ ...places[0], latitude: 200 }];
  await search("Invalid coordinates");
  await choose();
  expect(screen.getByText("Location unavailable")).toBeVisible();
  await confirm();
  expect(onSelect).not.toHaveBeenCalled();
});

it("reports empty and failed search results, then recovers on the next search with a fresh session token", async () => {
  searchItems = [];
  await render(<Fixture />);
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Empty place");
  expect(await screen.findByText("No addresses found")).toBeVisible();
  searchStatus = 503;
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Failed place");
  expect(await screen.findByText("Could not search addresses")).toBeVisible();
  searchStatus = 200;
  searchItems = places;
  boundary.tokenValue = "rotated-fixture-token";
  await search("Recovered place");
  expect(screen.queryByText("Could not search addresses")).toBeNull();
  expect(searches.at(-1)?.authorization).toBe("Bearer rotated-fixture-token");
});

it("aborts stale forward searches instead of restoring results after the query is cleared", async () => {
  let finish: (response: Response) => void = () => {};
  pendingSearch = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Pending place");
  await waitFor(() => expect(searches).toHaveLength(1));
  const signal = searches[0].signal;
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear search" }));
  expect(signal?.aborted).toBe(true);
  await act(() => finish(json({ items: places })));
  expect(screen.queryByTestId("address-result-0")).toBeNull();
  expect(screen.getByTestId("location-address-input")).toHaveDisplayValue("");
});

it("queues the latest selected camera target until the style is ready and the app is active", async () => {
  await render(<Fixture />);
  await search();
  await choose(1);
  expect(boundary.easeTo).not.toHaveBeenCalled();
  await mapReady();
  expect(boundary.easeTo).toHaveBeenLastCalledWith({
    center: [places[1].longitude, places[1].latitude],
    zoom: 14,
    duration: 500,
  });
  expect(screen.getByTestId("native-location-source").props.data.geometry.coordinates).toEqual([
    places[1].longitude,
    places[1].latitude,
  ]);
  await appState("background");
  boundary.easeTo.mockClear();
  await search("Other place");
  await choose(2);
  expect(boundary.easeTo).not.toHaveBeenCalled();
  await appState("active");
  expect(boundary.easeTo).toHaveBeenCalledExactlyOnceWith({
    center: [places[2].longitude, places[2].latitude],
    zoom: 14,
    duration: 500,
  });
  await fireEvent(screen.getByTestId("native-map-boundary"), "willStartLoadingMap");
  await fireEvent(screen.getByTestId("native-map-boundary"), "didFailLoadingMap");
  expect(screen.getByText("Map unavailable")).toBeVisible();
});

it("requests foreground consent explicitly and uses the verified reverse lookup before confirmation", async () => {
  boundary.grantOnRequest = true;
  const onSelect = vi.fn();
  await render(<Fixture onSelect={onSelect} />);
  expect(boundary.requestPermission).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Location name"), "GPS venue");
  await userEvent.setup().press(screen.getByTestId("location-map-locate"));
  await waitFor(() =>
    expect(screen.getByTestId("location-address-input")).toHaveDisplayValue(places[0].address),
  );
  expect(boundary.requestPermission).toHaveBeenCalledOnce();
  expect(boundary.position).toHaveBeenCalledOnce();
  expect(searches.some((item) => item.query === "12.5000000,41.9000000")).toBe(true);
  await confirm();
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "GPS venue",
      address: places[0].address,
      timeZone: "Europe/Rome",
    }),
  );
});

it("explains denied GPS permission and opens settings only when the OS can no longer ask", async () => {
  const settings = vi.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await render(<Fixture />);
  await userEvent.setup().press(screen.getByTestId("location-map-locate"));
  expect(await screen.findByText("Location permission denied")).toBeVisible();
  expect(boundary.position).not.toHaveBeenCalled();
  expect(settings).not.toHaveBeenCalled();
  boundary.permission = { granted: false, canAskAgain: false };
  await appState("active");
  expect(screen.getByRole("button", { name: "Open settings" })).toBeEnabled();
  await userEvent.setup().press(screen.getByTestId("location-map-locate"));
  expect(settings).toHaveBeenCalledOnce();
  boundary.permission = { granted: true, canAskAgain: false };
  await appState("active");
  await waitFor(() => expect(screen.queryByText("Location permission denied")).toBeNull());
});

it.each(["position", "reverse"] as const)(
  "reports an unavailable %s service without fabricating a selection",
  async (stage) => {
    boundary.permission = { granted: true, canAskAgain: true };
    if (stage === "position")
      boundary.position.mockRejectedValue(new Error("Fixture GPS unavailable"));
    else reverseItems = [];
    await render(<Fixture />);
    await userEvent.setup().press(screen.getByTestId("location-map-locate"));
    expect(
      await screen.findByText(
        stage === "position" ? "Location unavailable" : "Could not search addresses",
      ),
    ).toBeVisible();
    expect(screen.getByTestId("location-address-input")).toHaveDisplayValue("");
  },
);

it("rejects a late GPS position after the user starts a new address search", async () => {
  boundary.permission = { granted: true, canAskAgain: true };
  let finish: (value: { coords: { longitude: number; latitude: number } }) => void = () => {};
  boundary.position.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render(<Fixture />);
  await userEvent.setup().press(screen.getByTestId("location-map-locate"));
  expect(screen.getByTestId("location-map-locate")).toBeDisabled();
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Manual choice");
  await act(() => finish({ coords: { longitude: 12.5, latitude: 41.9 } }));
  expect(screen.getByTestId("location-address-input")).toHaveDisplayValue("Manual choice");
  expect(screen.getByTestId("location-map-locate")).toBeEnabled();
  expect(searches.some((item) => item.query === "12.5000000,41.9000000")).toBe(false);
});

it("cancels pending reverse lookup on unmount and rejects its late address", async () => {
  boundary.permission = { granted: true, canAskAgain: true };
  let finish: (response: Response) => void = () => {};
  pendingReverse = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const onSelect = vi.fn();
  const view = await render(<Fixture onSelect={onSelect} />);
  await userEvent.setup().press(screen.getByTestId("location-map-locate"));
  await waitFor(() => expect(searches).toHaveLength(1));
  const signal = searches[0].signal;
  await view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(() => finish(json({ items: [places[0]] })));
  expect(onSelect).not.toHaveBeenCalled();
  expect(appListeners.size).toBe(0);
});

it("rejects malformed favorite coordinates without replacing the existing native selection", async () => {
  favorites = [{ key: "corrupt-favorite", location: { ...venue, longitude: Number.NaN } }];
  const onSelect = vi.fn();
  await render(<Fixture initial={venue} onSelect={onSelect} />);
  await mapReady();
  const point = screen.getByTestId("native-location-source").props.data;
  await waitFor(() => expect(screen.getByTestId("favorite-location-select")).toBeEnabled());
  const user = userEvent.setup();
  await user.press(screen.getByTestId("favorite-location-select"));
  await user.press(await screen.findByTestId("favorite-location-0"));
  expect(await screen.findByText("Location unavailable")).toBeVisible();
  expect(screen.getByLabelText("Location name")).toHaveDisplayValue(venue.name);
  expect(screen.getByTestId("native-location-source").props.data).toEqual(point);
  expect(screen.getByTestId("favorite-location-select")).toHaveTextContent(
    "Select a favorite location",
  );
  expect(boundary.easeTo).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it("selects canonical favorites through the real favorite selector and preserves verified coordinates", async () => {
  favorites = [{ key: locationFavoriteKey(venue), location: venue }];
  const onSelect = vi.fn();
  await render(<Fixture onSelect={onSelect} />);
  await waitFor(() => expect(screen.getByTestId("favorite-location-select")).toBeEnabled());
  await userEvent.setup().press(screen.getByTestId("favorite-location-select"));
  await userEvent.setup().press(await screen.findByTestId("favorite-location-0"));
  expect(screen.getByLabelText("Location name")).toHaveDisplayValue(venue.name);
  expect(screen.getByTestId("location-address-input")).toHaveDisplayValue(venue.address);
  await confirm();
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      name: venue.name,
      address: venue.address,
      longitude: venue.longitude,
      latitude: venue.latitude,
      timeZone: venue.timeZone,
    }),
  );
});

it("replaces a selected favorite with a verified search result, dismisses the keyboard and resets the real native list", async () => {
  favorites = [{ key: locationFavoriteKey(venue), location: venue }];
  const onSelect = vi.fn();
  // Uniwind's public FlatList is a forwardRef wrapper. Observe the installed raw
  // SDK class reached by its real ref, preserving the application's styled list.
  const require = createRequire(import.meta.url);
  const nativeList: { default: typeof FlatList } = require(
    require.resolve("react-native/Libraries/Lists/FlatList"),
  );
  const dismiss = vi.spyOn(Keyboard, "dismiss");
  const scroll = vi.spyOn(nativeList.default.prototype, "scrollToOffset");
  await render(<Fixture onSelect={onSelect} />);
  await waitFor(() => expect(screen.getByTestId("favorite-location-select")).toBeEnabled());
  await userEvent.setup().press(screen.getByTestId("favorite-location-select"));
  await userEvent.setup().press(await screen.findByTestId("favorite-location-0"));
  expect(screen.getByTestId("favorite-location-select")).toHaveTextContent(venue.name);
  await mapReady();
  await search("Other verified venue");
  expect(screen.getByTestId("favorite-location-select")).toHaveTextContent(
    "Select a favorite location",
  );
  expect(screen.getByTestId("location-address-input")).toHaveDisplayValue("Other verified venue");
  expect(onSelect).not.toHaveBeenCalled();
  dismiss.mockClear();
  scroll.mockClear();
  boundary.easeTo.mockClear();
  await choose(1);
  expect(dismiss).toHaveBeenCalledOnce();
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ offset: 0, animated: false });
  expect(screen.getByTestId("location-address-input")).toHaveDisplayValue(places[1].address);
  expect(screen.queryByTestId("address-result-0")).toBeNull();
  expect(screen.queryByTestId("address-result-1")).toBeNull();
  expect(screen.getByTestId("favorite-location-select")).toHaveTextContent(
    "Select a favorite location",
  );
  expect(boundary.easeTo).toHaveBeenCalledExactlyOnceWith({
    center: [places[1].longitude, places[1].latitude],
    zoom: 14,
    duration: 500,
  });
  expect(onSelect).not.toHaveBeenCalled();
  await confirm();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      name: venue.name,
      address: places[1].address,
      longitude: places[1].longitude,
      latitude: places[1].latitude,
      timeZone: places[1].timeZone,
    }),
  );
});

it("keeps failed favorites observable without blocking address search and never opens external map credits implicitly", async () => {
  favoriteStatus = 503;
  const external = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  await render(<Fixture />);
  const failures = await screen.findAllByText("Could not load favorite locations");
  expect(failures[0]).toBeVisible();
  expect(screen.getByTestId("favorite-location-select")).toBeDisabled();
  await search();
  expect(external).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("link", { name: "Map by MapTiler" }));
  expect(external).toHaveBeenCalledExactlyOnceWith("https://www.maptiler.com/");
});

it("uses the actual merged location header Back control only when the native stack can go back, with inline removal guarded", async () => {
  const view = await render(<Fixture showHeader canGoBack={false} />);
  expect(screen.getByRole("header", { name: "Select location" })).toBeVisible();
  expect(headerPaths()).toContain(
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
  );
  expect(nativeStackOptionsSnapshot().headerBackVisible).toBe(false);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(boundary.prevented).toBeUndefined();
  await view.rerender(<Fixture showHeader />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
  expect(boundary.back).toHaveBeenCalledOnce();
  expect(useAppStore.getState().pendingLocation).toBeNull();
  const close = vi.fn();
  await view.rerender(<Fixture showHeader onClose={close} />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
  expect(boundary.back).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
  if (!boundary.prevented) throw new Error("Expected native inline removal callback");
  // Native navigation dispatches beforeRemove after header Back; deliver that SDK event.
  await act(() => boundary.prevented?.());
  expect(close).toHaveBeenCalledOnce();
  expect(useAppStore.getState().pendingLocation).toBeNull();
});

it("keeps a lost session's address query local and permits a later authenticated search", async () => {
  boundary.tokenValue = null;
  const onSelect = vi.fn();
  await render(<Fixture onSelect={onSelect} />);
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Unauthenticated place");
  expect(await screen.findByText("Could not search addresses")).toBeVisible();
  expect(searches).toHaveLength(0);
  expect(screen.queryByTestId("address-result-0")).toBeNull();
  await confirm();
  expect(onSelect).not.toHaveBeenCalled();

  boundary.tokenValue = "reconnected-address-token";
  await search("Reconnected place");
  expect(screen.queryByText("Could not search addresses")).toBeNull();
  expect(searches).toEqual([
    expect.objectContaining({
      query: "Reconnected place",
      authorization: "Bearer reconnected-address-token",
    }),
  ]);
});

it("switches the native map style with the app theme without dropping a verified location draft", async () => {
  const onSelect = vi.fn();
  try {
    await act(() => Uniwind.setTheme("light"));
    await render(<Fixture initial={venue} onSelect={onSelect} />);
    const map = screen.getByTestId("native-map-boundary");
    expect(map).toHaveProp(
      "mapStyle",
      "https://api.maptiler.com/maps/streets-v4/style.json?key=fixture-public-map-key",
    );
    await act(() => Uniwind.setTheme("dark"));
    expect(map).toHaveProp(
      "mapStyle",
      "https://api.maptiler.com/maps/streets-v4-dark/style.json?key=fixture-public-map-key",
    );
    expect(screen.getByLabelText("Location name")).toHaveDisplayValue(venue.name);
    await confirm();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(venue);
  } finally {
    await act(() => Uniwind.setTheme("light"));
  }
});
