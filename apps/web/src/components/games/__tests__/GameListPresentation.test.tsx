import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GameCatalogMetadata } from "../GameCatalogMetadata";
import { GameListCard } from "../GameListCard";

it("renders a non-actionable game row and recovers an image only after its URL changes", () => {
  const view = renderWithI18n(
    <GameListCard name="Ark Nova" imageUrl="https://images.example/first.jpg" />,
  );
  expect(screen.getByRole("listitem")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  const image = view.container.querySelector("img");
  expect(image?.getAttribute("src")).toBe("https://images.example/first.jpg");
  if (!image) throw new Error("The supplied game image was not rendered");
  fireEvent.error(image);
  expect(view.container.querySelector("img")).toBeNull();
  expect(screen.getByText("Ark Nova")).toBeTruthy();
  view.rerender(<GameListCard name="Ark Nova" imageUrl="https://images.example/first.jpg" />);
  expect(view.container.querySelector("img")).toBeNull();
  view.rerender(<GameListCard name="Ark Nova" imageUrl="https://images.example/replacement.jpg" />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
    "https://images.example/replacement.jpg",
  );
});

it("keeps game selection and trailing actions independent while showing supplied facts", () => {
  const selected = vi.fn(),
    trailing = vi.fn();
  renderWithI18n(
    <GameListCard
      name="Cascadia"
      onPress={selected}
      year={2021}
      average={7.83}
      rank={42}
      durationMinutes={60}
      titleAccessory={<span>Owned</span>}
      metadata={<span>Collection copy</span>}
      actions={
        <button type="button" onClick={trailing}>
          Remove game
        </button>
      }
    >
      <p>Suggested for tonight</p>
    </GameListCard>,
  );
  expect(screen.getByText("Owned")).toBeTruthy();
  expect(screen.getByText("Collection copy")).toBeTruthy();
  expect(screen.getByText("Suggested for tonight")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Average: 7.83" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Rank: 42" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove game" }));
  expect(trailing).toHaveBeenCalledOnce();
  expect(selected).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cascadia" }));
  expect(selected).toHaveBeenCalledOnce();
});

it("omits unknown game metadata without fabricating values", () => {
  const view = renderWithI18n(<GameCatalogMetadata />);
  expect(view.container.textContent).toBe("");
  expect(view.container.childElementCount).toBe(0);
  view.rerender(<GameCatalogMetadata year={0} average={null} rank={null} />);
  expect(view.container.childElementCount).toBe(0);
});

it.each([0, 1, 60])("shows an explicitly provided duration of %s minutes", (durationMinutes) => {
  renderWithI18n(<GameCatalogMetadata durationMinutes={durationMinutes} />);
  expect(
    screen.getByText(`${durationMinutes} ${durationMinutes === 1 ? "minute" : "minutes"}`),
  ).toBeTruthy();
});
