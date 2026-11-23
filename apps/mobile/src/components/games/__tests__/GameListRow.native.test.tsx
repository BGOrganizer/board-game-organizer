import type { BggSearchItem } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type NativeMethods, StyleSheet, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { GameListRow } from "../GameListRow";

const { apiUrl, getToken } = vi.hoisted(() => ({
  apiUrl: "https://game-metadata.test",
  getToken: vi.fn(async () => "metadata-token"),
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl, getToken, userId: "viewer" }),
}));

const game: BggSearchItem = { id: 15, name: "Catan", imageUrl: null, year: 1995 };
const requests = vi.fn<typeof fetch>();
let client: QueryClient;

beforeEach(async () => {
  vi.clearAllMocks();
  requests.mockReset();
  vi.stubGlobal("fetch", requests);
  client = new QueryClient();
  await installNativePopoverMeasurements();
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("waits for the incomplete cover to enter the viewport and retries a failed metadata lookup", async () => {
  const { default: nativeView } = await vi.importActual<{
    default: { prototype: Pick<NativeMethods, "measureInWindow"> };
  }>("react-native/Libraries/Components/View/ViewNativeComponent");
  const measure = vi
    .spyOn(nativeView.prototype, "measureInWindow")
    .mockImplementationOnce((callback) => callback(0, -50, 48, 48))
    .mockImplementation((callback) => callback(0, 80, 48, 48));
  requests
    .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 500 }))
    .mockResolvedValueOnce(
      Response.json({
        items: [{ ...game, rank: 0, maxPlayMinutes: 60 }],
      }),
    );

  await render(
    <NativeTestProviders>
      <QueryClientProvider client={client}>
        <GameListRow game={game} name={game.name} />
      </QueryClientProvider>
    </NativeTestProviders>,
  );
  const cover = screen.container.queryAll(
    (node) =>
      node.props.collapsable === false &&
      typeof node.props.onLayout === "function" &&
      StyleSheet.flatten(node.props.style)?.width === 48,
  )[0];
  expect(cover).toBeDefined();
  await fireEvent.layout(cover, { x: 0, y: -50, width: 48, height: 48 });
  expect(measure).toHaveBeenCalledOnce();
  expect(client.isFetching()).toBe(0);
  expect(requests).not.toHaveBeenCalled();

  await fireEvent.layout(cover, { x: 0, y: 80, width: 48, height: 48 });
  await waitFor(() => expect(requests).toHaveBeenCalledOnce());
  const [url, options] = requests.mock.calls[0];
  expect(String(url)).toBe(`${apiUrl}/api/bgg/thing?ids=15`);
  expect(new Headers(options?.headers).get("authorization")).toBe("Bearer metadata-token");
  await pressMeasuredPopover(screen.getByRole("button", { name: "Game information: Catan" }));
  expect(await screen.findByText("Could not load game information")).toBeVisible();
  expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);

  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Unranked")).toBeVisible();
  expect(screen.getByText("60 min")).toBeVisible();
  expect(screen.getByText("1995")).toBeVisible();
  expect(screen.queryByText("Could not load game information")).toBeNull();
  expect(requests).toHaveBeenCalledTimes(2);
});

it("retains the game identity and companion facts when its cover fails and uses a new cover when supplied", async () => {
  const oldCover = "https://covers.test/catan.png";
  const newCover = "https://covers.test/catan-second-edition.png";
  const row = (imageUrl: string) => (
    <NativeTestProviders>
      <GameListRow imageUrl={imageUrl} name={game.name} metadata={<Text>Family game</Text>} />
    </NativeTestProviders>
  );
  const image = () => screen.container.queryAll((node) => node.type === "RCTImageView").at(0);
  const view = await render(row(oldCover));
  const broken = image();
  if (!broken) throw new Error("Expected the original cover image");
  expect(broken.props.source).toEqual([expect.objectContaining({ uri: oldCover })]);
  await fireEvent(broken, "error", { nativeEvent: { error: "Image unavailable" } });
  expect(image()).toBeUndefined();
  expect(screen.getByText("Catan")).toBeVisible();
  expect(screen.getByText("Family game")).toBeVisible();
  await view.rerender(row(newCover));
  expect(image()?.props.source).toEqual([expect.objectContaining({ uri: newCover })]);
});

it("can expand game votes without inventing a missing catalog record", async () => {
  await render(
    <NativeTestProviders>
      <GameListRow
        name={game.name}
        disclosure={{
          label: "Catan votes",
          triggerText: "Votes",
          content: <Text>3 confirmed votes</Text>,
        }}
      />
    </NativeTestProviders>,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Catan votes" }));
  expect(await screen.findByText("3 confirmed votes")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Game information: Catan" })).toBeNull();
  expect(requests).not.toHaveBeenCalled();
});
