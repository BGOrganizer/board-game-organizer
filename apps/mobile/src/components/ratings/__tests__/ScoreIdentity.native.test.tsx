import { render, screen, userEvent } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { GameRating } from "../GameRating";
import { ScoreIdentity } from "../ScoreIdentity";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

const player = {
  id: "player",
  name: "Player",
  username: "handle",
  email: null,
  avatarUrl: null,
};

it.each([1, 2, null, undefined])(
  "preserves score identity and explanatory rank %s",
  async (rank) => {
    const view = await render(<ScoreIdentity player={player} rank={rank} />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.getByText(player.name)).toBeVisible();
    expect(screen.getByText("handle")).toBeVisible();
    if (rank != null) {
      expect(screen.getByText(`Position: #${rank}`)).toBeVisible();
      await pressMeasuredPopover(screen.getByRole("button", { name: `Position: #${rank}` }));
      expect(await screen.findByRole("heading", { name: "Position" })).toBeTruthy();
      expect(screen.getByText(`#${rank}`)).toBeVisible();
      await userEvent
        .setup()
        .press(
          screen.getByRole("button", { name: `Position: #${rank}`, includeHiddenElements: true }),
        );
    } else {
      expect(screen.queryByRole("button")).toBeNull();
    }
    const rating = { userId: "player", score: 501, delta: 1, provisional: false };
    await view.rerender(
      <ScoreIdentity player={player} rank={rank} showGameRating gameRating={rating} />,
    );
    expect(screen.getByRole("image", { name: "Game rating" })).toBeTruthy();
    expect(screen.getByLabelText("Rating increased: +1.00")).toBeTruthy();
    expect(screen.getByText("501.00")).toBeTruthy();
    await view.rerender(<ScoreIdentity player={{ ...player, name: "", username: null }} />);
    expect(screen.getByText("?")).toBeVisible();
    expect(screen.getByText("Username unavailable")).toBeVisible();
  },
);

it.each([
  { delta: 1, label: "Rating increased: +1.00" },
  { delta: -1, label: "Rating decreased: -1.00" },
  { delta: 0, label: "Rating unchanged: 0.00" },
  { delta: -0.001, label: "Rating unchanged: 0.00" },
])("announces the rounded rating delta ($delta)", async ({ delta, label }) => {
  await render(<GameRating rating={{ score: 501.5, provisional: true, delta }} showDelta />, {
    wrapper: NativeTestProviders,
  });
  expect(screen.getByRole("image", { name: "Provisional game rating" })).toBeTruthy();
  expect(screen.getByText("501.50")).toBeVisible();
  expect(screen.getByLabelText(label)).toBeTruthy();
});

it("distinguishes unrated and established ratings without displaying a hidden delta", async () => {
  const view = await render(<GameRating />, { wrapper: NativeTestProviders });
  expect(screen.getByText("Not rated")).toBeVisible();
  expect(screen.getByRole("image", { name: "Game rating" })).toBeTruthy();
  expect(screen.queryByLabelText(/Rating (increased|decreased|unchanged)/)).toBeNull();
  await view.rerender(<GameRating rating={{ score: 500, provisional: false }} />);
  expect(screen.getByText("500.00")).toBeVisible();
  expect(screen.queryByText("Not rated")).toBeNull();
});
