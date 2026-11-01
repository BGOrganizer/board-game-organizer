import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useAppStore } from "@board-game-organizer/store";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { NotificationAttentionBorder } from "@/components/common/ui/NotificationAttentionBorder";
import { renderWithI18n } from "@/test-utils";
import { createAttentionPulseSlice } from "../../../../../../packages/store/src/slices/attentionPulseSlice";

const owner = JSON.stringify(["https://api.test", "user"]),
  itemId = "item";
const first = "2027-01-01T00:00:00.000Z|000000000000000000000001";
const second = "2027-01-01T00:00:01.000Z|000000000000000000000002";
let reduced = false;
const mediaListeners = new Set<() => void>();
let observers: Array<(visible: boolean) => void> = [];
function visible(value: boolean) {
  act(() => {
    for (const notify of observers) notify(value);
  });
}
function foreground(value: boolean) {
  act(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: value ? "visible" : "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
function motion(value: boolean) {
  act(() => {
    reduced = value;
    for (const listener of mediaListeners) listener();
  });
}
const pulse = (signal = first, who = owner) => ({ owner: who, itemId, signal });
const animated = () => document.querySelector(".notification-attention-pulse");
it("keeps pulse-only opacity motion below five seconds and provides an immediate reduced-motion CSS fallback", () => {
  const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");
  expect(css).toMatch(/notification-attention-pulse 1\.6s[^;]* 3;/);
  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.notification-attention-pulse\s*\{\s*animation: none;/,
  );
  expect(css).toContain("pointer-events: none;");
});
beforeEach(() => {
  useAppStore.setState({ playedAttentionPulses: {} });
  reduced = false;
  observers = [];
  mediaListeners.clear();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn),
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push((shown) =>
          callback(
            [{ isIntersecting: shown }] as IntersectionObserverEntry[],
            this as unknown as IntersectionObserver,
          ),
        );
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  cleanup();
  useAppStore.setState({ playedAttentionPulses: {} });
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "visibilityState");
});
it("plays a source signal once, retains its border after three CSS cycles and replays only a newer signal", () => {
  const view = renderWithI18n(<NotificationAttentionBorder active pulse={pulse()} />);
  expect(animated()).toBeNull();
  visible(true);
  expect(animated()).not.toBeNull();
  // jsdom lacks AnimationEvent, so React registers the WebKit compatibility event.
  fireEvent(animated()!, new Event("webkitAnimationEnd", { bubbles: true }));
  expect(animated()).toBeNull();
  expect(screen.getByRole("img", { name: "Needs attention" })).toBeTruthy();
  view.rerender(<NotificationAttentionBorder active pulse={pulse()} />);
  expect(animated()).toBeNull();
  view.rerender(<NotificationAttentionBorder active pulse={pulse(second)} />);
  expect(animated()).not.toBeNull();
  view.rerender(<NotificationAttentionBorder active pulse={pulse(first)} />);
  expect(animated()).toBeNull();
  view.rerender(<NotificationAttentionBorder active pulse={pulse(second)} />);
  expect(animated()).toBeNull();
});
it("starts a distinct presentation when owner/item changes even if one notice gives both items the same signal", () => {
  const view = renderWithI18n(<NotificationAttentionBorder active pulse={pulse()} />);
  visible(true);
  const original = animated();
  view.rerender(
    <NotificationAttentionBorder active pulse={{ ...pulse(), itemId: "another-item" }} />,
  );
  expect(animated()).not.toBeNull();
  expect(animated()).not.toBe(original);
  const secondItem = animated();
  view.rerender(
    <NotificationAttentionBorder
      active
      pulse={{ ...pulse(), owner: "other-owner", itemId: "another-item" }}
    />,
  );
  expect(animated()).not.toBeNull();
  expect(animated()).not.toBe(secondItem);
});
it("does not replay on screen remount, foreground return, observer changes or optimistic read rollback", () => {
  let view = renderWithI18n(<NotificationAttentionBorder active pulse={pulse()} />);
  visible(true);
  expect(animated()).not.toBeNull();
  foreground(false);
  expect(animated()).toBeNull();
  foreground(true);
  expect(animated()).toBeNull();
  visible(false);
  visible(true);
  expect(animated()).toBeNull();
  view.rerender(<NotificationAttentionBorder active={false} pulse={pulse()} />);
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(<NotificationAttentionBorder active pulse={pulse()} />);
  visible(true);
  expect(animated()).toBeNull();
  view.unmount();
  expect(mediaListeners.size).toBe(0);
  observers = [];
  view = renderWithI18n(<NotificationAttentionBorder active pulse={pulse()} />);
  visible(true);
  expect(animated()).toBeNull();
  view.rerender(<NotificationAttentionBorder active pulse={pulse(second)} />);
  expect(animated()).not.toBeNull();
});
it("waits for visibility and foreground, handles dynamic reduced motion without later replay and isolates accounts", () => {
  motion(true);
  const view = renderWithI18n(<NotificationAttentionBorder active pulse={pulse()} />);
  visible(true);
  expect(animated()).toBeNull();
  motion(false);
  expect(animated()).toBeNull();
  visible(false);
  view.rerender(<NotificationAttentionBorder active pulse={pulse(second)} />);
  expect(animated()).toBeNull();
  visible(true);
  expect(animated()).not.toBeNull();
  motion(true);
  expect(animated()).toBeNull();
  motion(false);
  expect(animated()).toBeNull();
  foreground(false);
  view.rerender(<NotificationAttentionBorder active pulse={pulse(second, "other-owner")} />);
  expect(animated()).toBeNull();
  foreground(true);
  expect(animated()).not.toBeNull();
});
it("keeps cards static and absent attention empty; supports environments without IntersectionObserver", () => {
  const view = renderWithI18n(<NotificationAttentionBorder active />);
  expect(screen.getByRole("img", { name: "Needs attention" })).toBeTruthy();
  expect(animated()).toBeNull();
  expect(observers).toEqual([]);
  view.rerender(<NotificationAttentionBorder active={false} />);
  expect(screen.queryByRole("img")).toBeNull();
  vi.stubGlobal("IntersectionObserver", undefined);
  view.rerender(<NotificationAttentionBorder active pulse={pulse()} />);
  expect(animated()).not.toBeNull();
  view.rerender(<NotificationAttentionBorder active pulse={{ owner, itemId }} />);
  expect(animated()).toBeNull();
});
it("stores only presentation high-water marks for the current store lifetime, never persisting read state", () => {
  const store = createStore(createAttentionPulseSlice);
  expect(store.getState().claimAttentionPulse(owner, itemId, first)).toBe(true);
  expect(store.getState().claimAttentionPulse(owner, itemId, first)).toBe(false);
  expect(store.getState().claimAttentionPulse(owner, itemId, second)).toBe(true);
  expect(store.getState().claimAttentionPulse(owner, itemId, first)).toBe(false);
  expect(store.getState().claimAttentionPulse("another-user", itemId, first)).toBe(true);
  expect(store.getState().claimAttentionPulse(owner, "another-item", first)).toBe(true);
  expect(
    createStore(createAttentionPulseSlice).getState().claimAttentionPulse(owner, itemId, first),
  ).toBe(true);
});
