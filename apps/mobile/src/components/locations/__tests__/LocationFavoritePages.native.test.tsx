import {
  type FavoriteLocation,
  locationFavoriteKey,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import { useFavoriteLocations } from "@board-game-organizer/shared";
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
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { LocationFavoriteSelect } from "../LocationFavoriteSelect";

const apiUrl = "https://favorite-pages-native.test";
const cursor = "next-favorite-page";
const initial = Array.from({ length: 7 }, (_, index): FavoriteLocation => {
  const location: MatchLocation = {
    id: `11111111-1111-4111-8111-11111111111${index}`,
    name: `Favorite venue ${index + 1}`,
    address: `Via Roma ${index + 1}, Rome, Italy`,
    longitude: 12.5 + index / 100,
    latitude: 41.9,
    timeZone: "Europe/Rome",
  };
  return { key: locationFavoriteKey(location), location };
});
const nextLocation: MatchLocation = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Next-page board game club",
  address: "Via Milano 2, Rome, Italy",
  longitude: 12.7,
  latitude: 42,
  timeZone: "Europe/Rome",
};
const next = { key: locationFavoriteKey(nextLocation), location: nextLocation };

function Controls({ select }: { select: (key: string, location: MatchLocation) => void }) {
  const [key, setKey] = useState<string | null>(null);
  const favorites = useFavoriteLocations({
    apiUrl,
    userId: "owner",
    getToken: async () => "favorite-pages-token",
  });
  return (
    <LocationFavoriteSelect
      favorites={favorites}
      selectedKey={key}
      onSelect={(key, location) => {
        setKey(key);
        select(key, location);
      }}
    />
  );
}

function nativeList() {
  let candidate = screen.getByTestId("favorite-location-0", { includeHiddenElements: true });
  while (candidate.parent && typeof candidate.props.onScroll !== "function")
    candidate = candidate.parent;
  return candidate;
}

it("retries only a failed later favorites page and keeps selecting exact saved locations from the real list", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const select = vi.fn();
  let rejectNext!: (response: Response) => void;
  const pendingNext = new Promise<Response>((resolve) => {
    rejectNext = resolve;
  });
  const readCursors: (string | null)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin !== apiUrl || url.pathname !== "/api/locations/favorites")
        throw new Error(`Unexpected favorites request: ${url}`);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer favorite-pages-token");
      const requested = url.searchParams.get("cursor");
      readCursors.push(requested);
      if (requested === null) return Response.json({ items: initial, nextCursor: cursor });
      expect(requested).toBe(cursor);
      return readCursors.length === 2
        ? pendingNext
        : Response.json({ items: [next], nextCursor: null });
    }),
  );
  try {
    await render(
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <Controls select={select} />
        </NativeTestProviders>
      </QueryClientProvider>,
    );
    await userEvent.setup().press(await screen.findByTestId("favorite-location-select"));
    expect(
      await screen.findByText("Favorite venue 1", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    await scrollNativeListToEnd(nativeList());
    await waitFor(() => expect(readCursors).toEqual([null, cursor]));
    await scrollNativeListToEnd(nativeList());
    expect(readCursors).toEqual([null, cursor]);
    await act(() =>
      rejectNext(Response.json({ error: "Favorite list page unavailable" }, { status: 503 })),
    );

    const retry = await screen.findByRole("button", { name: "Retry", includeHiddenElements: true });
    expect(screen.getByText("Favorite venue 1", { includeHiddenElements: true })).toBeOnTheScreen();
    await fireEvent.press(retry);
    await fireEvent.press(
      await screen.findByTestId("favorite-location-7", { includeHiddenElements: true }),
    );
    expect(select).toHaveBeenCalledExactlyOnceWith(next.key, nextLocation);
    expect(
      within(
        screen.getByTestId("favorite-location-select", { includeHiddenElements: true }),
      ).getByText("Next-page board game club", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(readCursors).toEqual([null, cursor, cursor]);
  } finally {
    client.clear();
    vi.unstubAllGlobals();
  }
});
