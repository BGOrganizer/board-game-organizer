import { act, cleanup, render, screen } from "@testing-library/react-native";
import {
  Keyboard,
  type KeyboardEvent,
  type KeyboardEventName,
  Platform,
  Text,
  View,
} from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { useKeyboardHeight } from "../useKeyboardHeight";

// Actual React/useSyncExternalStore and installed RN hosts. Only the OS event
// boundary and initial keyboard metrics are controlled; no device timing claim.
const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
function Probe({ label }: { label: string }) {
  const height = useKeyboardHeight();
  return <Text>{`${label}: ${height}`}</Text>;
}
function Owners({ first = true, second = true }: { first?: boolean; second?: boolean }) {
  return (
    <View>
      {first ? <Probe label="First" /> : null}
      {second ? <Probe label="Second" /> : null}
    </View>
  );
}
function keyboardBoundary(os: "ios" | "android", initialHeight?: number) {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
  const handlers = new Map<KeyboardEventName, Set<(event: KeyboardEvent) => void>>();
  const removals = vi.fn();
  const metrics = vi.spyOn(Keyboard, "metrics").mockReturnValue(
    initialHeight === undefined
      ? undefined
      : {
          screenX: 0,
          screenY: 800 - initialHeight,
          width: 390,
          height: initialHeight,
        },
  );
  const subscribeNative = Keyboard.addListener.bind(Keyboard);
  const subscriptions = vi.spyOn(Keyboard, "addListener").mockImplementation((name, callback) => {
    const listeners = handlers.get(name) ?? new Set();
    listeners.add(callback);
    handlers.set(name, listeners);
    const subscription = subscribeNative(name, callback);
    const removeNative = subscription.remove.bind(subscription);
    subscription.remove = () => {
      listeners.delete(callback);
      removals(name);
      removeNative();
    };
    return subscription;
  });
  const emit = async (name: KeyboardEventName, height = 0) => {
    await act(() => {
      const event: KeyboardEvent = {
        duration: 0,
        easing: "keyboard",
        endCoordinates: {
          screenX: 0,
          screenY: 800 - height,
          width: 390,
          height,
        },
      };
      for (const handler of handlers.get(name) ?? []) handler(event);
    });
  };
  return { metrics, subscriptions, removals, emit };
}
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
});

it.each(["ios", "android"] as const)(
  "shares the actual React keyboard snapshot and releases native subscriptions after the final %s owner",
  async (os) => {
    const boundary = keyboardBoundary(os, 180);
    const view = await render(<Owners />);
    expect(screen.getByText("First: 180")).toBeOnTheScreen();
    expect(screen.getByText("Second: 180")).toBeOnTheScreen();
    expect(boundary.subscriptions.mock.calls.map(([name]) => name)).toEqual([
      os === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
      "keyboardDidHide",
    ]);
    expect(boundary.metrics).toHaveBeenCalledOnce();
    await boundary.emit(os === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow", 300);
    expect(screen.getByText("First: 300")).toBeOnTheScreen();
    expect(screen.getByText("Second: 300")).toBeOnTheScreen();
    await boundary.emit("keyboardDidHide");
    expect(screen.getByText("First: 0")).toBeOnTheScreen();
    expect(screen.getByText("Second: 0")).toBeOnTheScreen();
    await view.rerender(<Owners first={false} />);
    expect(screen.queryByText(/^First:/)).toBeNull();
    expect(boundary.removals).not.toHaveBeenCalled();
    await boundary.emit(os === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow", 240);
    expect(screen.getByText("Second: 240")).toBeOnTheScreen();
    await view.unmount();
    expect(boundary.removals.mock.calls.map(([name]) => name)).toEqual([
      os === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
      "keyboardDidHide",
    ]);
  },
);

it.each(["ios", "android"] as const)(
  "starts at zero without native %s metrics, clamps negative geometry and ignores the other platform's show event",
  async (os) => {
    const boundary = keyboardBoundary(os);
    await render(<Owners second={false} />);
    expect(screen.getByText("First: 0")).toBeOnTheScreen();
    const shown = os === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const other = os === "ios" ? "keyboardDidShow" : "keyboardWillChangeFrame";
    await boundary.emit(shown, 200);
    expect(screen.getByText("First: 200")).toBeOnTheScreen();
    await boundary.emit(other, 500);
    expect(screen.getByText("First: 200")).toBeOnTheScreen();
    await boundary.emit(shown, -20);
    expect(screen.getByText("First: 0")).toBeOnTheScreen();
  },
);

it("retains current height for a newly mounted owner without replacing the shared native listeners", async () => {
  const boundary = keyboardBoundary("android");
  const view = await render(<Owners second={false} />);
  await boundary.emit("keyboardDidShow", 320);
  await view.rerender(<Owners />);
  expect(screen.getByText("First: 320")).toBeOnTheScreen();
  expect(screen.getByText("Second: 320")).toBeOnTheScreen();
  expect(boundary.subscriptions).toHaveBeenCalledTimes(2);
  expect(boundary.metrics).toHaveBeenCalledOnce();
  expect(boundary.removals).not.toHaveBeenCalled();
});

it("clears the retired snapshot and acquires fresh native metrics on the next mounted owner", async () => {
  const boundary = keyboardBoundary("android", 180);
  const first = await render(<Owners second={false} />);
  await boundary.emit("keyboardDidShow", 360);
  expect(screen.getByText("First: 360")).toBeOnTheScreen();
  await first.unmount();
  expect(boundary.removals).toHaveBeenCalledTimes(2);
  boundary.metrics.mockReturnValue(undefined);
  await render(<Owners first={false} />);
  expect(screen.getByText("Second: 0")).toBeOnTheScreen();
  expect(boundary.subscriptions).toHaveBeenCalledTimes(4);
  expect(boundary.metrics).toHaveBeenCalledTimes(2);
});
