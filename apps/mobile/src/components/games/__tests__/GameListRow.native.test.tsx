import type { BggSearchItem } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { type NativeMethods, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InputScrollView } from "@/components/common/ui/InputScrollView";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { GameListRow } from "../GameListRow";

const API = "https://game-list-row-coverage.test";
const game: BggSearchItem = { id: 17, name: "Strategy guide", year: null, imageUrl: null };
const detailed: BggSearchItem = {
  ...game,
  year: 2030,
  rank: 0,
  average: 8.5,
  averageWeight: 4.1,
  minPlayMinutes: 30,
  maxPlayMinutes: 60,
  categories: ["Strategy"],
  suggestedPlayers: {
    totalVotes: 3,
    rows: [
      { players: 2, orMore: false, best: 2, recommended: 1, notRecommended: 0, sampleCount: 3 },
    ],
    fetchedAt: "2030-06-01T10:00:00.000Z",
  },
};
const options = { apiUrl: API, userId: "viewer", getToken: async () => "fixture-game-row" };
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));

let client: QueryClient;
let code: number;
const http = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  expect(url.origin).toBe(API);
  expect(url.pathname).toBe("/api/bgg/thing");
  expect(url.searchParams.get("ids")).toBe(String(game.id));
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fixture-game-row");
  return Response.json(code === 200 ? { items: [detailed] } : { error: "Catalog unavailable" }, {
    status: code,
  });
});
function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>{children}</NativeTestProviders>
    </QueryClientProvider>
  );
}
beforeEach(async () => {
  code = 200;
  http.mockClear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal("fetch", http);
  await installNativePopoverMeasurements();
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("waits for a real row layout within the viewport, reports catalog failure and retries metadata in place", async () => {
  const native = await vi.importActual<{
    default: { prototype: Pick<NativeMethods, "measureInWindow"> };
  }>("react-native/Libraries/Components/View/ViewNativeComponent");
  let bounds = { width: 0, height: 48, y: 100 };
  vi.spyOn(native.default.prototype, "measureInWindow").mockImplementation((callback) => {
    callback(0, bounds.y, bounds.width, bounds.height);
  });
  code = 503;
  await render(<GameListRow game={game} name={game.name} />, { wrapper: Providers });
  const cover = screen.container.queryAll(
    (node) => node.props.collapsable === false && typeof node.props.onLayout === "function",
  );
  expect(cover).toHaveLength(1);
  for (const location of [
    bounds,
    { width: 48, height: 0, y: 100 },
    { width: 48, height: 48, y: 2000 },
    { width: 48, height: 48, y: -48 },
  ]) {
    bounds = location;
    await fireEvent.layout(cover[0], { x: 0, ...location });
  }
  expect(http).not.toHaveBeenCalled();

  bounds = { width: 48, height: 48, y: -10 };
  await fireEvent.layout(cover[0], { x: 0, ...bounds });
  await waitFor(() =>
    expect(client.getQueryState(["bgg-game-metadata", API, "viewer", game.id])?.status).toBe(
      "error",
    ),
  );
  expect(http).toHaveBeenCalledOnce();
  await pressMeasuredPopover(
    screen.getByRole("button", { name: `Game information: ${game.name}` }),
  );
  expect(screen.getByText("Could not load game information")).toHaveProp(
    "accessibilityRole",
    "alert",
  );
  expect(screen.getAllByText("N/A")).not.toHaveLength(0);

  code = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Unranked")).toBeVisible();
  expect(screen.getByText("30–60 min")).toBeVisible();
  expect(screen.getByText("Strategy")).toBeVisible();
  expect(screen.queryByText("Could not load game information")).toBeNull();
  expect(http).toHaveBeenCalledTimes(2);
});

it("preserves row identity and metadata when the cover fails, and separates disclosure from navigation", async () => {
  const open = vi.fn();
  const name = "Strategy guide";
  const artwork = "https://image.example.test/cover.png";
  const view = await render(
    <GameListRow
      name={name}
      imageUrl={artwork}
      onPress={open}
      metadata={<Text>Owned by Pat</Text>}
    />,
    { wrapper: Providers },
  );
  const navigable = screen.getByRole("button", { name });
  expect(screen.getByText("Owned by Pat")).toBeVisible();
  const image = navigable.queryAll((node) => typeof node.props.onError === "function");
  expect(image).toHaveLength(1);
  await fireEvent(image[0], "error", { nativeEvent: { error: "Image unavailable" } });
  expect(navigable.queryAll((node) => typeof node.props.onError === "function")).toHaveLength(0);
  await userEvent.setup().press(navigable);
  expect(open).toHaveBeenCalledOnce();

  const replacementArtwork = "https://image.example.test/second-edition.png";
  await view.rerender(
    <GameListRow
      name={name}
      imageUrl={replacementArtwork}
      onPress={open}
      metadata={<Text>Owned by Pat</Text>}
    />,
  );
  const replacement = screen
    .getByRole("button", { name })
    .queryAll((node) => typeof node.props.onError === "function");
  expect(replacement).toHaveLength(1);
  expect(replacement[0].props.source).toEqual([
    expect.objectContaining({ uri: replacementArtwork }),
  ]);
  expect(screen.getByText("Owned by Pat")).toBeVisible();

  await view.rerender(
    <GameListRow
      name={name}
      onPress={open}
      disclosure={{
        label: "Show votes",
        triggerText: "Votes",
        content: <Text>Pat voted yes</Text>,
      }}
    />,
  );
  expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: `Game information: ${name}` })).toBeNull();
  await userEvent.setup().press(screen.getByRole("button", { name: "Show votes" }));
  expect(screen.getByText("Pat voted yes")).toBeOnTheScreen();
  expect(open).toHaveBeenCalledOnce();
  expect(http).not.toHaveBeenCalled();
});

