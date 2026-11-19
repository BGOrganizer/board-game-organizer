import * as sharedArtwork from "@board-game-organizer/shared/artwork";
import { createResourceArtwork } from "@board-game-organizer/shared/artwork";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { type ContextType, type ReactNode, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  type AppStateStatus,
  DeviceEventEmitter,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Uniwind } from "uniwind";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListActivityContext } from "@/lib/listActivity";
import { ARTWORK_CYCLE_MS } from "@/lib/resourceArtworkMotion";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { AnimatedDetailArtwork } from "../AnimatedDetailArtwork";
import { AnimatedDicebearArtwork } from "../AnimatedDicebearArtwork";

const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, "currentState");
function appState(value: AppStateStatus) {
  Object.defineProperty(AppState, "currentState", { configurable: true, writable: true, value });
}

function lifecycle({ reduced = false, focused = true, readFailure = false } = {}) {
  let isFocused = focused;
  const focusListeners = new Map<string, () => void>();
  const removed: ReturnType<typeof vi.fn>[] = [];
  const motionEvent = Platform.OS === "android" ? "reduceMotionDidChange" : "reduceMotionChanged";
  const initialMotionListeners = DeviceEventEmitter.listenerCount(motionEvent);
  let stateChanged: ((state: AppStateStatus) => void) | undefined;
  const clocks: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(() =>
    readFailure
      ? Promise.reject(new Error("Native preference unavailable"))
      : Promise.resolve(reduced),
  );
  vi.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    stateChanged = listener as (state: AppStateStatus) => void;
    const remove = vi.fn();
    removed.push(remove);
    return { remove };
  });
  vi.spyOn(Animated, "timing").mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }));
  vi.spyOn(Animated, "loop").mockImplementation(() => {
    const clock = { start: vi.fn(), stop: vi.fn(), reset: vi.fn() };
    clocks.push(clock);
    return clock;
  });
  const navigation = {
    isFocused: () => isFocused,
    addListener: (type: string, listener: () => void) => {
      focusListeners.set(type, listener);
      const remove = vi.fn(() => focusListeners.delete(type));
      removed.push(remove);
      return remove;
    },
  } as unknown as NonNullable<ContextType<typeof NavigationContext>>;
  const focus = async (next: boolean) => {
    isFocused = next;
    await act(() => focusListeners.get(next ? "focus" : "blur")?.());
  };
  const motion = async (next: boolean) => act(() => DeviceEventEmitter.emit(motionEvent, next));
  const foreground = async (next: AppStateStatus) =>
    act(() => {
      appState(next);
      stateChanged?.(next);
    });
  return {
    navigation,
    clocks,
    removed,
    focus,
    motion,
    foreground,
    motionListenersReleased: () =>
      DeviceEventEmitter.listenerCount(motionEvent) === initialMotionListeners,
  };
}

function ActiveArtwork({
  active = true,
  navigation,
  children,
}: {
  active?: boolean;
  navigation: ContextType<typeof NavigationContext>;
  children: ReactNode;
}) {
  const activity = useRef(active);
  activity.current = active;
  return (
    <NavigationContext value={navigation}>
      <ListActivityContext value={activity}>
        <View testID="motion-artwork-host">{children}</View>
      </ListActivityContext>
    </NavigationContext>
  );
}

async function measureArtwork() {
  const frame = screen.getByTestId("motion-artwork-host");
  const node = frame.queryAll((candidate) => typeof candidate.props.onLayout === "function")[0];
  if (!node) throw new Error("Expected the real artwork layout host");
  await fireEvent(node, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 96, height: 96 } },
  });
}

beforeEach(() => appState("active"));
afterEach(() => {
  vi.restoreAllMocks();
  Uniwind.setTheme("light");
  if (appStateDescriptor) Object.defineProperty(AppState, "currentState", appStateDescriptor);
});

