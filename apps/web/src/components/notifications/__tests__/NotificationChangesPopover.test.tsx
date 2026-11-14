import type { NotificationChangeRow } from "@board-game-organizer/schemas";
import type { useNotificationChanges } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { NotificationChangesPopover } from "../NotificationChangesPopover";

// Real HeroUI popover and actions; native/browser geometry is covered by retained acceptance paths.
vi.mock("@heroui/react/rac", async (original) => ({
  ...(await original<typeof import("@heroui/react/rac")>()),
  Virtualizer: ({ children }: { children: ReactNode }) => children,
}));
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
type Model = ReturnType<typeof useNotificationChanges>;
const at = "2026-01-01T00:00:00.000Z";
function row(
  messageCode: NotificationChangeRow["messageCode"],
  requiresResponse = false,
  id = "111111111111111111111111",
): NotificationChangeRow {
  const ref = { notificationId: id, effectiveAt: at };
  return {
    ...ref,
    messageCode,
    title: messageCode === "date" ? "Date updated" : "Table invitation",
    description: "Original actor: Café e società",
    requiresResponse,
    readReference: ref,
  };
}
function model(overrides: Partial<Model> = {}): Model {
  return {
    changes: [row("date"), row("invitation", true, "222222222222222222222222")],
    tabCounts: { details: 1, members: 0, tables: 0, participants: 1 },
    hasNextPage: false,
    fetchNextPage: vi.fn(async () => {}),
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(async () => ({}) as never),
    markDisplayedAsRead: vi.fn(),
    markAllAsRead: vi.fn(async () => {}),
    resetWindow: vi.fn(),
    isReading: false,
    readError: null,
    ...overrides,
  };
}

async function open() {
  fireEvent.click(screen.getByRole("button", { name: "New changes" }));
  return screen.findByRole("dialog");
}