it("shows the known year and maximum duration when no minimum duration is available", async () => {
  await render(
    <GameListRow game={{ ...detailed, year: 1995, minPlayMinutes: undefined }} name={game.name} />,
    { wrapper: Providers },
  );
  await pressMeasuredPopover(
    screen.getByRole("button", { name: `Game information: ${game.name}` }),
  );
  expect(screen.getByText("60 min")).toBeVisible();
  expect(screen.getByText("1995")).toBeVisible();
});

it("hydrates an uncached game only when its mounted cover enters the parent's measured scroll viewport", async () => {
  const native = await vi.importActual<{
    default: { prototype: Pick<NativeMethods, "measureInWindow"> };
  }>("react-native/Libraries/Components/View/ViewNativeComponent");
  let top = 600;
  let rowMeasured = 0;
  vi.spyOn(native.default.prototype, "measureInWindow").mockImplementation(function (
    this: { props?: { collapsable?: boolean } },
    callback,
  ) {
    if (this.props?.collapsable === false) {
      rowMeasured += 1;
      callback(0, top, 48, 48);
    } else {
      callback(0, 0, 320, 500);
    }
  });
  await render(
    <InputScrollView testID="catalog-scroll">
      <GameListRow game={game} name={game.name} />
    </InputScrollView>,
    { wrapper: Providers },
  );
  await waitFor(() => expect(rowMeasured).toBeGreaterThan(0));
  expect(http).not.toHaveBeenCalled();

  top = 200;
  await fireEvent.scroll(screen.getByTestId("catalog-scroll"), {
    nativeEvent: {
      contentOffset: { x: 0, y: 400 },
      contentSize: { width: 320, height: 1040 },
      layoutMeasurement: { width: 320, height: 500 },
      zoomScale: 1,
    },
  });
  await waitFor(() =>
    expect(http).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.anything()),
  );
  await pressMeasuredPopover(
    screen.getByRole("button", { name: `Game information: ${game.name}` }),
  );
  expect(await screen.findByText("Strategy")).toBeVisible();
  expect(http).toHaveBeenCalledTimes(1);
});
