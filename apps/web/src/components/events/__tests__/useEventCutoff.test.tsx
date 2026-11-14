import { useEventCutoff } from "@board-game-organizer/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());
it("closes exactly at the public boundary without any request or polling loop", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-06-01T12:00:00Z"));
  const q = renderHook(() => useEventCutoff("2030-06-01T12:00:01Z", true));
  expect(q.result.current).toBe(false);
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(q.result.current).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not close private/standalone events or schedule invalid/already elapsed deadlines", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-06-01T12:00:00Z"));
  expect(renderHook(() => useEventCutoff(undefined, true)).result.current).toBe(false);
  expect(renderHook(() => useEventCutoff("invalid", true)).result.current).toBe(false);
  expect(renderHook(() => useEventCutoff("2000-01-01T00:00:00Z", false)).result.current).toBe(
    false,
  );
  expect(renderHook(() => useEventCutoff("2000-01-01T00:00:00Z", true)).result.current).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("caps long timers, rechecks remaining time and cancels obsolete callbacks", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  const at = Date.now() + 2147483647 + 2000,
    q = renderHook(({ active }) => useEventCutoff(new Date(at).toISOString(), active), {
      initialProps: { active: true },
    });
  expect(vi.getTimerCount()).toBe(1);
  act(() => {
    vi.advanceTimersByTime(2147483647);
  });
  expect(q.result.current).toBe(false);
  expect(vi.getTimerCount()).toBe(1);
  q.rerender({ active: false });
  expect(vi.getTimerCount()).toBe(0);
  q.unmount();
});
