import { createRequire } from "node:module";
import { act, cleanup, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { createRef, type RefObject, useContext } from "react";
import {
  DeviceEventEmitter,
  Keyboard,
  type NativeMethods,
  PixelRatio,
  Platform,
  type ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAppRestartGuard } from "@/lib/appRestartGuard";
import {
  InputFieldContext,
  InputScrollContext,
  type InputScrollOwner,
} from "@/lib/inputScrollContext";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { ConfirmDialog } from "../ConfirmDialog";
import { FormInteractionScope } from "../FormInteractionScope";
import { InputScrollView } from "../InputScrollView";

const originalPlatform = Object.getOwnPropertyDescriptor(Platform, "OS");
let field: RefObject<View | null>;
let owner: InputScrollOwner | null;
function ScopeProbe() {
  owner = useContext(InputScrollContext);
  const inheritedField = useContext(InputFieldContext);
  return (
    <Text>{`Scroll scope: ${owner ? "present" : "clear"}; field: ${inheritedField ? "inherited" : "clear"}`}</Text>
  );
}
function scrollHost() {
  const hosts = screen.container.queryAll(
    (node) =>
      typeof node.props.onScroll === "function" &&
      typeof node.props.onScrollBeginDrag === "function",
  );
  if (hosts.length !== 1) throw new Error("Expected one actual native scroll surface");
  return hosts[0];
}
function viewport() {
  for (let node = scrollHost().parent; node; node = node.parent)
    if (
      typeof node.props.onLayout === "function" &&
      typeof node.props.onTouchStart === "function" &&
      typeof node.props.onScroll !== "function"
    )
      return node;
  throw new Error("Expected real InputScrollView viewport");
}
function content() {
  const content = scrollHost().children.find(
    (node) => typeof node !== "string" && typeof node.props.onLayout === "function",
  );
  if (!content || typeof content === "string")
    throw new Error("Expected actual native scroll content");
  return content;
}
function ScrollFixture({
  inSheet = false,
  sizing,
  ...props
}: ScrollViewProps & { inSheet?: boolean; sizing?: "fill" | "content" }) {
  const inputs = (
    <FormInteractionScope>
      <InputScrollView {...props} sizing={sizing}>
        <View ref={field}>
          <Text>All content remains in the real scroll surface.</Text>
        </View>
        <ScopeProbe />
      </InputScrollView>
    </FormInteractionScope>
  );
  return (
    <NativeTestProviders>
      {inSheet ? (
        <BottomSheet isOpen>
          <BottomSheet.Portal>
            <BottomSheet.Content snapPoints={["80%"]} enableDynamicSizing={false}>
              {inputs}
            </BottomSheet.Content>
          </BottomSheet.Portal>
        </BottomSheet>
      ) : (
        inputs
      )}
    </NativeTestProviders>
  );
}
beforeEach(() => {
  field = createRef<View>();
  owner = null;
  vi.spyOn(Keyboard, "isVisible").mockReturnValue(false);
  vi.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
  vi.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  if (originalPlatform) Object.defineProperty(Platform, "OS", originalPlatform);
});

it.each([
  { platform: "ios", busy: false },
  { platform: "ios", busy: true },
  { platform: "android", busy: false },
  { platform: "android", busy: true },
] as const)(
  "keeps a real $platform confirmation intrinsic, scope-isolated and safely dismissible when busy=$busy",
  async ({ platform, busy }) => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: platform,
    });
    const cancel = vi.fn(),
      confirm = vi.fn();
    const blocksBefore = useAppRestartGuard.getState().blocks;
    const inherited = createRef<View>();
    const view = await render(
      <NativeTestProviders>
        <FormInteractionScope>
          <InputScrollView>
            <InputFieldContext value={inherited}>
              <ConfirmDialog
                title="Confirm this action"
                description="Review the complete content before choosing."
                busy={busy}
                onCancel={cancel}
                cancelLabel={platform === "android" ? "Later" : undefined}
                blocksAppRestart={platform !== "android"}
                actions={[
                  {
                    label: "Confirm",
                    variant: platform === "android" ? "ghost" : "primary",
                    onPress: confirm,
                  },
                ]}
              >
                <ScopeProbe />
                <Text>Full content stays present.</Text>
              </ConfirmDialog>
            </InputFieldContext>
          </InputScrollView>
        </FormInteractionScope>
      </NativeTestProviders>,
    );
    const dialog = screen.getByTestId("confirmation-dialog");
    expect(dialog).toBeVisible();
    expect(dialog).toHaveStyle({ flexShrink: 0 });
    const style = StyleSheet.flatten(dialog.props.style);
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
    expect(dialog.queryAll((node) => typeof node.props.onScroll === "function")).toEqual([]);
    expect(screen.getByText("Scroll scope: clear; field: clear")).toBeVisible();
    expect(screen.getByText("Full content stays present.")).toBeVisible();
    const close = screen.getByTestId("confirmation-cancel");
    expect(close).toHaveAccessibleName(platform === "android" ? "Later" : "Cancel");
    expect(close).toHaveStyle({ minWidth: 44, minHeight: 44 });
    expect(useAppRestartGuard.getState().blocks).toBe(blocksBefore + (platform === "ios" ? 2 : 1));

    const avoidance = screen.container.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return (
        node.props.pointerEvents === "box-none" &&
        style?.justifyContent === "center" &&
        typeof node.props.onLayout === "function"
      );
    });
    expect(avoidance).toHaveLength(1);
    await fireEvent.layout(avoidance[0], {
      x: 0,
      y: 0,
      width: 390,
      height: 600,
    });
    await act(() =>
      DeviceEventEmitter.emit(platform === "ios" ? "keyboardWillShow" : "keyboardDidShow", {
        duration: 0,
        easing: "keyboard",
        endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 300 },
      }),
    );
    expect(StyleSheet.flatten(avoidance[0].props.style)?.paddingBottom).toBe(
      platform === "ios" ? 100 : undefined,
    );

    const overlays = screen.container.queryAll(
      (node) =>
        typeof node.props.onStartShouldSetResponder === "function" &&
        StyleSheet.flatten(node.props.style)?.position === "absolute",
    );
    expect(overlays).toHaveLength(1);
    await userEvent.setup().press(overlays[0]);
    expect(cancel).toHaveBeenCalledTimes(busy ? 0 : 1);
    await userEvent.setup().press(close);
    expect(cancel).toHaveBeenCalledTimes(busy ? 0 : 2);
    await userEvent.setup().press(screen.getByRole("button", { name: "Confirm" }));
    expect(confirm).toHaveBeenCalledTimes(busy ? 0 : 1);
    await view.unmount();
    expect(useAppRestartGuard.getState().blocks).toBe(blocksBefore);
  },
);

