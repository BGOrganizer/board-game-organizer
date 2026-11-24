import { locationFavoriteKey } from "@board-game-organizer/schemas";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import { SearchUserPage } from "@/components/contacts/SearchUserPage";
import { SearchGamePage } from "@/components/games/SearchGamePage";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { plannedEvent } from "@/test-fixtures/eventRecords";
import { measureWebFeature } from "./featureScenario";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "picker-owner" }) }));
// WebGL is outside the DOM renderer. Search, favorites, selection and app UI still run normally.
vi.mock("@maptiler/sdk", () => ({
  config: { apiKey: "" },
  MapStyle: { STREETS: { DARK: "dark" } },
  Map: class {
    on(_event: string, callback: () => void) {
      queueMicrotask(callback);
    }
    remove() {}
    flyTo() {}
    setStyle() {}
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));

const apiUrl = "https://picker-render.test";
const getToken = async () => "picker-fixture-token";
const back = vi.fn();
const selectUser = vi.fn();
const selectGame = vi.fn();
const selectLocation = vi.fn();
const user = { id: "friend", name: "Ada", username: "ada", email: null, avatarUrl: null };
const excludedUser = { ...user, id: "invited", name: "Invited already" };
const game = {
  id: 21,
  name: "Cascadia",
  year: 2021,
  imageUrl: "https://cf.geekdo-images.com/test/thumb.jpg",
  rank: 42,
  average: 7.83,
  source: "search",
};
const location = plannedEvent.locations[0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function mockApi(respond: (url: URL) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer picker-fixture-token");
      return respond(url);
    }),
  );
}

measureWebFeature(
  "SearchUserPage: select an eligible friend without showing excluded candidates",
  <SearchUserPage
    apiUrl={apiUrl}
    getToken={getToken}
    token="unused"
    excludeIds={[excludedUser.id]}
    onSelect={selectUser}
    onClose={back}
  />,
  async () => {
    const pick = await screen.findByRole("button", { name: "Add: Ada" });
    expect(screen.getByText("@ada")).toBeVisible();
    expect(screen.queryByText("Invited already")).toBeNull();
    fireEvent.click(pick);
    expect(selectUser).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(user));
  },
  () => {
    selectUser.mockClear();
    mockApi((url) => {
      expect(url.pathname).toBe("/api/relationships");
      return Response.json({
        rows: [user, excludedUser].map((person) => ({
          fromUserId: "picker-owner",
          toUserId: person.id,
          profile: person,
        })),
        nextCursor: null,
      });
    });
  },
);

measureWebFeature(
  "SearchGamePage: retain the search input and prevent duplicate game selection",
  <SearchGamePage
    apiUrl={apiUrl}
    getToken={getToken}
    token="unused"
    userId="picker-owner"
    excludeIds={[22]}
    onSelect={selectGame}
    onClose={back}
  />,
  async () => {
    const input = screen.getByPlaceholderText(/Search board games/);
    input.focus();
    fireEvent.change(input, { target: { value: "Cascadia" } });
    const select = await screen.findByRole("button", { name: "Select: Cascadia" });
    expect(screen.getByPlaceholderText(/Search board games/)).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.queryByText("Already selected")).toBeNull();
    expect(screen.getByRole("button", { name: "Game information: Cascadia" })).toBeVisible();
    fireEvent.click(select);
    fireEvent.click(select);
    expect(selectGame).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(game));
  },
  () => {
    selectGame.mockClear();
    mockApi((url) =>
      url.pathname.endsWith("/account")
        ? Response.json({ active: null, pending: null })
        : Response.json({
            items: [game, { id: 22, name: "Already selected", year: null, imageUrl: null }],
            nextCursor: null,
          }),
    );
  },
);

measureWebFeature(
  "SearchLocationPage: choose a favorite, edit its name and keep the existing slot",
  <SearchLocationPage
    apiUrl={apiUrl}
    getToken={getToken}
    initial={{ ...location, name: "Existing name" }}
    favorites={{
      items: [{ key: locationFavoriteKey(location), location }],
      list: {
        isPending: false,
        isError: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      },
    }}
    onSelect={selectLocation}
    onClose={back}
  />,
  async () => {
    const name = screen.getByRole("textbox", { name: "Location name" });
    expect(name).toHaveValue("Existing name");
    fireEvent.click(screen.getByRole("button", { name: /Favorite locations/ }));
    const options = await screen.findByRole("listbox");
    fireEvent.click(within(options).getByRole("option", { name: new RegExp(location.name) }));
    expect(name).toHaveValue(location.name);
    fireEvent.change(name, { target: { value: "Updated club venue" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Location" }));
    expect(selectLocation).toHaveBeenCalledExactlyOnceWith({
      ...location,
      name: "Updated club venue",
    });
  },
  () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_API_KEY", "public-map-fixture");
    selectLocation.mockClear();
  },
);