it("reuses the real generator for presentation/size/theme changes and regenerates only for seed or kind", async () => {
  const expected = createResourceArtwork("tables", "memo-resource", "none");
  const generate = vi.spyOn(sharedArtwork, "createResourceArtwork");
  const view = await render(<AnimatedDicebearArtwork seed="memo-resource" variant="tables" />, {
    wrapper: NativeTestProviders,
  });
  expect(generate).toHaveBeenCalledExactlyOnceWith("tables", "memo-resource", "none");
  expect(generate.mock.results[0]).toMatchObject({ type: "return", value: { svg: expected.svg } });
  const paths = drawingPaths();
  for (const presentation of ["cover", "background", "thumbnail"] as const) {
    await view.rerender(
      <AnimatedDicebearArtwork
        seed="memo-resource"
        variant="tables"
        size={96}
        presentation={presentation}
      />,
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(drawingPaths()).toEqual(paths);
    const root = screen.getByTestId("dicebear-tables-image", { includeHiddenElements: true });
    const surface = root.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.flex === 1 && style?.padding === (presentation === "cover" ? 4 : 0);
    })[0];
    if (!surface) throw new Error("Expected the artwork's actual padded semantic surface");
    expect(surface).toHaveStyle({ padding: presentation === "cover" ? 4 : 0 });
  }
  await act(() => Uniwind.setTheme("dark"));
  await view.rerender(<AnimatedDicebearArtwork seed="memo-resource" variant="tables" size={40} />);
  expect(generate).toHaveBeenCalledOnce();
  expect(drawingPaths()).toEqual(paths);
  await view.rerender(<AnimatedDicebearArtwork seed="saved-resource" variant="tables" />);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate).toHaveBeenLastCalledWith("tables", "saved-resource", "none");
  drawingPaths();
  await view.rerender(<AnimatedDicebearArtwork seed="saved-resource" variant="groups" />);
  expect(generate).toHaveBeenCalledTimes(3);
  expect(generate).toHaveBeenLastCalledWith("groups", "saved-resource", "none");
  drawingPaths();
});

function drawingPaths() {
  const paths = screen.container.queryAll((node) => typeof node.props.d === "string");
  expect(paths.length).toBeGreaterThan(0);
  return paths.map((node) => node.props.d as string);
}

// Native hosts expose rendered geometry and dimensions, not SvgXml's private
// input XML, ScopedTheme's composite props or memoized artwork object identity.
// The existing canonical-generator/memo harness stays pending separate proof.
it.each(["groups", "events", "tables"] as const)(
  "renders complete %s SVG geometry in every presentation and 40/64/96dp frame",
  async (variant) => {
    const view = await render(<AnimatedDicebearArtwork seed="resource-id" variant={variant} />, {
      wrapper: NativeTestProviders,
    });
    const initialPaths = drawingPaths();
    for (const presentation of ["thumbnail", "cover", "background"] as const) {
      for (const size of [40, 64, 96]) {
        await view.rerender(
          <AnimatedDicebearArtwork
            seed="resource-id"
            variant={variant}
            size={size}
            presentation={presentation}
          />,
        );
        const root = screen.getByTestId(`dicebear-${variant}-image`, {
          includeHiddenElements: true,
        });
        expect(root.props).toMatchObject({
          accessible: false,
          importantForAccessibility: "no-hide-descendants",
          pointerEvents: "none",
        });
        expect(root).toHaveStyle(
          presentation === "thumbnail"
            ? { width: size, height: size, flexShrink: 0, borderRadius: 12, overflow: "hidden" }
            : { position: "absolute", inset: 0, borderRadius: 12, overflow: "hidden" },
        );
        const svg = root.queryAll(
          (node) => node.type.startsWith("RNSVG") && node.props.bbWidth !== undefined,
        )[0];
        if (!svg) throw new Error("Expected the actual native SVG viewport");
        expect(svg.props).toMatchObject({
          bbWidth: "100%",
          bbHeight: "100%",
          align: "xMidYMid",
          meetOrSlice: 0,
        });
        expect(drawingPaths()).toEqual(initialPaths);
      }
    }
  },
);