const scrollCases = (["ios", "android"] as const).flatMap((platform) =>
  [false, true].flatMap((inSheet) =>
    [undefined, "fill", "content"].map((sizing) => ({
      platform,
      inSheet,
      sizing: sizing as "fill" | "content" | undefined,
    })),
  ),
);
// Real Gorhom worklet opening cannot establish physical visibility in Node.
// These cases assert actual rendered native props, context and public layout only.
it.each(scrollCases)(
  "preserves real $platform scroll sizing=$sizing and caller bounce overrides inSheet=$inSheet",
  async ({ platform, inSheet, sizing }) => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: platform,
    });
    const view = await render(<ScrollFixture inSheet={inSheet} sizing={sizing} />);
    expect(
      screen.getByText("All content remains in the real scroll surface.", {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(owner?.inSheet).toBe(inSheet);
    const fit = sizing === "content";
    await fireEvent.layout(viewport(), { x: 0, y: 0, width: 390, height: 300 });
    expect(viewport()).toHaveStyle({ flexGrow: fit ? 0 : 1, flexShrink: 1 });
    expect(scrollHost()).toHaveStyle({ flexGrow: fit ? 0 : 1, flexShrink: 1 });
    expect(StyleSheet.flatten(content().props.style).minHeight).toBe(fit ? 0 : 300);
    expect(scrollHost().props.bounces).toBe(fit ? false : undefined);
    // The installed RN ScrollView resolves its unspecified vertical bounce default to true.
    expect(scrollHost().props.alwaysBounceVertical).toBe(!fit);
    // Gorhom defaults overScrollMode to never even when the application leaves it unspecified.
    expect(scrollHost().props.overScrollMode).toBe(fit || inSheet ? "never" : undefined);
    expect(scrollHost().props.scrollEnabled).not.toBe(false);
    await view.rerender(
      <ScrollFixture
        inSheet={inSheet}
        sizing="content"
        bounces
        alwaysBounceVertical
        overScrollMode="auto"
        contentContainerStyle={{ minHeight: 450 }}
        style={{ flexShrink: 1 }}
      />,
    );
    expect(StyleSheet.flatten(content().props.style).minHeight).toBe(450);
    expect(scrollHost()).toHaveProp("bounces", true);
    expect(scrollHost()).toHaveProp("alwaysBounceVertical", true);
    expect(scrollHost()).toHaveProp("overScrollMode", "auto");
  },
);

it.each([
  { naturalHeight: 200, cap: 500, fieldTop: 100 },
  { naturalHeight: 700, cap: 200, fieldTop: 650 },
])(
  "keeps real repeated focus/layout measurements intrinsic for content=$naturalHeight and viewport cap=$cap",
  async ({ naturalHeight, cap, fieldTop }) => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    let nativeOffset = 0;
    const viewportHeight = Math.min(naturalHeight, cap);
    const frames: Parameters<typeof requestAnimationFrame>[0][] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const native = await vi.importActual<{
      default: { prototype: Pick<NativeMethods, "measureInWindow"> };
    }>("react-native/Libraries/Components/View/ViewNativeComponent");
    vi.spyOn(native.default.prototype, "measureInWindow").mockImplementation(function (
      this: NativeMethods,
      callback,
    ) {
      if (this === field.current) callback(0, fieldTop - nativeOffset, 200, 44);
      else callback(0, 0, 390, viewportHeight);
    });
    const commands = createRequire(import.meta.url)(
      "react-native/Libraries/Components/ScrollView/ScrollViewCommands",
    ).default as {
      scrollTo: (host: unknown, x: number, y: number, animated: boolean) => void;
    };
    const scrollTo = vi.spyOn(commands, "scrollTo").mockImplementation(() => {});
    await render(<ScrollFixture sizing="content" />);
    const currentOwner = owner;
    const target = field.current;
    if (!currentOwner || !target) throw new Error("Expected actual input owner and native field");
    for (let round = 0; round < 5; round++) {
      await fireEvent.layout(viewport(), {
        x: 0,
        y: 0,
        width: 390,
        height: viewportHeight,
      });
      await fireEvent.layout(content(), {
        x: 0,
        y: 0,
        width: 390,
        height: naturalHeight,
      });
      await act(() => currentOwner.reveal(target));
      let passes = 0;
      while (frames.length && passes++ < 10) {
        const batch = frames.splice(0);
        await act(() => {
          for (const callback of batch) callback(0);
        });
      }
      expect(frames).toHaveLength(0);
      const command = scrollTo.mock.calls.at(-1);
      if (!command) throw new Error("Expected real public scroll command intent");
      expect(command[1]).toBe(0);
      expect(command[2]).toBe(fieldTop - 64);
      expect(command[3]).toBe(false);
      // The OS clamps the delivered offset to its natural range. Supply that
      // public native event; this is not a Node proof of native scroll physics.
      nativeOffset = Math.min(command[2], Math.max(0, naturalHeight - viewportHeight));
      await fireEvent.scroll(scrollHost(), {
        nativeEvent: {
          contentOffset: { x: 0, y: nativeOffset },
          contentSize: { width: 390, height: naturalHeight },
          layoutMeasurement: { width: 390, height: viewportHeight },
          zoomScale: 1,
        },
      });
      expect(StyleSheet.flatten(content().props.style).minHeight).toBe(0);
      expect(fieldTop - nativeOffset).toBeGreaterThanOrEqual(0);
      expect(fieldTop - nativeOffset + 44).toBeLessThanOrEqual(viewportHeight);
    }
  },
);
