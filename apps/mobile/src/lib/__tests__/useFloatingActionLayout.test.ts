import { beforeEach, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  getState: vi.fn<() => { type: string } | undefined>(),
  getInsets: vi.fn<() => { bottom: number }>(),
}));
vi.mock("expo-router", () => ({ useNavigation: () => ({ getState: native.getState }) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: native.getInsets }));

import { useFloatingActionLayout } from "../useFloatingActionLayout";

beforeEach(() => {
  vi.clearAllMocks();
  native.getInsets.mockReturnValue({ bottom: 34 });
});

// Adapter wiring only: real navigator/safe-area geometry requires device acceptance.
it.each([
  [{ type: "tab" }, 50],
  [{ type: "stack" }, 134],
  [undefined, 134],
] as const)(
  "uses owning navigator and safe inset, including initial missing state: %j",
  (state, bottom) => {
    native.getState.mockReturnValue(state);
    expect(useFloatingActionLayout()).toEqual({ bottom, paddingBottom: bottom + 56 + 16 });
    expect(native.getInsets).toHaveBeenCalledOnce();
    expect(native.getState).toHaveBeenCalledOnce();
  },
);
