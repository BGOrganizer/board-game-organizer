import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  userEvent,
} from "@testing-library/react-native";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { PressableFeedback } from "heroui-native/pressable-feedback";
import { Dices } from "lucide-react-native";
import { useState } from "react";
import { processColor, StyleSheet, Text } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { FilterChips } from "../FilterChips";

// Native responder fields match the installed RNTL touch-event builders.
// This is an OS event fixture; the real RN Pressability state machine runs.
function responderEvent(registrationName: string) {
  return {
    nativeEvent: {
      changedTouches: [],
      identifier: 0,
      locationX: 0,
      locationY: 0,
      pageX: 0,
      pageY: 0,
      target: 0,
      timestamp: Date.now(),
      touches: [],
    },
    currentTarget: { measure: () => {} },
    target: {},
    preventDefault: () => {},
    isDefaultPrevented: () => false,
    stopPropagation: () => {},
    isPropagationStopped: () => false,
    persist: () => {},
    isPersistent: () => false,
    timeStamp: Date.now(),
    dispatchConfig: { registrationName },
  };
}
async function grant(trigger: ReturnType<typeof screen.getByRole>) {
  expect(typeof trigger.props.onResponderGrant).toBe("function");
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  await fireEvent(trigger, "responderGrant", responderEvent("onResponderGrant"));
  // RN's minimum press duration is130ms; advance its real JS timer, not worklets.
  await act(() => vi.advanceTimersByTimeAsync(150));
}
async function release(trigger: ReturnType<typeof screen.getByRole>) {
  expect(typeof trigger.props.onResponderRelease).toBe("function");
  await fireEvent(trigger, "responderRelease", responderEvent("onResponderRelease"));
  vi.useRealTimers();
}
afterEach(async () => {
  vi.useRealTimers();
  await cleanup();
  vi.restoreAllMocks();
});

it.each(["PressableFeedback", "Button"] as const)(
  "keeps actual %s press-in/out separate from completed action and blocks a disabled native tap",
  async (kind) => {
    const palette = await renderHook(() => useThemeColor("accent"), {
      wrapper: NativeTestProviders,
    });
    const order: string[] = [];
    const action = vi.fn(() => {
      order.push("press");
    });
    const pressIn = vi.fn(() => {
      expect(action).not.toHaveBeenCalled();
      order.push("in");
    });
    const pressOut = vi.fn(() => {
      expect(action).not.toHaveBeenCalled();
      order.push("out");
    });
    const fixture = (disabled: boolean) => (
      <NativeTestProviders>
        {kind === "PressableFeedback" ? (
          <PressableFeedback
            isDisabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Games"
            className="bg-accent flex-row items-center justify-center"
            onPress={action}
            onPressIn={pressIn}
            onPressOut={pressOut}
          >
            <Text>Games</Text>
          </PressableFeedback>
        ) : (
          <Button
            isDisabled={disabled}
            variant="primary"
            accessibilityLabel="Games"
            onPress={action}
            onPressIn={pressIn}
            onPressOut={pressOut}
          >
            <Button.Label>Games</Button.Label>
          </Button>
        )}
      </NativeTestProviders>
    );
    const view = await render(fixture(false));
    const trigger = screen.getByRole("button", { name: "Games" });
    expect(trigger).toBeEnabled();
    expect(processColor(StyleSheet.flatten(trigger.props.style).backgroundColor)).toBe(
      processColor(palette.result.current),
    );
    await grant(trigger);
    expect(pressIn).toHaveBeenCalledOnce();
    expect(pressOut).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(order).toEqual(["in"]);
    await release(trigger);
    expect(pressOut).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
    expect(order).toEqual(["in", "out", "press"]);
    await view.rerender(fixture(true));
    expect(screen.getByRole("button", { name: "Games" })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: "Games" }));
    expect(action).toHaveBeenCalledOnce();
    expect(pressIn).toHaveBeenCalledOnce();
    expect(pressOut).toHaveBeenCalledOnce();
  },
);

it("toggles the actual controlled HeroUI filter only on responder release, retaining compiled primary styling", async () => {
  const palette = await renderHook(() => useThemeColor("accent"), { wrapper: NativeTestProviders });
  const toggle = vi.fn();
  function Fixture() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <NativeTestProviders>
        <FilterChips
          options={[
            { key: "games", label: "Games", icon: Dices },
            { key: "blocked", label: "Unavailable filter", icon: Dices, disabled: true },
          ]}
          selected={selected}
          onToggle={(key) => {
            toggle(key);
            setSelected((current) => (current.includes(key) ? [] : [key]));
          }}
        />
      </NativeTestProviders>
    );
  }
  await render(<Fixture />);
  const trigger = screen.getByRole("button", { name: "Games" });
  expect(trigger).not.toBeSelected();
  await grant(trigger);
  expect(toggle).not.toHaveBeenCalled();
  expect(trigger).not.toBeSelected();
  await release(trigger);
  expect(toggle).toHaveBeenCalledExactlyOnceWith("games");
  expect(screen.getByRole("button", { name: "Games" })).toBe(trigger);
  expect(trigger).toBeSelected();
  expect(processColor(StyleSheet.flatten(trigger.props.style).backgroundColor)).toBe(
    processColor(palette.result.current),
  );
  const blocked = screen.getByRole("button", { name: "Unavailable filter" });
  expect(blocked).toBeDisabled();
  await userEvent.setup().press(blocked);
  expect(toggle).toHaveBeenCalledOnce();
});
