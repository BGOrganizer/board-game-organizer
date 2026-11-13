import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WindowedList } from "../WindowedList";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function browser() {
  let scroll = 0,
    rowHeight = 76,
    next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const observed = new Map<Element, () => void>();
  const disconnect = vi.fn();
  const scrollBy = vi.fn((_x: number, delta: number) => {
    scroll += delta;
  });
  vi.stubGlobal("scrollBy", scrollBy);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      elements: Element[] = [];
      constructor(private callback: () => void) {}
      observe(element: Element) {
        this.elements.push(element);
        observed.set(element, this.callback);
      }
      disconnect() {
        for (const element of this.elements) observed.delete(element);
        disconnect();
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const total = Number.parseFloat(this.style.height) || rowHeight;
    const top = this.tagName === "UL" ? -scroll : Number.parseFloat(this.style.top) - scroll;
    return new DOMRect(0, top, 300, this.tagName === "UL" ? total : rowHeight);
  });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
  return {
    scrollBy,
    disconnect,
    observed,
    frames,
    rowHeight: (height: number) => {
      rowHeight = height;
    },
    scroll: (top: number) => {
      scroll = top;
      fireEvent.scroll(window);
    },
    flush: () =>
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(0);
      }),
  };
}
const items = Array.from({ length: 1000 }, (_, id) => ({ id: String(id) }));
const key = (item: { id: string }) => item.id;
const row = (item: { id: string }) => <button type="button">Row {item.id}</button>;

it("loads an underfilled page on user intent even when the document cannot scroll", () => {
  const b = browser();
  const more = vi.fn();
  render(
    <WindowedList
      items={items.slice(0, 2)}
      itemKey={key}
      renderItem={row}
      label="People"
      estimatedRowHeight={76}
      onEndReached={more}
    />,
  );
  b.flush();
  expect(more).not.toHaveBeenCalled();
  fireEvent.wheel(window);
  b.flush();
  expect(more).toHaveBeenCalledOnce();
});

it("virtualizes document scrolling, uses real variable geometry and only requests another page after interaction", () => {
  const b = browser(),
    more = vi.fn(),
    begin = vi.fn();
  const view = render(
    <WindowedList
      items={items}
      itemKey={key}
      renderItem={row}
      label="People"
      estimatedRowHeight={76}
      onBeginScroll={begin}
      onEndReached={more}
    />,
  );
  b.flush();
  expect(screen.getAllByRole("listitem").length).toBeLessThan(25);
  expect(screen.queryByText("Row 500")).toBeNull();
  expect(screen.getByRole("list").style.overflow).toBe("");
  b.scroll(84_000);
  b.flush();
  expect(more).not.toHaveBeenCalled();
  fireEvent.wheel(window);
  b.scroll(8_400);
  b.flush();
  expect(begin).toHaveBeenCalledOnce();
  expect(screen.queryByText("Row 0")).toBeNull();
  expect(screen.getAllByRole("listitem").length).toBeLessThan(25);
  b.scroll(84_000);
  b.flush();
  expect(more).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, { key: "a" });
  expect(begin).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, { key: "PageDown" });
  fireEvent.touchStart(window);
  expect(begin).toHaveBeenCalledTimes(3);
  fireEvent.resize(window);
  const lateFrame = [...b.frames.values()][0];
  view.unmount();
  act(() => lateFrame(0));
  expect(b.disconnect).toHaveBeenCalled();
});

it("keeps the focused/expanded row mounted outside the visible window and preserves the scroll anchor on measurement", async () => {
  const b = browser();
  const view = render(
    <>
      <button type="button">Outside</button>
      <WindowedList
        items={items}
        itemKey={key}
        renderItem={row}
        label="People"
        estimatedRowHeight={76}
        onEndReached={vi.fn()}
      />
    </>,
  );
  b.flush();
  const first = screen.getByRole("button", { name: "Row 0" });
  act(() => first.focus());
  fireEvent.wheel(window);
  b.scroll(8_400);
  b.flush();
  expect(screen.getByRole("button", { name: "Row 0" })).toBe(first);
  b.rowHeight(100);
  const element = first.closest("li");
  if (!element) throw Error("Measured list row missing");
  act(() => b.observed.get(element)?.());
  expect(b.scrollBy).toHaveBeenCalledWith(0, 24);
  first.setAttribute("aria-expanded", "true");
  act(() => screen.getByText("Outside").focus());
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole("button", { name: "Row 0" })).toBe(first);
  first.removeAttribute("aria-expanded");
  fireEvent.blur(first);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryByText("Row 0")).toBeNull();
  view.unmount();
});