it("defaults to a 64dp thumbnail and retains complete geometry across presentation-only updates", async () => {
  const view = await render(<AnimatedDicebearArtwork seed="draft-table-key" variant="tables" />, {
    wrapper: NativeTestProviders,
  });
  expect(screen.getByTestId("dicebear-tables-image", { includeHiddenElements: true })).toHaveStyle({
    width: 64,
    height: 64,
  });
  const initialPaths = drawingPaths();
  await view.rerender(
    <AnimatedDicebearArtwork seed="draft-table-key" variant="tables" presentation="background" />,
  );
  expect(drawingPaths()).toEqual(initialPaths);
  await view.rerender(<AnimatedDicebearArtwork seed="saved-table-id" variant="tables" />);
  const tablePaths = drawingPaths();
  await view.rerender(<AnimatedDicebearArtwork seed="saved-table-id" variant="groups" />);
  expect(
    screen.getByTestId("dicebear-groups-image", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(drawingPaths()).not.toEqual(tablePaths);
});

it.each(["thumbnail", "cover", "background"] as const)(
  "uses a native clock for active %s artwork and stops it for motion preference, blur, background and unmount",
  async (presentation) => {
    const control = lifecycle();
    const view = await render(
      <ActiveArtwork navigation={control.navigation}>
        <AnimatedDicebearArtwork
          seed="motion-resource"
          variant="events"
          presentation={presentation}
        />
      </ActiveArtwork>,
      { wrapper: NativeTestProviders },
    );
    expect(Animated.loop).not.toHaveBeenCalled();
    await measureArtwork();
    await waitFor(() => expect(control.clocks.at(-1)?.start).toHaveBeenCalledOnce());
    expect(Animated.timing).toHaveBeenLastCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({
        toValue: 1,
        duration: ARTWORK_CYCLE_MS,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    expect(Animated.loop).toHaveBeenLastCalledWith(expect.any(Object), {
      iterations: -1,
      resetBeforeIteration: true,
    });
    const first = control.clocks.at(-1);
    await control.motion(true);
    expect(first?.stop).toHaveBeenCalled();
    const afterReduced = control.clocks.length;
    await measureArtwork();
    expect(control.clocks).toHaveLength(afterReduced);
    await control.motion(false);
    await waitFor(() => expect(control.clocks.length).toBeGreaterThan(afterReduced));
    const beforeBlur = control.clocks.at(-1);
    await control.focus(false);
    expect(beforeBlur?.stop).toHaveBeenCalled();
    const afterBlur = control.clocks.length;
    await control.focus(true);
    await waitFor(() => expect(control.clocks.length).toBeGreaterThan(afterBlur));
    const beforeBackground = control.clocks.at(-1);
    await control.foreground("background");
    expect(beforeBackground?.stop).toHaveBeenCalled();
    const afterBackground = control.clocks.length;
    await control.foreground("active");
    await waitFor(() => expect(control.clocks.length).toBeGreaterThan(afterBackground));
    const beforeUnmount = control.clocks.at(-1);
    await view.unmount();
    expect(beforeUnmount?.stop).toHaveBeenCalled();
    for (const remove of control.removed) expect(remove).toHaveBeenCalledOnce();
    expect(control.motionListenersReleased()).toBe(true);
  },
);

it.each([{ reduced: true }, { readFailure: true }, { focused: false }])(
  "keeps the complete artwork static when animation is not allowed (%j)",
  async (conditions) => {
    const control = lifecycle(conditions);
    await render(
      <ActiveArtwork navigation={control.navigation}>
        <AnimatedDetailArtwork artwork={createResourceArtwork("groups", "resource-id", "none")}>
          <Text>Complete original drawing</Text>
        </AnimatedDetailArtwork>
      </ActiveArtwork>,
    );
    await measureArtwork();
    expect(screen.getByText("Complete original drawing")).toBeTruthy();
    expect(Animated.loop).not.toHaveBeenCalled();
  },
);

it("does not prepare or animate an inactive retained artwork", async () => {
  const control = lifecycle();
  await render(
    <ActiveArtwork active={false} navigation={control.navigation}>
      <AnimatedDetailArtwork artwork={createResourceArtwork("groups", "inactive", "none")}>
        <Text>Complete original drawing</Text>
      </AnimatedDetailArtwork>
    </ActiveArtwork>,
  );
  await measureArtwork();
  expect(screen.getByText("Complete original drawing")).toBeTruthy();
  expect(Animated.loop).not.toHaveBeenCalled();
});

it("does not let a late initial preference undo a newer Reduce Motion event", async () => {
  const control = lifecycle();
  let resolvePreference: (reduced: boolean) => void = () => {};
  vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      resolvePreference = resolve;
    }),
  );
  await render(
    <ActiveArtwork navigation={control.navigation}>
      <AnimatedDetailArtwork
        artwork={createResourceArtwork("groups", "pending-preference", "none")}
      >
        <Text>Complete original drawing</Text>
      </AnimatedDetailArtwork>
    </ActiveArtwork>,
  );
  await measureArtwork();
  await control.motion(true);
  await act(() => resolvePreference(false));
  expect(Animated.loop).not.toHaveBeenCalled();
  expect(screen.getByText("Complete original drawing")).toBeTruthy();
  await control.motion(false);
  await waitFor(() => expect(Animated.loop).toHaveBeenCalled());
});

it("ignores a preference that resolves after unmount", async () => {
  const control = lifecycle();
  let resolvePreference: (reduced: boolean) => void = () => {};
  vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      resolvePreference = resolve;
    }),
  );
  const view = await render(
    <ActiveArtwork navigation={control.navigation}>
      <AnimatedDetailArtwork
        artwork={createResourceArtwork("groups", "disposed-preference", "none")}
      >
        <Text>Complete original drawing</Text>
      </AnimatedDetailArtwork>
    </ActiveArtwork>,
  );
  await measureArtwork();
  await view.unmount();
  await act(() => resolvePreference(false));
  expect(Animated.loop).not.toHaveBeenCalled();
  for (const remove of control.removed) expect(remove).toHaveBeenCalledOnce();
  expect(control.motionListenersReleased()).toBe(true);
});
