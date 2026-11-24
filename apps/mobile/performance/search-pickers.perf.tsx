import {
  type BggPickerItem,
  type BggThingResponse,
  locationFavoriteKey,
  type MatchLocation,
  matchLocationSchema,
} from "@board-game-organizer/schemas";
import { useAppStore } from "@board-game-organizer/store";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { DeviceEventEmitter, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GamePicker from "@/components/games/GamePicker";
import LocationPicker from "@/components/locations/LocationPicker";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-search-pickers-perf.test",
  token: async () => "picker-fixture-token",
  back: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "search-picker-fixture-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: boundary.apiUrl, maptilerApiKey: "fixture-public-map-key" } },
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: boundary.back }),
  useLocalSearchParams: () => ({ slotId: "picker-perf-slot" }),
  Stack: { Screen: () => null },
}));
vi.mock("expo-router/react-navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("expo-router/react-navigation")>()),
  usePreventRemove: () => {},
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
}));
vi.mock("@maplibre/maplibre-react-native", () => ({
  Map: View,
  Camera: View,
  GeoJSONSource: View,
  Layer: View,
}));

const completeGame: BggPickerItem = {
  id: 1,
  name: "Strategy game",
  imageUrl: null,
  year: 2020,
  average: 8.5,
  rank: 2,
  minPlayMinutes: 30,
  maxPlayMinutes: 60,
  averageWeight: 2.5,
  suggestedPlayers: {
    totalVotes: 3,
    rows: [
      { players: 2, orMore: false, best: 2, recommended: 1, notRecommended: 0, sampleCount: 3 },
    ],
    fetchedAt: "2030-06-01T10:00:00.000Z",
  },
  categories: ["Abstract Strategy"],
  source: "search",
};
const favorite: MatchLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Games club",
  address: "Via Roma 1, Rome, Italy",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};
const place = {
  id: "verified-address",
  address: "Via Milano 1, Rome, Italy",
  longitude: 12.56,
  latitude: 41.92,
  timeZone: "Europe/Rome",
};

function mockReads() {
  const reads = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      expect(url.origin).toBe(boundary.apiUrl);
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer picker-fixture-token");
      reads(url.pathname, url.searchParams.get("query"));
      if (url.pathname === "/api/bgg/account") {
        return Response.json({ active: null, pending: null });
      }
      if (url.pathname === "/api/bgg/picker") {
        return Response.json({ items: [completeGame], nextCursor: null, sourceEpoch: "catalog" });
      }
      if (url.pathname === "/api/locations/favorites") {
        return Response.json({
          items: [{ key: locationFavoriteKey(favorite), location: favorite }],
          nextCursor: null,
        });
      }
      if (url.pathname === "/api/locations/search") return Response.json({ items: [place] });
      throw new Error(`Unexpected picker request: ${url.pathname}`);
    }),
  );
  return reads;
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  };
}

beforeEach(installNativePopoverMeasurements);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("GamePicker: search, open the actual catalog information and choose one canonical game", async () => {
  const client = createClient();
  const reads = mockReads();
  const select = vi.fn<(item: BggThingResponse) => void>();
  try {
    const measured = await measureRenders(<GamePicker onSelect={select} />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        boundary.back.mockClear();
        select.mockClear();
        reads.mockClear();
        useAppStore.getState().clearPending();
      },
      scenario: async () => {
        const input = screen.getByTestId("game-search-input");
        await fireEvent.changeText(input, "Str");
        expect(reads.mock.calls.some(([path]) => path === "/api/bgg/picker")).toBe(false);
        await fireEvent.changeText(input, "  Strategy  ");
        const selectGame = await screen.findByRole("button", { name: "Select: Strategy game" });
        expect(reads).toHaveBeenCalledWith("/api/bgg/picker", "Strategy");
        expect(select).not.toHaveBeenCalled();
        await pressMeasuredPopover(
          screen.getByRole("button", { name: "Game information: Strategy game" }),
        );
        expect(await screen.findByText("8.50")).toBeVisible();
        expect(screen.getByText("Abstract Strategy")).toBeVisible();
        expect(screen.getByText("2.5/5")).toBeVisible();
        await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
        expect(screen.queryByText("Abstract Strategy")).toBeNull();
        const user = userEvent.setup();
        await user.press(selectGame);
        await user.press(selectGame);
        expect(select).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ id: 1, name: "Strategy game", average: 8.5, rank: 2 }),
        );
        expect(useAppStore.getState().pendingGame).toBeNull();
        expect(boundary.back).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
    useAppStore.getState().clearPending();
  }
});

it("LocationPicker: replace a favorite with a verified address and confirm one valid venue", async () => {
  const client = createClient();
  const reads = mockReads();
  const submit = vi.fn<(value: MatchLocation) => void>();
  try {
    const measured = await measureRenders(<LocationPicker onSelect={submit} />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        reads.mockClear();
        submit.mockClear();
        boundary.back.mockClear();
      },
      scenario: async () => {
        const favoriteSelect = await screen.findByTestId("favorite-location-select");
        await waitFor(() => expect(favoriteSelect).toBeEnabled());
        const user = userEvent.setup();
        await user.press(favoriteSelect);
        await user.press(await screen.findByTestId("favorite-location-0"));
        expect(screen.getByLabelText("Location name")).toHaveDisplayValue(favorite.name);
        expect(screen.getByTestId("location-address-input")).toHaveDisplayValue(favorite.address);
        await fireEvent.changeText(screen.getByTestId("location-address-input"), "  Milano  ");
        await user.press(await screen.findByTestId("address-result-0"));
        expect(reads).toHaveBeenCalledWith("/api/locations/search", "Milano");
        expect(screen.getByTestId("location-address-input")).toHaveDisplayValue(place.address);
        expect(screen.queryByTestId("address-result-0")).toBeNull();
        expect(submit).not.toHaveBeenCalled();
        const confirm = screen.getByRole("button", { name: "Confirm Location" });
        expect(confirm).toBeEnabled();
        await user.press(confirm);
        expect(submit).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            name: favorite.name,
            address: place.address,
            longitude: place.longitude,
            latitude: place.latitude,
            timeZone: place.timeZone,
          }),
        );
        expect(matchLocationSchema.safeParse(submit.mock.calls[0][0]).success).toBe(true);
        expect(boundary.back).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});
