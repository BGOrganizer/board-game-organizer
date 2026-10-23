import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
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
it("defaults to enabled navigation", () => {
  renderWithI18n(
    <FloatingActions href="#new" label="New event">
      +
    </FloatingActions>,
  );
  expect(fireEvent.click(screen.getByRole("link", { name: "New event" }))).toBe(true);
});