describe("resource-wide notification popover", () => {
  it("keeps an uncached query failure observable without announcing an empty success", async () => {
    renderWithI18n(<NotificationChangesPopover model={model({ changes: [], isError: true })} />);
    const dialog = await open();
    expect(within(dialog).getByRole("alert")).toBeTruthy();
    expect(within(dialog).queryByText("No new changes")).toBeNull();
  });
  it("uses the overlay's measured space and responds to heading/viewport changes", async () => {
    let available = 260;
    const original = window.getComputedStyle;
    const computed = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = original(element, pseudo);
      if (element.classList.contains("popover"))
        Object.defineProperty(style, "maxHeight", { value: `${available}px`, configurable: true });
      return style;
    });
    const view = renderWithI18n(<NotificationChangesPopover model={model()} />);
    await open();
    const heading = screen.getByRole("button", { name: "Mark all changes as read" }).parentElement;
    if (!heading) throw Error("Missing popover heading");
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 60));
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(screen.getByRole("listbox").style.maxHeight).toBe("168px"));
    available = 180;
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(screen.getByRole("listbox").style.maxHeight).toBe("88px"));
    view.unmount();
    computed.mockRestore();
  });
  it("retains a usable popover if the overlay cannot be measured", async () => {
    const original = Element.prototype.closest;
    const closest = vi.spyOn(Element.prototype, "closest").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ".popover" ? null : Reflect.apply(original, this, [selector]);
    });
    renderWithI18n(<NotificationChangesPopover model={model()} />);
    const dialog = await open();
    expect(within(dialog).getByText("Date updated")).toBeTruthy();
    closest.mockRestore();
  });
  it("keeps its warning trigger when empty and opening/closing never reads notifications", async () => {
    const m = model({
      changes: [],
      tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
    });
    renderWithI18n(<NotificationChangesPopover model={m} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("img", { name: "Unread updates" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "New changes" });
    expect(trigger.className).toContain("text-warning-soft-foreground");
    expect(trigger.querySelector(".lucide-bell")).toBeTruthy();
    const dialog = await open();
    expect(within(dialog).getByText("No new changes")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Mark all changes as read" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(m.markAllAsRead).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(m.resetWindow).toHaveBeenCalledTimes(2));
  });
  it("keeps the danger dot inside the trigger and marks the whole resource only on explicit action", async () => {
    const m = model();
    renderWithI18n(<NotificationChangesPopover model={m} />);
    const trigger = screen.getByRole("button", { name: "New changes" });
    const dot = within(trigger).getByRole("img", { name: "Unread updates" });
    expect(dot.parentElement?.className).toContain("right-0");
    expect(dot.parentElement?.className).toContain("top-0");
    const dialog = await open();
    expect(within(dialog).getByText("Date updated")).toBeTruthy();
    expect(within(dialog).getByText("Table invitation")).toBeTruthy();
    expect(within(dialog).getByText("Invitations remain unread until you respond.")).toBeTruthy();
    const read = within(dialog).getByRole("button", { name: "Mark all changes as read" });
    expect(read.className).toContain("button--danger-soft");
    expect(read.className).toContain("min-h-11");
    expect(read.querySelector(".lucide-check-check")).toBeTruthy();
    fireEvent.click(within(dialog).getByText("Date updated"));
    expect(m.markAllAsRead).not.toHaveBeenCalled();
    fireEvent.click(read);
    await waitFor(() => expect(m.markAllAsRead).toHaveBeenCalledOnce());
    expect(m.markDisplayedAsRead).not.toHaveBeenCalled();
  });
  it("protects pending-only invitations and duplicate taps while loading or reading", async () => {
    const m = model({ changes: [row("invitation", true)] });
    const view = renderWithI18n(<NotificationChangesPopover model={m} />);
    await open();
    const button = () => screen.getByRole("button", { name: "Mark all changes as read" });
    fireEvent.click(button());
    expect(m.markAllAsRead).not.toHaveBeenCalled();
    const pending = model({ isReading: true });
    view.rerender(<NotificationChangesPopover model={pending} />);
    expect(screen.getByText("Date updated")).toBeTruthy();
    fireEvent.click(button());
    expect(pending.markAllAsRead).not.toHaveBeenCalled();
    const loading = model({ isPending: true, changes: [] });
    view.rerender(<NotificationChangesPopover model={loading} />);
    fireEvent.click(button());
    expect(loading.markAllAsRead).not.toHaveBeenCalled();
    const offPage = model({ changes: [row("invitation", true)], hasNextPage: true });
    view.rerender(<NotificationChangesPopover model={offPage} />);
    fireEvent.click(button());
    expect(offPage.markAllAsRead).toHaveBeenCalledOnce();
  });
  it.each(["query", "next", "read"] as const)(
    "keeps cached rows and offers the correct retry for %s errors",
    async (error) => {
      const m = model({
        isError: error !== "read",
        isFetchNextPageError: error === "next",
        readError: error === "read" ? Error("failed") : null,
      });
      renderWithI18n(<NotificationChangesPopover model={m} />);
      await open();
      expect(screen.getByText("Date updated")).toBeTruthy();
      expect(screen.getByRole("alert")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      const called =
        error === "query" ? m.refetch : error === "next" ? m.fetchNextPage : m.markAllAsRead;
      await waitFor(() => expect(called).toHaveBeenCalledOnce());
    },
  );
  it("renders loading, grows naturally and requests more only from the open list", async () => {
    const m = model({ hasNextPage: true });
    const view = renderWithI18n(<NotificationChangesPopover model={m} />);
    expect(m.fetchNextPage).not.toHaveBeenCalled();
    await open();
    const list = screen.getByRole("listbox", { name: "Changes" });
    expect(list.style.height).toBe("");
    expect(list.style.maxHeight).not.toBe("");
    fireEvent.scroll(list);
    await waitFor(() => expect(m.fetchNextPage).toHaveBeenCalledOnce());
    const fetching = model({ hasNextPage: true, isFetchingNextPage: true });
    view.rerender(<NotificationChangesPopover model={fetching} />);
    fireEvent.scroll(screen.getByRole("listbox", { name: "Changes" }));
    expect(fetching.fetchNextPage).not.toHaveBeenCalled();
    expect(screen.getByText("Date updated")).toBeTruthy();
  });
  it.each([
    {
      title: "Event confirmed",
      description: "alex: Café and games",
      code: "event_confirmed" as const,
    },
    {
      title: "Evento confermato",
      description: "alex: Café e società",
      code: "event_confirmed" as const,
    },
    {
      title: "Invito a un tavolo",
      description: "alex: Serata del giovedì",
      code: "invitation" as const,
    },
  ])(
    "shows the exact inbox title and description: $title",
    async ({ title, description, code }) => {
      renderWithI18n(
        <NotificationChangesPopover
          model={model({
            changes: [
              { ...row(code), title, description, currentLabel: "Ignored synthetic label" },
            ],
          })}
        />,
      );
      const dialog = await open();
      expect(within(dialog).getByText(title, { exact: true })).toBeTruthy();
      expect(within(dialog).getByText(description, { exact: true })).toBeTruthy();
      expect(within(dialog).queryByText("Ignored synthetic label")).toBeNull();
      expect(within(dialog).queryByText("The event has been confirmed.")).toBeNull();
      expect(within(dialog).queryByText("Invitation updated")).toBeNull();
      expect(within(dialog).getByRole("option").textContent).toBe(`${title}${description}`);
    },
  );
});
