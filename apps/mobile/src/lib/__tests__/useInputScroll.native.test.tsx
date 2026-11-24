import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { DeviceEventEmitter, type NativeMethods, PixelRatio, Text, View } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import {
  FormInteractionScope,
  useFormInteraction,
} from "@/components/common/ui/FormInteractionScope";
import type { InputScrollTarget } from "@/lib/inputScrollContext";
import { useInputScroll } from "../useInputScroll";

type Owner = ReturnType<typeof useInputScroll>;
type Measured = Parameters<InputScrollTarget["measureInWindow"]>[0];

// This mounts the actual hook, React state/effects, RN View/ref and form scope.
// Controlled SDK measurements and RAF delivery prove lifecycle/cancellation and
// scroll intent, not physical keyboard geometry, native frame timing or FPS.
async function fixture() {
  const frames: Parameters<typeof requestAnimationFrame>[0][] = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
  const native = await vi.importActual<{
    default: { prototype: Pick<NativeMethods, "measureInWindow"> };
  }>("react-native/Libraries/Components/View/ViewNativeComponent");
  const viewportMeasure = vi
    .spyOn(native.default.prototype, "measureInWindow")
    .mockImplementation((callback) => callback(0, 100, 320, 300));
  const scrollTo = vi.fn();
  let value: Owner | undefined;
  let form: ReturnType<typeof useFormInteraction> | undefined;
  function Probe() {
    const owner = useInputScroll(() => ({ scrollTo }));
    value = owner;
    form = useFormInteraction();
    return (
      <View testID="input-owner-viewport" ref={owner.viewport} onLayout={owner.onLayout}>
        <Text>{`Minimum range: ${owner.minHeight}`}</Text>
      </View>
    );
  }
  const view = await render(
    <FormInteractionScope>
      <Probe />
    </FormInteractionScope>,
  );
  const current = () => {
    if (!value) throw new Error("Expected actual mounted input-scroll hook");
    return value;
  };
  if (!form) throw new Error("Expected actual mounted form context");
  const cancel = vi.spyOn(form, "cancelErrorFocus");
  const flush = async () => {
    // Commit React state after each native frame, preserving the hook's required
    // extra-range layout before its following frame performs the actual scroll.
    while (frames.length) {
      const batch = frames.splice(0);
      await act(() => {
        for (const callback of batch) callback(0);
      });
    }
  };
  return { current, scrollTo, cancel, flush, viewportMeasure, unmount: () => view.unmount() };
}
afterEach(() => vi.restoreAllMocks());
const field = (top: number, width = 200, height = 44): InputScrollTarget => ({
  measureInWindow: (callback) => callback(0, top, width, height),
});

it.each([
  [0, 0],
  [300, 0],
  [300, 80],
] as const)(
  "preserves actual viewport height plus reveal range (%s + %s)",
  async (height, extra) => {
    const f = await fixture();
    if (height)
      await fireEvent.layout(screen.getByTestId("input-owner-viewport"), {
        x: 0,
        y: 100,
        width: 320,
        height,
      });
    if (extra) {
      await act(() => f.current().owner.reveal(field(244)));
      await f.flush();
    }
    expect(f.current().minHeight).toBe(height + extra);
    expect(screen.getByText(`Minimum range: ${height + extra}`)).toBeOnTheScreen();
    expect(f.current().inSheet).toBe(false);
  },
);

it("keeps touch/clear pinned, stops repinning after a real drag intent and clears the extra range on blur", async () => {
  const f = await fixture(),
    target = field(500);
  await act(() => {
    f.current().owner.reveal(target);
    f.current().touch();
  });
  await f.flush();
  expect(f.cancel).toHaveBeenCalledOnce();
  expect(f.scrollTo).toHaveBeenLastCalledWith({ y: 336, animated: false });
  expect(f.current().minHeight).toBe(636);
  f.scrollTo.mockClear();
  await act(() => f.current().contentChanged());
  await f.flush();
  expect(f.scrollTo).toHaveBeenCalledOnce();
  f.scrollTo.mockClear();
  await act(() => {
    f.current().beginScroll();
    f.current().contentChanged();
  });
  await f.flush();
  expect(f.scrollTo).not.toHaveBeenCalled();
  await act(() => f.current().owner.blur(target));
  expect(f.current().minHeight).toBe(300);
});

