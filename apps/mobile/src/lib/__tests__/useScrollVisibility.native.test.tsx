import { act, cleanup, renderHook } from "@testing-library/react-native";
import { afterEach, expect, it, vi } from "vitest";
import type { InputScrollTarget } from "../inputScrollContext";
import { useScrollVisibility } from "../useScrollVisibility";

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

it("defers appearance until the viewport has native dimensions", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let viewportHeight = 0;
  const viewport = {
    current: {
      measureInWindow: vi.fn<InputScrollTarget["measureInWindow"]>((measure) =>
        measure(0, 100, 320, viewportHeight),
      ),
    },
  };
  const row = {
    measureInWindow: vi.fn<InputScrollTarget["measureInWindow"]>((measure) =>
      measure(0, 130, 300, 44),
    ),
  };
  const appeared = vi.fn();
  const { result } = await renderHook(() => useScrollVisibility(viewport));
  await act(() => {
    result.current.observeVisibility(row, appeared);
    vi.advanceTimersByTime(100);
  });
  expect(viewport.current.measureInWindow).toHaveBeenCalledOnce();
  expect(row.measureInWindow).not.toHaveBeenCalled();
  expect(appeared).not.toHaveBeenCalled();

  viewportHeight = 400;
  await act(() => {
    result.current.checkVisibility();
    vi.advanceTimersByTime(100);
  });
  expect(row.measureInWindow).toHaveBeenCalledOnce();
  expect(appeared).toHaveBeenCalledOnce();
});
