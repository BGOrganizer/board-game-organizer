import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { FloatingActions } from "../FloatingActions";

it.each([false, true])(
  "keeps labeled, focused bottom-right icon navigation and blocks busy clicks: %s",
  (isDisabled) => {
    renderWithI18n(
      <FloatingActions href="#edit" label="Edit event" isDisabled={isDisabled}>
        <span aria-hidden>✎</span>
      </FloatingActions>,
    );
    const link = screen.getByRole("link", { name: "Edit event" });
    expect(link.classList.contains("fixed")).toBe(true);
    expect(link.classList.contains("right-4")).toBe(true);
    expect(link.className).toContain("bottom-");
    expect(link.className).toContain("focus-visible:ring-2");
    expect(fireEvent.click(link)).toBe(!isDisabled);
    expect(link.getAttribute("aria-disabled")).toBe(isDisabled ? "true" : null);
  },
);
it("keeps grouped event creation on the left, away from group edit", () => {
  renderWithI18n(
    <FloatingActions href="#create" label="Create event" left>
      +
    </FloatingActions>,
  );
  const link = screen.getByRole("link", { name: "Create event" });
  expect(link.classList.contains("left-4")).toBe(true);
  expect(link.classList.contains("right-4")).toBe(false);
});
it.each([false, true])(
  "supports a secondary icon-only dialog action without navigation, busy=%s",
  (isDisabled) => {
    const press = vi.fn();
    renderWithI18n(
      <FloatingActions
        label="Reopen planning"
        variant="secondary"
        onPress={press}
        isDisabled={isDisabled}
      >
        <span aria-hidden>↶</span>
      </FloatingActions>,
    );
    const button = screen.getByRole("button", { name: "Reopen planning" });
    expect(button.className).toContain("fixed");
    expect(button.className).toContain("right-4");
    expect(button.className).toContain("button--secondary");
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(button);
    expect(press).toHaveBeenCalledTimes(isDisabled ? 0 : 1);
  },
);
it("defaults to enabled navigation", () => {
  renderWithI18n(
    <FloatingActions href="#new" label="New event">
      +
    </FloatingActions>,
  );
  expect(fireEvent.click(screen.getByRole("link", { name: "New event" }))).toBe(true);
});
