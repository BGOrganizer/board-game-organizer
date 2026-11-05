import { fireEvent, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { SearchInput } from "../common/ui/SearchInput";
import { RatingGameSelect } from "./RatingGameSelect";

const azul = { id: 1, name: "Azul", imageUrl: "https://image.test/azul.png" };
function Picker({
  initial = null,
  metadata = true,
}: {
  initial?: number | null;
  metadata?: boolean;
}) {
  const [id, setId] = useState(initial);
  return (
    <RatingGameSelect
      selectedId={id}
      value={metadata && id === 1 ? azul : undefined}
      games={[azul]}
      onChange={setId}
      footer={<button type="button">Load another page</button>}
    >
      <p>Search header</p>
    </RatingGameSelect>
  );
}
it("keeps selected artwork and a separate clear action in the trigger's own bounds", async () => {
  renderWithI18n(<Picker initial={1} />);
  const trigger = screen.getByRole("button", { name: /Azul Board game/ }),
    clear = screen.getByRole("button", { name: "Clear board game selection" });
  expect(trigger.querySelector("img")?.getAttribute("src")).toBe(azul.imageUrl);
  expect(clear.parentElement).toBe(trigger.parentElement);
  expect(clear.parentElement?.getAttribute("data-slot")).toBe("game-select-control");
  expect(trigger.querySelector("button")).toBeNull();
  fireEvent.click(trigger);
  const option = await screen.findByRole("option", { name: "Azul" });
  expect(option.querySelector("img")?.getAttribute("src")).toBe(azul.imageUrl);
  fireEvent.click(option);
  fireEvent.click(clear);
  expect(screen.queryByRole("option")).toBeNull();
  expect(screen.queryByRole("button", { name: "Clear board game selection" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("can clear a retained ID before missing metadata/history loads, without inventing a first game", () => {
  renderWithI18n(<Picker initial={7} metadata={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.queryByRole("button", { name: "Clear board game selection" })).toBeNull();
  expect(screen.getByRole("button", { name: /Board game/ }).textContent).toContain(
    "Select a board game",
  );
});
it("keeps off-page metadata in the trigger without adding a false search result, and Escape closes focused search", async () => {
  const close = vi.fn();
  renderWithI18n(
    <RatingGameSelect selectedId={1} value={azul} games={[]} onChange={vi.fn()} onClose={close}>
      <SearchInput
        value="casc"
        onChange={vi.fn()}
        label="Filter games"
        placeholder="Filter games"
      />
    </RatingGameSelect>,
  );
  const trigger = screen.getByRole("button", { name: /Azul Board game/ });
  expect(trigger.querySelector("img")?.getAttribute("src")).toBe(azul.imageUrl);
  fireEvent.click(trigger);
  const input = await screen.findByRole("searchbox", { name: "Filter games" });
  expect(screen.queryByRole("option", { name: "Azul" })).toBeNull();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(close).toHaveBeenCalledOnce();
});
it("notifies once when closing is requested again before React commits, then rearms on reopening", async () => {
  let input: HTMLElement | null = null;
  const close = vi.fn(() => {
    // Overlay dismissal and focused-search Escape may request the same close in one event.
    if (close.mock.calls.length === 1 && input) fireEvent.keyDown(input, { key: "Escape" });
  });
  renderWithI18n(
    <StrictMode>
      <RatingGameSelect selectedId={null} games={[]} onChange={vi.fn()} onClose={close}>
        <SearchInput
          value="casc"
          onChange={vi.fn()}
          label="Filter games"
          placeholder="Filter games"
        />
      </RatingGameSelect>
    </StrictMode>,
  );
  const trigger = screen.getByRole("button", { name: /Board game/ });
  fireEvent.click(trigger);
  input = await screen.findByRole("searchbox", { name: "Filter games" });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.click(trigger);
  input = await screen.findByRole("searchbox", { name: "Filter games" });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(close).toHaveBeenCalledTimes(2);
});
it("composes source loading/errors and paging without owning or starting requests", async () => {
  const retry = vi.fn();
  renderWithI18n(
    <RatingGameSelect
      selectedId={null}
      games={[]}
      onChange={vi.fn()}
      empty={
        <button type="button" onClick={retry}>
          Retry owned query
        </button>
      }
      footer={<button type="button">More owned pages</button>}
    >
      <p>Scoped search</p>
    </RatingGameSelect>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry owned query" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(
    screen
      .getByRole("button", { name: "More owned pages" })
      .closest('[data-slot="game-select-control"]'),
  ).toBeNull();
});
