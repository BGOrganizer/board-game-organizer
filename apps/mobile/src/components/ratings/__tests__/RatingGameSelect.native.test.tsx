import { render, screen, userEvent, within } from "@testing-library/react-native";
import { View } from "react-native";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { RatingGameSelect } from "../RatingGameSelect";

it("shows the selected game’s cover and clears that selection through its standard reset action", async () => {
  const imageUrl = "https://catalog.example.test/chess.png";
  const game = { id: 1, name: "Chess", imageUrl };
  const select = vi.fn();
  const fixture = (value: typeof game | null) => (
    <NativeTestProviders>
      <RatingGameSelect
        value={value}
        selectedId={value?.id ?? null}
        games={[game]}
        onChange={select}
      >
        <View />
      </RatingGameSelect>
    </NativeTestProviders>
  );
  const view = await render(fixture(game));
  const trigger = screen.getByTestId("rating-game-select-trigger");
  expect(trigger).toHaveAccessibleName("Board game: Chess");
  expect(within(trigger).getByText("Chess")).toBeVisible();
  const covers = trigger.queryAll((node) => node.type === "RCTImageView");
  expect(covers).toHaveLength(1);
  expect(covers[0]).toHaveProp("source", [expect.objectContaining({ uri: imageUrl })]);
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(select).toHaveBeenCalledExactlyOnceWith(null);
  await view.rerender(fixture(null));
  expect(screen.getByText("Select a board game")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Clear board game selection" })).toBeNull();
});
