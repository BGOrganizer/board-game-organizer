import { locationFavoriteKey, type MatchLocation } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as renderI18n } from "../../../test-utils";
import { SearchLocationPage } from "../SearchLocationPage";

function renderWithI18n(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderI18n(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mapMocks = vi.hoisted(() => ({ created: vi.fn(), remove: vi.fn(), flyTo: vi.fn() }));
vi.mock("@maptiler/sdk", () => ({
  config: { apiKey: "" },
  MapStyle: { STREETS: "streets" },
  Map: class {
    constructor() {
      mapMocks.created();
    }
    on(_event: string, callback: () => void) {
      queueMicrotask(callback);
    }
    remove = mapMocks.remove;
    flyTo = mapMocks.flyTo;
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
const originalKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const location: MatchLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Game cafe",
  address: "123 Main St, Rome",
  longitude: 12.5,
  latitude: 41.9,
};
const favorites = (locations: MatchLocation[] = [], isError = false) => ({
  items: locations.map((location) => ({ key: locationFavoriteKey(location), location })),
  list: {
    isPending: false,
    isError,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_MAPTILER_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
  else Reflect.deleteProperty(navigator, "geolocation");
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  else process.env.NEXT_PUBLIC_MAPTILER_API_KEY = originalKey;
});

it("centers a successful empty address search but not startup, pending requests or failures", async () => {
  let complete: ((value: Response) => void) | undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh-token"}
      favorites={favorites()}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByText("No addresses found")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search address" }), {
    target: { value: "Missing road" },
  });
  await waitFor(() => expect(complete).toBeDefined());
  expect(screen.queryByText("No addresses found")).toBeNull();
  complete?.(Response.json({ items: [] }));
  const empty = await screen.findByText("No addresses found");
  expect(empty.parentElement?.className).toContain("items-center");
  fetch.mockImplementation(async () => Response.json({ error: "UNAVAILABLE" }, { status: 503 }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search address" }), {
    target: { value: "Another road" },
  });
  await screen.findByText("Could not search addresses");
  expect(screen.queryByText("No addresses found")).toBeNull();
});

it("requires a chosen address and four-character name, caps results and hides the selected summary", async () => {
  const getToken = vi.fn().mockResolvedValue("fresh-token");
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      items: Array.from({ length: 6 }, (_, index) => ({
        id: `address.${index}`,
        address: `Main Street ${index}`,
        longitude: 12.5,
        latitude: 41.9,
      })),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onSelect = vi.fn();
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={getToken}
      favorites={favorites()}
      onSelect={onSelect}
      onClose={vi.fn()}
    />,
  );
  const confirm = screen.getByRole("button", { name: "Confirm location" });
  expect(confirm.hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: "Gam" },
  });
  fireEvent.change(screen.getByRole("searchbox", { name: "Search address" }), {
    target: { value: "Main St" },
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Main Street 0" })).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Main Street 5" })).toBeNull();
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer fresh-token");
  fireEvent.click(screen.getByRole("button", { name: "Main Street 0" }));
  expect(confirm.hasAttribute("disabled")).toBe(true);
  expect(screen.queryByText("Main Street 0")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: "Game cafe" },
  });
  fireEvent.click(confirm);
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Game cafe",
      address: "Main Street 0",
      longitude: 12.5,
      latitude: 41.9,
    }),
  );
});

it("preserves edited slot ID, puts map before fields and reuses a favorite", async () => {
  const onSelect = vi.fn();
  const edited = { ...location, id: "22222222-2222-4222-8222-222222222222" };
  const { container } = renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      initial={edited}
      favorites={favorites([location])}
      onSelect={onSelect}
      onClose={vi.fn()}
    />,
  );
  const name = screen.getByRole("textbox", { name: "Location name" });
  expect(container.querySelector('[role="img"]')?.compareDocumentPosition(name)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  fireEvent.click(screen.getByRole("button", { name: /Favorite locations/ }));
  fireEvent.click(await screen.findByRole("option", { name: /Game cafe/ }));
  expect((name as HTMLInputElement).value).toBe(location.name);
  expect(mapMocks.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [12.5, 41.9] }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm location" }));
  expect(onSelect).toHaveBeenCalledWith({ ...location, id: edited.id });
});

