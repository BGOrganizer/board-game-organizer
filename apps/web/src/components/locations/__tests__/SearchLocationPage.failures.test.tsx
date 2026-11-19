import { locationFavoriteKey, type MatchLocation } from "@board-game-organizer/schemas";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { SearchLocationPage } from "../SearchLocationPage";

const sdk = vi.hoisted(() => ({ fail: false, remove: vi.fn(), flyTo: vi.fn() }));
// MapLibre/WebGL and browser location APIs are external to this component's form behavior.
vi.mock("@maptiler/sdk", () => ({
  config: { apiKey: "" },
  MapStyle: { STREETS: { DARK: "dark" } },
  Map: class {
    constructor() {
      if (sdk.fail) throw new Error("WebGL unavailable");
    }
    remove = sdk.remove;
    flyTo = sdk.flyTo;
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
const originalKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const location: MatchLocation = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Board game cafe",
  address: "Verified road 1, Rome",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};
function favorites() {
  return {
    items: [{ key: locationFavoriteKey(location), location }],
    list: {
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    },
  };
}
function mount(overrides: Partial<ComponentProps<typeof SearchLocationPage>> = {}) {
  const props: ComponentProps<typeof SearchLocationPage> = {
    apiUrl: "https://api.test.invalid",
    getToken: async () => "fresh",
    userId: "owner",
    favorites: favorites(),
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...renderWithI18n(<SearchLocationPage {...props} />), props };
}
beforeEach(() => {
  sdk.fail = false;
  process.env.NEXT_PUBLIC_MAPTILER_API_KEY = "public-test-key";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
  else Reflect.deleteProperty(navigator, "geolocation");
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  else process.env.NEXT_PUBLIC_MAPTILER_API_KEY = originalKey;
});

it("reports an SDK/WebGL initialization failure and keeps the picker back action available", async () => {
  sdk.fail = true;
  const { props } = mount();
  expect(await screen.findByText("Could not load map")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onSelect).not.toHaveBeenCalled();
});

it("does not send an address request without a session and recovers with a fresh token on another search", async () => {
  const getToken = vi.fn().mockResolvedValueOnce(null).mockResolvedValue("renewed-token");
  const fetch = vi.fn(async (_input: string, _init?: RequestInit) =>
    Response.json({ items: [location] }),
  );
  vi.stubGlobal("fetch", fetch);
  const { props } = mount({ getToken, protectionBypass: "preview-bypass" });
  const input = screen.getByRole("searchbox", { name: "Search address/place" });
  fireEvent.change(input, { target: { value: "First address" } });
  expect(await screen.findByText("Could not search addresses")).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "Verified road" } });
  const choice = await screen.findByRole("button", { name: location.address });
  expect(screen.queryByText("Could not search addresses")).toBeNull();
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get("x-vercel-protection-bypass")).toBe(
    "preview-bypass",
  );
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe(
    "Bearer renewed-token",
  );
  fireEvent.click(choice);
  expect((input as HTMLInputElement).value).toBe(location.address);
  fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), {
    target: { value: "Evening venue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm location" }));
  expect(props.onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Evening venue",
      address: location.address,
      timeZone: "Europe/Rome",
    }),
  );
});

