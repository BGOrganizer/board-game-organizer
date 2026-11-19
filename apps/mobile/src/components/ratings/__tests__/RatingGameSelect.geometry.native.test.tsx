import { createRequire } from "node:module";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react-native";
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  type KeyboardEventName,
  Platform,
  StyleSheet,
  Text,
} from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";
import { RatingGameSelect } from "../RatingGameSelect";

const { SafeAreaProvider } = createRequire(import.meta.url)(
  "react-native-safe-area-context",
) as typeof import("react-native-safe-area-context");
const originalPlatform = Object.getOwnPropertyDescriptor(Platform, "OS");
let originalWindow: ReturnType<typeof Dimensions.get>;
let originalScreen: ReturnType<typeof Dimensions.get>;
let handlers: Map<KeyboardEventName, Set<(event: KeyboardEvent) => void>>;

beforeEach(async () => {
  originalWindow = Dimensions.get("window");
  originalScreen = Dimensions.get("screen");
  const viewport = { width: 390, height: 800, scale: 1, fontScale: 1 };
  Dimensions.set({ window: viewport, screen: viewport });
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  handlers = new Map();
  vi.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
  const subscribeNative = Keyboard.addListener.bind(Keyboard);
  vi.spyOn(Keyboard, "addListener").mockImplementation((name, callback) => {
    const callbacks = handlers.get(name) ?? new Set();
    callbacks.add(callback);
    handlers.set(name, callbacks);
    const subscription = subscribeNative(name, callback);
    const removeNative = subscription.remove.bind(subscription);
    subscription.remove = () => {
      callbacks.delete(callback);
      removeNative();
    };
    return subscription;
  });
  await installNativePopoverMeasurements();
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  if (originalPlatform) Object.defineProperty(Platform, "OS", originalPlatform);
  Dimensions.set({ window: originalWindow, screen: originalScreen });
});
async function keyboard(name: KeyboardEventName, height: number) {
  await act(() => {
    const event: KeyboardEvent = {
      duration: 0,
      easing: "keyboard",
      endCoordinates: { screenX: 0, screenY: 800 - height, width: 390, height },
    };
    for (const callback of handlers.get(name) ?? []) callback(event);
  });
}

it("bounds the actual selector by native keyboard and safe-area geometry without adding nested keyboard avoidance", async () => {
  const change = vi.fn();
  await render(
    <NativeTestProviders>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 800 },
          insets: { top: 24, bottom: 20, left: 0, right: 0 },
        }}
      >
        <RatingGameSelect
          selectedId={null}
          games={[{ id: 1, name: "Chess", imageUrl: null }]}
          onChange={change}
        >
          <Text>Actual selector header</Text>
        </RatingGameSelect>
      </SafeAreaProvider>
    </NativeTestProviders>,
  );
  await positionMeasuredSelect(screen.getByTestId("rating-game-select-trigger"));
  // Native Select's animation snapshot is not a visibility/tappability proof.
  const popup = () =>
    screen.getByTestId("rating-game-select-popover", { includeHiddenElements: true });
  expect(popup()).toHaveStyle({ height: 320, maxHeight: 320, overflow: "hidden" });
  expect(
    screen.getByText("Actual selector header", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("option", { name: "Chess", includeHiddenElements: true }),
  ).toBeOnTheScreen();

  let avoidance = screen.getByTestId("rating-game-select-list", {
    includeHiddenElements: true,
  }).parent;
  while (avoidance) {
    const style = StyleSheet.flatten(avoidance.props.style);
    if (
      style?.minHeight === 0 &&
      style.width === "100%" &&
      typeof avoidance.props.onLayout === "function"
    )
      break;
    avoidance = avoidance.parent;
  }
  if (!avoidance)
    throw new Error("Expected the actual InputFlatList keyboard-avoidance native host");
  expect(avoidance).toHaveStyle({ flex: 1, minHeight: 0, width: "100%" });
  expect(StyleSheet.flatten(avoidance.props.style)?.paddingBottom).toBeUndefined();
  await keyboard("keyboardWillChangeFrame", 600);
  await waitFor(() => expect(popup()).toHaveStyle({ height: 132, maxHeight: 132 }));
  expect(StyleSheet.flatten(avoidance.props.style)?.paddingBottom).toBeUndefined();
  await keyboard("keyboardWillChangeFrame", 760);
  await waitFor(() => expect(popup()).toHaveStyle({ height: 80, maxHeight: 80 }));
  await keyboard("keyboardDidHide", 0);
  await waitFor(() => expect(popup()).toHaveStyle({ height: 320, maxHeight: 320 }));
  expect(change).not.toHaveBeenCalled();
});
