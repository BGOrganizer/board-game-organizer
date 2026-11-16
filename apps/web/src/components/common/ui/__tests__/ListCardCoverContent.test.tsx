import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ListCardCoverContent } from "../ListCardCoverContent";

it("keeps a fixed contained picture and readable body without adding an empty toolbar", () => {
  const { container } = renderWithI18n(
    <ListCardCoverContent artwork={<span>Artwork</span>}>
      <p>Draft facts</p>
    </ListCardCoverContent>,
  );
  expect(screen.getByText("Artwork").parentElement?.className).toContain("size-24");
  expect(screen.getByText("Artwork").parentElement?.className).toContain("overflow-hidden");
  expect(screen.getByText("Draft facts")).toBeTruthy();
  expect(container.querySelector(".overflow-x-auto")).toBeNull();
  expect(container.querySelector('[data-slot="card-controls"]')).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});
it("gives long titles the full width and keeps artwork below the heading, alongside facts and controls", () => {
  const title = "A complete resource title ".repeat(8);
  const view = renderWithI18n(
    <ListCardCoverContent
      heading={<h2>{title}</h2>}
      artwork="Artwork"
      controls={<button type="button">Status</button>}
    >
      <p>Resource facts</p>
    </ListCardCoverContent>,
  );
  const heading = screen.getByRole("heading", { name: title.trim() });
  const body = view.container.querySelector('[data-slot="card-body-row"]');
  const image = view.container.querySelector('[data-slot="card-artwork"]');
  const facts = view.container.querySelector('[data-slot="card-facts"]');
  expect(body?.contains(heading)).toBe(false);
  expect(heading.parentElement?.nextElementSibling).toBe(body);
  expect(body?.firstElementChild).toBe(image);
  expect(body?.children[1]).toBe(facts);
  expect(body?.className).toContain("items-end");
  expect(facts?.contains(screen.getByRole("button", { name: "Status" }))).toBe(false);
  expect(facts?.className).toContain("pb-14");
  expect(body?.lastElementChild?.contains(screen.getByRole("button", { name: "Status" }))).toBe(
    true,
  );
  expect(facts?.contains(screen.getByText("Resource facts"))).toBe(true);
});
it.each([false, true])(
  "keeps a full-width single action row scrollable and preserves the saving-only interaction lock: %s",
  (disabled) => {
    const action = vi.fn();
    const { container } = renderWithI18n(
      <ListCardCoverContent
        artwork="Artwork"
        controlsDisabled={disabled}
        controls={
          <button type="button" onClick={action}>
            Info
          </button>
        }
      >
        <p>Facts</p>
      </ListCardCoverContent>,
    );
    const toolbar = container.querySelector('[data-slot="card-controls"]');
    expect(toolbar?.hasAttribute("inert")).toBe(disabled);
    expect(toolbar?.className).toContain("absolute inset-x-0 bottom-0");
    expect(toolbar?.className).toContain("overflow-x-auto");
    expect(toolbar?.firstElementChild?.className).toContain("flex-nowrap");
    expect(toolbar?.firstElementChild?.className).toContain("min-w-full");
    expect(toolbar?.firstElementChild?.className).toContain("justify-end");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stop = vi.spyOn(click, "stopPropagation");
    fireEvent(screen.getByRole("button", { name: "Info" }), click);
    expect(action).toHaveBeenCalledTimes(disabled ? 0 : 1);
    expect(click.defaultPrevented).toBe(disabled);
    expect(stop).toHaveBeenCalledTimes(disabled ? 1 : 0);
  },
);