it("ignores a late address response after a new query has supplied current choices", async () => {
  let finishOld: ((value: Response) => void) | undefined;
  const fetch = vi.fn((input: string) => {
    if (new URL(input).searchParams.get("query") === "Old address")
      return new Promise<Response>((resolve) => {
        finishOld = resolve;
      });
    return Promise.resolve(Response.json({ items: [{ ...location, address: "Current address" }] }));
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  const input = screen.getByRole("searchbox", { name: "Search address/place" });
  fireEvent.change(input, { target: { value: "Old address" } });
  await waitFor(() => expect(finishOld).toBeDefined());
  fireEvent.change(input, { target: { value: "Current address" } });
  await screen.findByRole("button", { name: "Current address" });
  await act(async () => {
    finishOld?.(Response.json({ items: [{ ...location, address: "Obsolete address" }] }));
  });
  expect(screen.getByRole("button", { name: "Current address" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Obsolete address" })).toBeNull();
  expect((input as HTMLInputElement).value).toBe("Current address");
});

it("reports unavailable browser geolocation without inventing a verified point", () => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  const { props } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Center map on my location" }));
  expect(screen.getByText("Location unavailable")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirm location" }));
  expect(screen.getByText("Choose a verified address.")).toBeTruthy();
  expect(props.onSelect).not.toHaveBeenCalled();
});

it("surfaces current permission denial and restores controls without submitting a location", async () => {
  let denied: PositionErrorCallback | undefined;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => {
        denied = failure;
      },
    },
  });
  const { props } = mount();
  const locate = screen.getByRole("button", { name: "Center map on my location" });
  fireEvent.click(locate);
  expect((locate as HTMLButtonElement).disabled).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Confirm location" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await act(async () => {
    denied?.({
      code: 1,
      message: "Denied",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    });
  });
  expect(screen.getByText("Location permission denied")).toBeTruthy();
  expect((locate as HTMLButtonElement).disabled).toBe(false);
  expect(
    (screen.getByRole("button", { name: "Confirm location" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(props.onSelect).not.toHaveBeenCalled();
});

it("ignores a stale permission callback after the user starts manual address search", async () => {
  let denied: PositionErrorCallback | undefined;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => {
        denied = failure;
      },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [location] })),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Center map on my location" }));
  const input = screen.getByRole("searchbox", { name: "Search address/place" });
  fireEvent.change(input, { target: { value: "Verified road" } });
  await act(async () => {
    denied?.({
      code: 1,
      message: "Denied",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    });
  });
  expect(screen.queryByText("Location permission denied")).toBeNull();
  expect(await screen.findByRole("button", { name: location.address })).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("Verified road");
});

it("pages an open favorite selector only while more data is available and no load or failure is active", async () => {
  const state = favorites();
  state.list.hasNextPage = true;
  const { props, rerender } = mount({ favorites: state });
  fireEvent.click(screen.getByRole("button", { name: /Favorite locations/ }));
  let list = (await screen.findByRole("option", { name: /Board game cafe/ })).closest<HTMLElement>(
    '[role="listbox"]',
  );
  if (!list) throw new Error("Expected the real favorite selector's listbox");
  fireEvent.scroll(list);
  expect(state.list.fetchNextPage).toHaveBeenCalledOnce();
  const loading = { ...state, list: { ...state.list, isFetchingNextPage: true } };
  rerender(<SearchLocationPage {...props} favorites={loading} />);
  fireEvent.scroll(list);
  expect(state.list.fetchNextPage).toHaveBeenCalledOnce();
  fireEvent.keyDown(list, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(
    (screen.getByRole("button", { name: "Load more favorite locations" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Favorite locations/ }));
  list = (await screen.findByRole("option", { name: /Board game cafe/ })).closest<HTMLElement>(
    '[role="listbox"]',
  );
  if (!list) throw new Error("Expected the reopened favorite selector's listbox");
  const failed = { ...state, list: { ...state.list, isError: true } };
  rerender(<SearchLocationPage {...props} favorites={failed} />);
  fireEvent.scroll(list);
  expect(state.list.fetchNextPage).toHaveBeenCalledOnce();
  expect(screen.getAllByText("Could not load favorite locations").length).toBeGreaterThan(0);
  rerender(
    <SearchLocationPage
      {...props}
      favorites={{ ...state, list: { ...state.list, hasNextPage: false } }}
    />,
  );
  fireEvent.scroll(list);
  expect(state.list.fetchNextPage).toHaveBeenCalledOnce();
  fireEvent.keyDown(list, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(screen.queryByRole("button", { name: "Load more favorite locations" })).toBeNull();
});