it("rejects a previous native field measurement after focus moves to another field", async () => {
  const f = await fixture();
  let measured: Measured | undefined;
  const old: InputScrollTarget = {
    measureInWindow: (callback) => {
      measured = callback;
    },
  };
  await act(() => f.current().owner.reveal(old));
  await f.flush();
  expect(measured).toBeTypeOf("function");
  await act(() => f.current().owner.reveal(field(400)));
  await f.flush();
  await act(() => measured?.(0, 900, 200, 44));
  await f.flush();
  expect(f.scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 236, animated: false });
  expect(f.current().minHeight).toBe(536);
});

it("rejects a delayed label measurement after blur without retaining an artificial scroll range", async () => {
  const f = await fixture();
  let measured: Measured | undefined;
  const target = field(500),
    label: InputScrollTarget = {
      measureInWindow: (callback) => {
        measured = callback;
      },
    };
  await act(() => f.current().owner.reveal(target, label));
  await f.flush();
  expect(measured).toBeTypeOf("function");
  await act(() => f.current().owner.blur(target));
  await act(() => measured?.(0, 460, 200, 84));
  await f.flush();
  expect(f.scrollTo).not.toHaveBeenCalled();
  expect(f.current().minHeight).toBe(0);
});

it("ignores an unmeasured field instead of moving the native scroll surface or creating a reveal range", async () => {
  const f = await fixture();
  await act(() => f.current().owner.reveal(field(500, 0, 0)));
  await f.flush();
  expect(f.scrollTo).not.toHaveBeenCalled();
  expect(f.current().minHeight).toBe(0);
});

it.each(["manual-scroll", "unmount"] as const)(
  "rejects delayed native measurements after %s",
  async (change) => {
    const f = await fixture();
    let measured: Measured | undefined;
    const target: InputScrollTarget = {
      measureInWindow: (callback) => {
        measured = callback;
      },
    };
    await act(() => f.current().owner.reveal(target));
    await f.flush();
    if (change === "manual-scroll") await act(() => f.current().beginScroll());
    else await f.unmount();
    await act(() => measured?.(0, 500, 200, 44));
    await f.flush();
    expect(f.scrollTo).not.toHaveBeenCalled();
  },
);

it("rejects a queued first native frame after the actual owner unmounts", async () => {
  const f = await fixture();
  f.viewportMeasure.mockClear();
  await act(() => f.current().owner.reveal(field(500)));
  await f.unmount();
  await f.flush();
  expect(f.viewportMeasure).not.toHaveBeenCalled();
  expect(f.scrollTo).not.toHaveBeenCalled();
});

it("keeps the current focused field when an unrelated field blurs, and includes a fitting label in its reveal", async () => {
  const f = await fixture(),
    target = field(500),
    unrelated = field(250),
    label = field(460, 200, 84);
  await act(() => {
    f.current().owner.reveal(target, label);
    f.current().owner.blur(unrelated);
  });
  await f.flush();
  expect(f.scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 344, animated: false });
  expect(f.current().minHeight).toBe(644);
});

it("enriches only rows intersecting the active viewport and unregisters after first sight", async () => {
  const { current, unmount } = await fixture();
  const owner = current();
  const visible = vi.fn();
  const cancelled = vi.fn();
  let rowTop = 420;
  const row = {
    measureInWindow: (callback: Measured) => callback(0, rowTop, 44, 40),
  };
  const unsubscribe = owner.owner.observeVisibility?.(row, cancelled);
  expect(unsubscribe).toBeTypeOf("function");
  unsubscribe?.();
  owner.owner.observeVisibility?.(row, visible);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  expect(visible).not.toHaveBeenCalled();
  expect(cancelled).not.toHaveBeenCalled();

  rowTop = 380;
  owner.contentChanged();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  expect(visible).toHaveBeenCalledOnce();
  owner.contentChanged();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  expect(visible).toHaveBeenCalledOnce();
  await unmount();
});

it("remeasures the focused input when the native keyboard changes the available viewport", async () => {
  const f = await fixture();
  const fieldAndLabel = field(360);
  await act(() => f.current().owner.reveal(fieldAndLabel, fieldAndLabel));
  await f.flush();
  expect(f.scrollTo).toHaveBeenLastCalledWith({ y: 244, animated: false });

  f.scrollTo.mockClear();
  f.viewportMeasure.mockImplementation((callback) => callback(0, 100, 320, 60));
  await act(() => DeviceEventEmitter.emit("keyboardDidShow", { endCoordinates: { height: 120 } }));
  await f.flush();
  expect(f.scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 260, animated: false });
  expect(f.current().minHeight).toBe(320);
  await act(() => f.current().owner.blur(fieldAndLabel));
  expect(f.current().minHeight).toBe(60);
});