it("shows empty, loading and failed favorites without hiding search", () => {
  const state = favorites([], true);
  const { unmount } = renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={state}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("Could not load favorite locations");
  expect(screen.getByRole("searchbox", { name: "Search address" })).toBeTruthy();
  unmount();
  const { unmount: unmountEmpty } = renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={favorites()}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: /No favorite locations/ }).hasAttribute("disabled"),
  ).toBe(true);
  unmountEmpty();
  state.list.isPending = true;
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={state}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: /No favorite locations/ })).toBeNull();
});

it("pages favorites and fills the search field with the verified current-position address", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      items: [
        { id: "address.gps", address: "Verified current address", longitude: 13, latitude: 42 },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const state = favorites([location], true);
  state.list.hasNextPage = true;
  const position = vi.fn((success: PositionCallback) =>
    success({ coords: { longitude: 13, latitude: 42 } } as GeolocationPosition),
  );
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: position },
  });
  const onSelect = vi.fn();
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={state}
      onSelect={onSelect}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Load more favorite locations" }));
  expect(state.list.fetchNextPage).toHaveBeenCalledOnce();
  await waitFor(() => expect(mapMocks.created).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Center map on my location" }));
  expect(position).toHaveBeenCalledOnce();
  expect(mapMocks.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [13, 42] }));
  await waitFor(() =>
    expect(
      (screen.getByRole("searchbox", { name: "Search address" }) as HTMLInputElement).value,
    ).toBe("Verified current address"),
  );
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("query")).toBe(
    "13.0000000,42.0000000",
  );
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer fresh");
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm location" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: "Game cafe" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm location" }));
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Game cafe",
      address: "Verified current address",
      longitude: 13,
      latitude: 42,
    }),
  );
});

it.each([502, 200])(
  "keeps an unavailable or empty GPS address unconfirmed (%i)",
  async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        status === 200 ? Response.json({ items: [] }) : new Response(null, { status }),
      );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { longitude: 12.5, latitude: 41.9 } } as GeolocationPosition),
      },
    });
    renderWithI18n(
      <SearchLocationPage
        apiUrl="https://api.example.com"
        getToken={async () => "fresh"}
        favorites={favorites()}
        initial={location}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Center map on my location" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Could not search addresses"),
    );
    expect(screen.getByRole("button", { name: "Confirm location" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      (screen.getByRole("searchbox", { name: "Search address" }) as HTMLInputElement).value,
    ).toBe("");
    expect(
      screen.getByRole("button", { name: "Center map on my location" }).hasAttribute("disabled"),
    ).toBe(false);
  },
);

it("does not overwrite manual input with a late GPS lookup", async () => {
  let finishLookup: (value: Response) => void = () => {};
  const fetchMock = vi.fn((url: string) => {
    if (new URL(url).searchParams.get("query")?.includes(","))
      return new Promise<Response>((resolve) => {
        finishLookup = resolve;
      });
    return Promise.resolve(Response.json({ items: [] }));
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { longitude: 12.5, latitude: 41.9 } } as GeolocationPosition),
    },
  });
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={favorites()}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Center map on my location" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const input = screen.getByRole("searchbox", { name: "Search address" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Manual address" } });
  finishLookup(
    Response.json({
      items: [{ id: "late", address: "Old GPS address", longitude: 12.5, latitude: 41.9 }],
    }),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(input.value).toBe("Manual address");
  expect(screen.getByRole("button", { name: "Confirm location" }).hasAttribute("disabled")).toBe(
    true,
  );
});

it("ignores a GPS callback after leaving the picker", async () => {
  let position: PositionCallback = () => {};
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (callback: PositionCallback) => {
        position = callback;
      },
    },
  });
  const { unmount } = renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={favorites()}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Center map on my location" }));
  unmount();
  position({ coords: { longitude: 12.5, latitude: 41.9 } } as GeolocationPosition);
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not search short queries and surfaces network failures", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={favorites()}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const input = screen.getByRole("searchbox", { name: "Search address" });
  fireEvent.change(input, { target: { value: "Mai" } });
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "Main Street" } });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Could not search addresses"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect((input as HTMLInputElement).value).toBe("");
});

it("keeps address search usable when map key is missing", () => {
  delete process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  renderWithI18n(
    <SearchLocationPage
      apiUrl="https://api.example.com"
      getToken={async () => "fresh"}
      favorites={favorites()}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("Map unavailable")).toBeTruthy();
  expect(screen.getByRole("searchbox", { name: "Search address" })).toBeTruthy();
});
