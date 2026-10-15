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
    expect(link.className).toContain("fixed right-4 bottom-");
    expect(link.className).toContain("focus-visible:ring-2");
    expect(fireEvent.click(link)).toBe(!isDisabled);
    expect(link.getAttribute("aria-disabled")).toBe(isDisabled ? "true" : null);
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
