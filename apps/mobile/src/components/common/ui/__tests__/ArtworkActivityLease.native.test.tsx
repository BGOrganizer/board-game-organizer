import { createResourceArtwork } from "@board-game-organizer/shared/artwork";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { Activity, type ContextType } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  DeviceEventEmitter,
  Platform,
  Text,
  View,
} from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import * as artworkLayers from "@/lib/resourceArtworkLayers";
import { ARTWORK_CYCLE_MS } from "@/lib/resourceArtworkMotion";
import { AnimatedDetailArtwork } from "../AnimatedDetailArtwork";
import { RetainedTabPanel } from "../RetainedTabPanel";

type Navigation = NonNullable<ContextType<typeof NavigationContext>>;
const originalAppState = Object.getOwnPropertyDescriptor(AppState, "currentState");
afterEach(() => {
  vi.restoreAllMocks();
  if (originalAppState) Object.defineProperty(AppState, "currentState", originalAppState);
});
function nativeClock() {
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    writable: true,
    value: "active",
  });
  const preferences: ((reduced: boolean) => void)[] = [];
  vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(
    () => new Promise<boolean>((resolve) => preferences.push(resolve)),
  );
  // This is the native driver/OS boundary only. Actual React/Activity/RN/SVG
  // application code and parsing remain in the mounted native renderer.
  vi.spyOn(AppState, "addEventListener").mockReturnValue({ remove: vi.fn() });
  vi.spyOn(Animated, "timing").mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }));
  let current = 0,
    maximum = 0;
  const started = vi.fn(),
    stopped = vi.fn();
  vi.spyOn(Animated, "loop").mockImplementation(() => {
    let running = false;
    return {
      start: () => {
        if (!running) {
          running = true;
          current++;
          maximum = Math.max(maximum, current);
        }
        started();
      },
      stop: () => {
        if (running) {
          running = false;
          current--;
        }
        stopped();
      },
      reset: vi.fn(),
    };
  });
  const navigation = {
    isFocused: () => true,
    addListener: () => () => {},
  } as unknown as Navigation;
  // Count actual plane preparation without replacing the SVG parser or its immutable CJS exports.
  const prepare = vi.spyOn(artworkLayers, "resourceArtworkLayers");
  const reset = vi.spyOn(Animated.Value.prototype, "setValue");
  const resolve = async (reduced: boolean) => {
    const next = preferences.shift();
    if (!next) throw new Error("Expected a real artwork OS preference read");
    await act(() => next(reduced));
  };
  return {
    navigation,
    prepare,
    reset,
    resolve,
    started,
    stopped,
    clocks: () => ({ current, maximum }),
    preferenceCount: () => preferences.length,
  };
}
function Artwork({ id }: { id: string }) {
  return (
    <View testID={`artwork-lease-${id}`}>
      <AnimatedDetailArtwork artwork={createResourceArtwork("events", id, "none")}>
        <Text>{`Complete drawing ${id}`}</Text>
      </AnimatedDetailArtwork>
    </View>
  );
}
function layoutHost(id: string) {
  const outer = screen.getByTestId(`artwork-lease-${id}`, { includeHiddenElements: true });
  const measured = outer.queryAll((node) => typeof node.props.onLayout === "function")[0];
  if (!measured) throw new Error("Expected the actual artwork native layout host");
  return measured;
}
async function measure(id: string, width = 300, height = 224) {
  await fireEvent.layout(layoutHost(id), { x: 0, y: 0, width, height });
}

it("requires both an actual route and a positive native layout before preparing planes once and starting a noninteractive driver", async () => {
  const f = nativeClock();
  await render(
    <NavigationContext value={f.navigation}>
      <Artwork id="positive" />
    </NavigationContext>,
  );
  expect(screen.getByText("Complete drawing positive")).toBeVisible();
  await f.resolve(false);
  await measure("positive", 0, 0);
  await measure("positive", -1, 224);
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.started).not.toHaveBeenCalled();
  await measure("positive");
  await waitFor(() => expect(f.started).toHaveBeenCalledOnce());
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(screen.queryByText("Complete drawing positive")).toBeNull();
  expect(
    screen.container.queryAll((node) => node.type === "RNSVGSvgViewAndroid").length,
  ).toBeGreaterThan(0);
  expect(Animated.timing).toHaveBeenCalledWith(
    expect.any(Animated.Value),
    expect.objectContaining({
      duration: ARTWORK_CYCLE_MS,
      useNativeDriver: true,
      isInteraction: false,
    }),
  );
  await measure("positive");
  await measure("positive", -1, 224);
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(f.started).toHaveBeenCalledOnce();
});

it("keeps the complete drawing static when mounted outside every actual navigation route", async () => {
  const f = nativeClock();
  await render(
    <NavigationContext value={undefined}>
      <Artwork id="headerless" />
    </NavigationContext>,
  );
  await measure("headerless");
  await f.resolve(false);
  expect(screen.getByText("Complete drawing headerless")).toBeVisible();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.started).not.toHaveBeenCalled();
});

it("leases at most one native clock across two real retained panels and rejects hidden late layouts until preference is rechecked", async () => {
  const f = nativeClock();
  const panels = (selected: "members" | "events", shown = true) => (
    <NavigationContext value={f.navigation}>
      <Activity mode={shown ? "visible" : "hidden"}>
        {(["members", "events"] as const).map((id) => (
          <RetainedTabPanel key={id} active={selected === id}>
            <Artwork id={id} />
          </RetainedTabPanel>
        ))}
      </Activity>
    </NavigationContext>
  );
  const view = await render(panels("members"));
  await f.resolve(false);
  await measure("members");
  await waitFor(() => expect(f.clocks()).toEqual({ current: 1, maximum: 1 }));
  const oldLayout = layoutHost("members");
  await view.rerender(panels("events"));
  expect(f.clocks().current).toBe(0);
  await fireEvent.layout(oldLayout, { x: 0, y: 0, width: 1, height: 1 });
  expect(f.clocks().current).toBe(0);
  await f.resolve(false);
  await measure("events");
  await waitFor(() => expect(f.clocks()).toEqual({ current: 1, maximum: 1 }));
  await view.rerender(panels("events", false));
  expect(f.clocks().current).toBe(0);
  expect(f.reset).toHaveBeenLastCalledWith(0);
  await fireEvent.layout(layoutHost("events"), { x: 0, y: 0, width: 1, height: 1 });
  expect(f.clocks().current).toBe(0);
  await view.rerender(panels("events"));
  expect(f.preferenceCount()).toBe(1);
  expect(f.clocks().current).toBe(0);
  await f.resolve(true);
  expect(f.clocks().current).toBe(0);
  await act(() =>
    DeviceEventEmitter.emit(
      Platform.OS === "android" ? "reduceMotionDidChange" : "reduceMotionChanged",
      false,
    ),
  );
  await waitFor(() => expect(f.clocks()).toEqual({ current: 1, maximum: 1 }));
  // Reentry repeats the real OS read; a prior positive result does not survive
  // the hidden Activity's effect teardown as permission to restart motion.
  await view.rerender(panels("members"));
  expect(f.clocks().current).toBe(0);
  await f.resolve(false);
  await waitFor(() => expect(f.clocks()).toEqual({ current: 1, maximum: 1 }));
  await view.unmount();
  expect(f.clocks().current).toBe(0);
  expect(f.stopped).toHaveBeenCalled();
});
