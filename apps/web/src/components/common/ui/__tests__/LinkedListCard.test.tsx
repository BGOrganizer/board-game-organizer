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
it("keeps a lone action usable without leading controls or an optional navigation callback", () => {
  const action = vi.fn();
  const view = renderWithI18n(
    <LinkedListCard
      href="/events/id"
      label="Open event"
      artworkLayout="cover"
      artwork="Artwork"
      actions={
        <button type="button" onClick={action}>
          Retry
        </button>
      }
    >
      Facts
    </LinkedListCard>,
  );
  const link = screen.getByRole("link", { name: "Open event" });
  const navigation = new MouseEvent("click", { bubbles: true, cancelable: true });
  fireEvent(link, navigation);
  expect(action).not.toHaveBeenCalled();
  expect(link.getAttribute("href")).toBe("/events/id");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(action).toHaveBeenCalledOnce();
  expect(link.contains(screen.getByRole("button", { name: "Retry" }))).toBe(false);
  expect(
    view.container
      .querySelector('[data-slot="card-facts"]')
      ?.contains(screen.getByRole("button", { name: "Retry" })),
  ).toBe(true);
});
it("puts cover-card controls beside bottom-aligned artwork, below a full-width heading", () => {
  const q = renderWithI18n(
    <LinkedListCard
      href="/events/id"
      label="Event"
      artworkLayout="cover"
      heading={<h2>Title</h2>}
      artwork={<span>Artwork</span>}
      leadingActions={<button type="button">Info</button>}
      actions={<button type="button">Action</button>}
    >
      Facts
    </LinkedListCard>,
  );
  const button = screen.getByRole("button", { name: "Info" });
  const toolbar = button.parentElement,
    facts = toolbar?.parentElement,
    body = facts?.parentElement;
  expect(toolbar?.className).toContain("flex-wrap");
  expect(toolbar?.className).toContain("[&>*]:shrink-0");
  expect(toolbar?.className).not.toContain("overflow-x-auto");
  expect(facts?.className).toContain("flex-col");
  expect(body?.className).toContain("items-end");
  const imageFrame = body?.querySelector(".size-24");
  expect(imageFrame?.className).toContain("relative");
  expect(imageFrame?.className).not.toContain("absolute");
  expect(imageFrame?.contains(toolbar ?? null)).toBe(false);
  expect(body?.contains(screen.getByRole("heading", { name: "Title" }))).toBe(false);
  expect(button.closest("a")).toBeNull();
  expect(screen.getByRole("button", { name: "Action" }).parentElement).toBe(toolbar);
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
  expect(q.container.querySelector('[data-slot="card-controls"]')).toBeNull();
});
it.each(["cover", "thumbnail"] as const)(
  "locks visible %s controls only when explicitly saving, without removing the toolbar",
  (artworkLayout) => {
    const onAction = vi.fn();
    const card = (saving: boolean) => (
      <LinkedListCard
        href="/groups/id"
        label="Group"
        disabled
        controlsDisabled={saving}
        artworkLayout={artworkLayout}
        artwork={<span>Artwork</span>}
        leadingActions={
          <button type="button" onClick={onAction}>
            Info
          </button>
        }
        actions={
          <button type="button" onClick={onAction}>
            Check saved changes
          </button>
        }
      >
        Unchanged title and facts
      </LinkedListCard>
    );
    const view = renderWithI18n(card(true));
    const info = screen.getByText("Info");
    const toolbar = info.closest("[inert]");
    expect(toolbar).not.toBeNull();
    const classes = toolbar?.className;
    expect(info.isConnected).toBe(true);
    expect(screen.getByText("Unchanged title and facts")).toBeTruthy();
    fireEvent.click(info);
    fireEvent.click(screen.getByText("Check saved changes"));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Group" }).tabIndex).toBe(-1);
    view.rerender(card(false));
    expect(toolbar?.isConnected).toBe(true);
    expect(toolbar?.className).toBe(classes);
    expect(toolbar?.hasAttribute("inert")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Check saved changes" }));
    expect(onAction).toHaveBeenCalledOnce();
    // Navigation may stay disabled while the explicit uncertain-write check remains available.
    expect(screen.getByRole("link", { name: "Group" }).getAttribute("aria-disabled")).toBe("true");
  },
);
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
