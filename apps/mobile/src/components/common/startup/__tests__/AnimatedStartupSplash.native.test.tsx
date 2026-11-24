import { fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { AnimatedStartupSplash } from "../AnimatedStartupSplash";

const sdk = vi.hoisted(() => ({
  reducedMotion: false,
  repeat: vi.fn(),
  reveal: vi.fn(),
}));
// Keep the actual application splash and installed JavaScript bindings. The
// device-only accessibility preference and animation command are SDK boundaries.
vi.mock("react-native-reanimated", async (original) => {
  const runtime = await original<typeof import("react-native-reanimated")>();
  return {
    ...runtime,
    useReducedMotion: () => sdk.reducedMotion,
    withRepeat: (...args: Parameters<typeof runtime.withRepeat>) => {
      sdk.repeat(...args);
      return runtime.withRepeat(...args);
    },
  };
});
vi.mock("@/lib/splash", () => ({ revealStartupSplash: sdk.reveal }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

it.each([true, false])(
  "honors reduced motion (%s) while revealing the device splash only once across repeated layouts",
  async (reducedMotion) => {
    sdk.reducedMotion = reducedMotion;
    await render(<AnimatedStartupSplash startedAt={Date.now()} />, {
      wrapper: NativeTestProviders,
    });
    const layers = screen.container.queryAll(
      (node) => node.props.pointerEvents === "none" && typeof node.props.onLayout === "function",
    );
    expect(layers).toHaveLength(1);
    expect(sdk.repeat).toHaveBeenCalledTimes(reducedMotion ? 0 : 1);
    expect(sdk.reveal).not.toHaveBeenCalled();

    await fireEvent.layout(layers[0], { x: 0, y: 0, width: 360, height: 800 });
    await fireEvent.layout(layers[0], { x: 0, y: 0, width: 800, height: 360 });
    expect(sdk.reveal).toHaveBeenCalledOnce();
  },
);
