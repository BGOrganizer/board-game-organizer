import { createRequire } from "node:module";
import { cleanup, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { createRef } from "react";
import type { ScrollView as ScrollViewType } from "react-native";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { installHorizontalScrollInterop } from "../../performance/horizontal-scroll-interop";

const require = createRequire(import.meta.url);
let restore: () => void;
beforeAll(() => {
  restore = installHorizontalScrollInterop();
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});
afterAll(() => restore());

// Android's native host binding is normalized to the maintained RCTScrollView
// test port. Actual RN ScrollView/HeroUI code still owns behavior; no OS gesture,
// physical native movement or Android pixel/frame-timing claim is made here.
it("delivers horizontal native scroll notifications through actual RN ScrollView to its caller", async () => {
  const { ScrollView, View } = await import("react-native");
  const onScroll = vi.fn();
  await render(
    <ScrollView horizontal testID="horizontal-sdk-scroll" onScroll={onScroll}>
      <View style={{ width: 800, height: 44 }} />
    </ScrollView>,
  );
  const scroll = screen.getByTestId("horizontal-sdk-scroll");
  expect(scroll.type).toBe("RCTScrollView");
  expect(scroll).toHaveProp("horizontal", true);
  await fireEvent.layout(scroll, { x: 0, y: 0, width: 200, height: 44 });
  await fireEvent.scroll(scroll, {
    nativeEvent: {
      contentOffset: { x: 180, y: 0 },
      contentSize: { width: 800, height: 44 },
      layoutMeasurement: { width: 200, height: 44 },
    },
  });
  expect(onScroll).toHaveBeenCalledOnce();
  expect(onScroll.mock.calls[0][0].nativeEvent.contentOffset).toEqual({
    x: 180,
    y: 0,
  });
  await userEvent.setup({ delay: 16 }).scrollTo(scroll, {
    x: 300,
    contentSize: { width: 800, height: 44 },
    layoutMeasurement: { width: 200, height: 44 },
  });
  expect(onScroll.mock.lastCall?.[0].nativeEvent.contentOffset).toEqual({
    x: 300,
    y: 0,
  });
});

it("preserves the actual horizontal public ref and native x-axis command without replacing SDK API singletons", async () => {
  const native = require("react-native") as typeof import("react-native");
  const { ScrollView, View, Keyboard, BackHandler } = await import("react-native");
  const ref = createRef<ScrollViewType>();
  const commands = require("react-native/Libraries/Components/ScrollView/ScrollViewCommands")
    .default as {
    scrollTo: (target: unknown, x: number, y: number, animated: boolean) => void;
  };
  const command = vi.spyOn(commands, "scrollTo").mockImplementation(() => {});
  await render(
    <ScrollView ref={ref} horizontal testID="horizontal-sdk-ref">
      <View style={{ width: 800, height: 44 }} />
    </ScrollView>,
  );
  if (!ref.current) throw new Error("Expected actual RN ScrollView public handle");
  ref.current.scrollTo({ x: 240, y: 0, animated: false });
  expect(command).toHaveBeenCalledExactlyOnceWith(ref.current.getNativeScrollRef(), 240, 0, false);
  expect(Keyboard).toBe(native.Keyboard);
  expect(BackHandler).toBe(native.BackHandler);
});

it("leaves the normal vertical SDK host and its delivered events intact", async () => {
  const { ScrollView, View } = await import("react-native");
  const onScroll = vi.fn();
  await render(
    <ScrollView testID="vertical-sdk-scroll" onScroll={onScroll}>
      <View style={{ height: 800 }} />
    </ScrollView>,
  );
  const scroll = screen.getByTestId("vertical-sdk-scroll");
  expect(scroll.type).toBe("RCTScrollView");
  await fireEvent.scroll(scroll, {
    nativeEvent: { contentOffset: { x: 0, y: 120 } },
  });
  expect(onScroll).toHaveBeenCalledOnce();
  expect(onScroll.mock.calls[0][0].nativeEvent.contentOffset).toEqual({
    x: 0,
    y: 120,
  });
});
