import { URL } from "node:url";
import {
  type FavoriteLocation,
  locationFavoriteKey,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import { favoriteLocationsQuery, useFavoriteLocations } from "@board-game-organizer/shared";
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
import { Keyboard, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { LocationFavoriteButton } from "../LocationFavoriteButton";
import { LocationFavoriteSelect } from "../LocationFavoriteSelect";

const API = "https://location-favorites-native.test";
const MATCH = "33333333-3333-4333-8333-333333333333";
const venue: MatchLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Favorite games club",
  address: "Via Roma 1, Rome, Italy",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};
const another: MatchLocation = {
  ...venue,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Second games club",
  address: "Via Milano 2, Rome, Italy",
  longitude: 12.6,
  latitude: 42,
};
const selected = vi.fn(),
  feedback = { onError: vi.fn(), onOptimisticUpdate: vi.fn() };
let client: QueryClient;
let favorites: FavoriteLocation[];
let nextFavorites: FavoriteLocation[];
let listCode: number;
let statusCode: number;
let writeCode: number;
let cursor: string | null;
let pendingList: Promise<Response> | undefined;
let pendingStatus: Promise<Response> | undefined;
let pendingWrite: Promise<Response> | undefined;
let tokenSerial: number;
const boundary = { apiUrl: API, userId: "owner" };
const options = () => ({
  ...boundary,
  getToken: async () => `fixture-favorite-token-${++tokenSerial}`,
  feedback,
});
const reads: URL[] = [],
  writes: { method: string; input: unknown; authorization: string | null }[] = [];
const json = (value: unknown, status = 200) => Response.json(value, { status });
const entry = (location = venue): FavoriteLocation => ({
  key: locationFavoriteKey(location),
  location,
});
beforeEach(() => {
  vi.clearAllMocks();
  boundary.apiUrl = API;
  boundary.userId = "owner";
  favorites = [];
  nextFavorites = [entry(another)];
  cursor = null;
  listCode = statusCode = writeCode = 200;
  pendingList = pendingStatus = pendingWrite = undefined;
  tokenSerial = 0;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== boundary.apiUrl || url.pathname !== "/api/locations/favorites")
        throw new Error(`Unexpected favorites request ${url.origin}${url.pathname}`);
      const method = init?.method ?? "GET";
      if (method === "GET") {
        reads.push(url);
        if (url.searchParams.has("keys"))
          return (
            pendingStatus ??
            json(
              statusCode === 200
                ? { keys: favorites.map((row) => row.key) }
                : { error: "Fixture status unavailable" },
              statusCode,
            )
          );
        return (
          pendingList ??
          json(
            listCode === 200
              ? {
                  items: url.searchParams.has("cursor") ? nextFavorites : favorites,
                  nextCursor: url.searchParams.has("cursor") ? null : cursor,
                }
              : { error: "Fixture list unavailable" },
            listCode,
          )
        );
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      writes.push({
        method,
        input: body,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (pendingWrite) return pendingWrite;
      if (writeCode !== 200)
        return json({ error: "Fixture favorite mutation rejected" }, writeCode);
      if (method === "POST") {
        favorites = [entry()];
        return json({ item: entry() });
      }
      if (method === "DELETE") {
        favorites = [];
        return json({ removed: true });
      }
      throw new Error(`Unexpected favorites method ${method}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Controls({ matchId }: { matchId?: string }) {
  const state = useFavoriteLocations(options(), [venue]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  return (
    <>
      <LocationFavoriteButton location={venue} favorites={state} matchId={matchId} />
      <View testID="favorite-location-field">
        <LocationFavoriteSelect
          favorites={state}
          selectedKey={selectedKey}
          onSelect={(key, location) => {
            setSelectedKey(key);
            selected(key, location);
          }}
        />
      </View>
    </>
  );
}
function Fixture({ matchId }: { matchId?: string }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Controls matchId={matchId} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function ready() {
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
async function open() {
  const trigger = await screen.findByTestId("favorite-location-select");
  await waitFor(() => expect(trigger).toBeEnabled());
  await userEvent.setup().press(trigger);
  // Actual Select/Gorhom content and state callbacks remain in the tree. Its
  // native sheet opacity/physical gesture acceptance is separate Maestro proof.
}
async function toggle(name = "Add location to favorites") {
  await userEvent.setup().press(await screen.findByRole("button", { name, disabled: false }));
}

it("keeps an authoritative empty selector disabled while allowing an explicitly verified favorite addition", async () => {
  await render(<Fixture />);
  await ready();
  expect(await screen.findByTestId("favorite-location-select")).toBeDisabled();
  expect(
    within(screen.getByTestId("favorite-location-select")).getByText("No favorite locations"),
  ).toBeVisible();
  expect(
    await screen.findByRole("button", {
      name: "Add location to favorites",
      selected: false,
      disabled: false,
    }),
  ).toBeEnabled();
  expect(writes).toHaveLength(0);
});

it("keeps initial list and status reads pending without exposing a premature empty state or allowing an unverifiable write", async () => {
  let finishList: (value: Response) => void = () => {},
    finishStatus: (value: Response) => void = () => {};
  pendingList = new Promise((resolve) => {
    finishList = resolve;
  });
  pendingStatus = new Promise((resolve) => {
    finishStatus = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByTestId("favorite-location-select")).toBeNull();
  expect(screen.queryByText("No favorite locations")).toBeNull();
  expect(screen.getByRole("button", { name: "Add location to favorites" })).toBeDisabled();
  await userEvent
    .setup()
    .press(
      await screen.findByRole("button", { name: "Add location to favorites", disabled: true }),
    );
  expect(writes).toHaveLength(0);
  await act(() => {
    finishList(json({ items: [], nextCursor: null }));
    finishStatus(json({ keys: [] }));
  });
  await ready();
  expect(await screen.findByTestId("favorite-location-select")).toBeDisabled();
  expect(
    await screen.findByRole("button", { name: "Add location to favorites", disabled: false }),
  ).toBeEnabled();
});

it("opens the real selector after dismissing the keyboard and returns the exact canonical name, address, coordinates and timezone", async () => {
  favorites = [entry()];
  const dismiss = vi.spyOn(Keyboard, "dismiss");
  await render(<Fixture />);
  await ready();
  expect(dismiss).not.toHaveBeenCalled();
  await open();
  expect(dismiss).toHaveBeenCalled();
  await fireEvent.press(
    await screen.findByTestId("favorite-location-0", { includeHiddenElements: true }),
  );
  expect(selected).toHaveBeenCalledExactlyOnceWith(locationFavoriteKey(venue), venue);
  expect(screen.getByTestId("favorite-location-select")).toHaveTextContent(venue.name);
  expect(writes).toHaveLength(0);
});

it.each([undefined, MATCH])(
  "adds only after the actual favorite action and preserves optional match context (%s)",
  async (matchId) => {
    await render(<Fixture matchId={matchId} />);
    await ready();
    expect(screen.getByRole("button", { name: "Add location to favorites" })).not.toBeSelected();
    await toggle();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: "POST",
      input: { location: venue, ...(matchId ? { matchId } : {}) },
    });
    if (!matchId) expect(writes[0].input).not.toHaveProperty("matchId");
    expect(writes[0].authorization).toMatch(/^Bearer fixture-favorite-token-\d+$/);
    expect(
      await screen.findByRole("button", {
        name: "Remove location from favorites",
        selected: true,
        disabled: false,
      }),
    ).toBeEnabled();
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("add_favorite_location");
  },
);

it("removes only the current canonical favorite key through a separate explicit destructive intent", async () => {
  favorites = [entry()];
  await render(<Fixture matchId={MATCH} />);
  await ready();
  expect(
    await screen.findByRole("button", { name: "Remove location from favorites", selected: true }),
  ).toBeSelected();
  await toggle("Remove location from favorites");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].method).toBe("DELETE");
  expect(writes[0].input).toEqual({ key: locationFavoriteKey(venue) });
  expect(
    await screen.findByRole("button", { name: "Add location to favorites", disabled: false }),
  ).toBeEnabled();
  expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("remove_favorite_location");
});

it("rejects duplicate actions while a real owned mutation is pending and reconciles the successful receipt", async () => {
  await render(<Fixture />);
  await ready();
  let finish: (value: Response) => void = () => {};
  pendingWrite = new Promise((resolve) => {
    finish = resolve;
  });
  await toggle();
  const pending = await screen.findByRole("button", { name: "Remove location from favorites" });
  await waitFor(() => expect(pending).toBeDisabled());
  await userEvent.setup().press(pending);
  expect(writes).toHaveLength(1);
  pendingWrite = undefined;
  favorites = [entry()];
  await act(() => finish(json({ item: entry() })));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Remove location from favorites" })).toBeEnabled(),
  );
});

it("rolls back a rejected addition and retains observable mutation feedback without inventing a saved location", async () => {
  writeCode = 400;
  await render(<Fixture />);
  await ready();
  await toggle();
  await waitFor(() =>
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "add_favorite_location"),
  );
  expect(
    await screen.findByRole("button", { name: "Add location to favorites" }),
  ).not.toBeSelected();
  expect(screen.getByTestId("favorite-location-select")).toBeDisabled();
  expect(writes).toHaveLength(1);
});

it("rolls back a rejected removal and preserves the previously authorized favorite", async () => {
  favorites = [entry()];
  writeCode = 400;
  await render(<Fixture />);
  await ready();
  await toggle("Remove location from favorites");
  await waitFor(() =>
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "remove_favorite_location"),
  );
  expect(
    await screen.findByRole("button", {
      name: "Remove location from favorites",
      selected: true,
      disabled: false,
    }),
  ).toBeEnabled();
  expect(screen.getByTestId("favorite-location-select")).toBeEnabled();
});

it("disables a cold favorite mutation if its authoritative status check fails", async () => {
  statusCode = 503;
  await render(<Fixture />);
  await ready();
  const button = screen.getByRole("button", { name: "Add location to favorites" });
  expect(button).toBeDisabled();
  await userEvent.setup().press(button);
  expect(writes).toHaveLength(0);
});

it("retains a verified cached status during an ordinary refresh error rather than manufacturing a cold failure", async () => {
  await render(<Fixture />);
  await ready();
  expect(
    await screen.findByRole("button", {
      name: "Add location to favorites",
      selected: false,
      disabled: false,
    }),
  ).toBeEnabled();
  const statusKey = ["favoriteLocations", API, "owner", "status", [locationFavoriteKey(venue)]];
  expect(client.getQueryData(statusKey)).toEqual([]);
  statusCode = 503;
  await act(() =>
    client.invalidateQueries({ queryKey: ["favoriteLocations", API, "owner", "status"] }),
  );
  expect(client.getQueryState(statusKey)).toMatchObject({ status: "error", data: [] });
  expect(
    await screen.findByRole("button", {
      name: "Add location to favorites",
      selected: false,
      disabled: false,
    }),
  ).toBeEnabled();
  expect(writes).toHaveLength(0);
});

it("shows a failed favorite-list read without converting it to empty success and retries through its actual sheet footer", async () => {
  favorites = [entry()];
  client.setQueryData(favoriteLocationsQuery(options()).queryKey, {
    pages: [{ items: favorites, nextCursor: null }],
    pageParams: [""],
  });
  await render(<Fixture />);
  await ready();
  listCode = 503;
  await act(() =>
    client.invalidateQueries({ queryKey: favoriteLocationsQuery(options()).queryKey, exact: true }),
  );
  expect(
    await within(screen.getByTestId("favorite-location-field")).findByText(
      "Could not load favorite locations",
    ),
  ).toBeVisible();
  await open();
  listCode = 200;
  await fireEvent.press(
    await screen.findByRole("button", { name: "Retry", includeHiddenElements: true }),
  );
  await ready();
  await waitFor(() =>
    expect(screen.queryAllByText("Could not load favorite locations")).toHaveLength(0),
  );
  const recoveredOption = within(
    await screen.findByTestId("favorite-location-0", { includeHiddenElements: true }),
  );
  expect(recoveredOption.getByText(venue.name, { includeHiddenElements: true })).toBeOnTheScreen();
  expect(
    recoveredOption.getByText("Via Roma 1, Rome", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

it("keeps initial favorite-list errors observable even when no cached row can open the sheet", async () => {
  listCode = 503;
  await render(<Fixture />);
  await ready();
  expect(
    await within(screen.getByTestId("favorite-location-field")).findByText(
      "Could not load favorite locations",
    ),
  ).toBeVisible();
  expect(screen.getByTestId("favorite-location-select")).toBeDisabled();
  expect(screen.queryByText("No favorite locations")).toBeNull();
});

it("removes the previous viewer's list and status from the rendered controls after an owner/API switch", async () => {
  favorites = [entry()];
  const view = await render(<Fixture />);
  await ready();
  expect(
    await screen.findByRole("button", { name: "Remove location from favorites", selected: true }),
  ).toBeSelected();
  boundary.userId = "another-owner";
  boundary.apiUrl = "https://another-favorite-native.test";
  favorites = [];
  await view.rerender(<Fixture />);
  await ready();
  expect(
    await screen.findByRole("button", {
      name: "Add location to favorites",
      selected: false,
      disabled: false,
    }),
  ).not.toBeSelected();
  expect(screen.queryByRole("button", { name: "Remove location from favorites" })).toBeNull();
  await waitFor(() => expect(screen.getByTestId("favorite-location-select")).toBeDisabled());
  expect(reads.at(-1)?.origin).toBe(boundary.apiUrl);
});
