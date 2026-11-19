import { Gesture } from "react-native-gesture-handler";
import { expect, it, vi } from "vitest";

it("records Gorhom's public pan configuration and callbacks without executing a native gesture", () => {
  const start = vi.fn(),
    change = vi.fn(),
    end = vi.fn(),
    finalize = vi.fn();
  const external = Gesture.Native();
  const pan = Gesture.Pan();
  const configured = pan
    .enabled(true)
    .shouldCancelWhenOutside(false)
    .runOnJS(false)
    .onStart(start)
    .onChange(change)
    .onEnd(end)
    .onFinalize(finalize)
    .requireExternalGestureToFail(external)
    .simultaneousWithExternalGesture(external)
    .activeOffsetX([-8, 8])
    .activeOffsetY([-12, 12])
    .failOffsetX([-40, 40])
    .failOffsetY([-60, 60]);
  expect(configured).toBe(pan);
  expect(pan.toGestureArray()).toEqual([pan]);
  expect(pan.shouldCancelWhenOutside).toHaveBeenCalledExactlyOnceWith(false);
  expect(pan.runOnJS).toHaveBeenCalledExactlyOnceWith(false);
  expect(pan.requireExternalGestureToFail).toHaveBeenCalledExactlyOnceWith(external);
  expect(pan.simultaneousWithExternalGesture).toHaveBeenCalledExactlyOnceWith(external);
  expect(pan.activeOffsetX).toHaveBeenCalledExactlyOnceWith([-8, 8]);
  expect(pan.activeOffsetY).toHaveBeenCalledExactlyOnceWith([-12, 12]);
  expect(pan.failOffsetX).toHaveBeenCalledExactlyOnceWith([-40, 40]);
  expect(pan.failOffsetY).toHaveBeenCalledExactlyOnceWith([-60, 60]);
  for (const [registration, callback] of [
    [pan.onStart, start],
    [pan.onChange, change],
    [pan.onEnd, end],
    [pan.onFinalize, finalize],
  ] as const) {
    expect(registration).toHaveBeenCalledExactlyOnceWith(callback);
    expect(callback).not.toHaveBeenCalled();
  }
});

it("keeps native scrollable configurations isolated while preserving the maintained tap builder", () => {
  const pan = Gesture.Pan();
  const first = Gesture.Native();
  const second = Gesture.Native();
  expect(first).not.toBe(second);
  expect(
    first
      .enabled(true)
      .simultaneousWithExternalGesture(...pan.toGestureArray())
      .shouldCancelWhenOutside(false),
  ).toBe(first);
  expect(second.shouldCancelWhenOutside(true)).toBe(second);
  expect(first.shouldCancelWhenOutside).toHaveBeenCalledExactlyOnceWith(false);
  expect(second.shouldCancelWhenOutside).toHaveBeenCalledExactlyOnceWith(true);
  expect(first.toGestureArray()).toEqual([first]);
  expect(second.toGestureArray()).toEqual([second]);
  const tap = Gesture.Tap();
  const action = vi.fn();
  expect(tap.enabled(true).onStart(action)).toBe(tap);
  expect(tap.onStart).toHaveBeenCalledExactlyOnceWith(action);
  expect(action).not.toHaveBeenCalled();
});
