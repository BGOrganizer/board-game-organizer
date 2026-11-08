import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { renderWithI18n } from "@/test-utils";

it.each([{}, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }])(
  "preserves normal and modified navigation %j without treating help as navigation",
  (modifiers) => {
    const onOpen = vi.fn();
    renderWithI18n(
      <LinkedListCard
        href="/events/id"
        label="Open event"
        artwork={<span>Artwork</span>}
        onOpen={onOpen}
      >
        Event
      </LinkedListCard>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Open event" }), modifiers);
    expect(onOpen).toHaveBeenCalledTimes(Object.keys(modifiers).length ? 0 : 1);
  },
);
it("lets cover-card controls use the complete width on one scrollable row, outside navigation", () => {
  const q = renderWithI18n(
    <LinkedListCard
      href="/events/id"
      label="Event"
      artworkLayout="cover"
      artwork={<span>Artwork</span>}
      leadingActions={<button type="button">Info</button>}
      actions={<button type="button">Action</button>}
    >
      Title
    </LinkedListCard>,
  );
  const button = screen.getByRole("button", { name: "Info" });
  const row = button.parentElement,
    toolbar = row?.parentElement,
    body = toolbar?.parentElement;
  expect(row?.className).toContain("flex-nowrap");
  expect(row?.className).toContain("[&>*]:shrink-0");
  expect(toolbar?.className).toContain("overflow-x-auto");
  expect(body?.className).toContain("flex-col");
  expect(toolbar?.previousElementSibling?.className).toContain("ml-[80px]");
  expect(toolbar?.previousElementSibling?.contains(toolbar ?? null)).toBe(false);
  expect(button.closest("a")).toBeNull();
  expect(screen.getByRole("button", { name: "Action" }).parentElement).toBe(row);
  q.rerender(
    <LinkedListCard
      href="/events/id"
      label="Event"
      artworkLayout="cover"
      artwork={<span>Artwork</span>}
    >
      Title
    </LinkedListCard>,
  );
  expect(q.container.querySelector(".overflow-x-auto")).toBeNull();
});
it("shares match/group card padding, keeps actions outside link and blocks optimistic navigation", () => {
  const onAction = vi.fn();
  renderWithI18n(
    <LinkedListCard
      href="/matches/1"
      label="Open match"
      artwork={<span aria-hidden>Artwork</span>}
      disabled
      leadingActions={
        <button type="button" onClick={onAction}>
          Legend
        </button>
      }
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
  expect(link.className).toContain("inset-0");
  expect(link.closest(".card")?.querySelector(".card__content")?.className).toContain("p-4");
  expect(link.getAttribute("aria-disabled")).toBe("true");
  expect(link.contains(screen.getByRole("button", { name: "Accept" }))).toBe(false);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  fireEvent(link, click);
  expect(click.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(onAction).toHaveBeenCalledOnce();
  const legend = screen.getByRole("button", { name: "Legend" });
  expect(link.contains(legend)).toBe(false);
  expect(legend.parentElement?.className).toContain("flex-wrap");
  expect(legend.parentElement?.className).not.toContain("absolute");
  expect(screen.getByRole("button", { name: "Accept" }).parentElement).toBe(legend.parentElement);
  fireEvent.click(legend);
  expect(onAction).toHaveBeenCalledTimes(2);
});
