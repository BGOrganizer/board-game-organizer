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
  expect(screen.queryByRole("link")).toBeNull();
});
it.each([false, true])(
  "preserves single-row controls and the saving-only interaction lock: %s",
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
    const toolbar = container.querySelector(".overflow-x-auto");
    expect(toolbar?.hasAttribute("inert")).toBe(disabled);
    expect(toolbar?.firstElementChild?.className).toContain("flex-nowrap");
    expect(toolbar?.firstElementChild?.className).toContain("justify-end");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stop = vi.spyOn(click, "stopPropagation");
    fireEvent(screen.getByRole("button", { name: "Info" }), click);
    expect(action).toHaveBeenCalledTimes(disabled ? 0 : 1);
    expect(click.defaultPrevented).toBe(disabled);
    expect(stop).toHaveBeenCalledTimes(disabled ? 1 : 0);
  },
);
