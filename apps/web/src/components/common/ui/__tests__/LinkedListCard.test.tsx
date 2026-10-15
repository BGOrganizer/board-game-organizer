import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { renderWithI18n } from "@/test-utils";

it("shares match/group card padding, keeps actions outside link and blocks optimistic navigation", () => {
  const onAction = vi.fn();
  renderWithI18n(
    <LinkedListCard
      href="/matches/1"
      label="Open match"
      disabled
      actions={
        <button type="button" onClick={onAction}>
          Accept
        </button>
      }
    >
      Match
    </LinkedListCard>,
  );
  const link = screen.getByRole("link", { name: "Open match" });
  expect(link.className).toContain("p-3");
  expect(link.getAttribute("aria-disabled")).toBe("true");
  expect(link.contains(screen.getByRole("button", { name: "Accept" }))).toBe(false);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  fireEvent(link, click);
  expect(click.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(onAction).toHaveBeenCalledOnce();
});
