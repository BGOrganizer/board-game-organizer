import { createRequire } from "node:module";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { createRef, type RefObject, useContext } from "react";
import {
  DeviceEventEmitter,
  Keyboard,
  type NativeMethods,
  PixelRatio,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  InputFieldContext,
  InputScrollContext,
  type InputScrollOwner,
} from "@/lib/inputScrollContext";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { FormInteractionScope } from "../FormInteractionScope";
import { InputFlatList } from "../InputFlatList";
import { InputScrollView } from "../InputScrollView";
import { InputSectionList } from "../InputSectionList";

type Kind = "flat" | "section" | "scroll";
const kinds: readonly Kind[] = ["flat", "section", "scroll"];
let owner: InputScrollOwner | null;
let target: RefObject<View | null>;
const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
function Row({ name, first }: { name: string; first: boolean }) {
  owner = useContext(InputScrollContext);
  const field = useContext(InputFieldContext);
  return (
    <View ref={first ? target : undefined}>
      <Text>{name}</Text>
      <Text>{`Scope: ${owner?.inSheet ? "sheet" : "screen"}; inherited field: ${field === null ? "cleared" : "present"}`}</Text>
    </View>
  );
}
function ActualContainer({ kind, customWindow = false }: { kind: Kind; customWindow?: boolean }) {
  const rows = customWindow
    ? Array.from({ length: 30 }, (_, index) => `Native row ${index}`)
    : ["First input row", "Second input row"];
  const virtualization = customWindow
    ? { initialNumToRender: 12, maxToRenderPerBatch: 4, windowSize: 5 }
    : {};
  if (kind === "flat")
    return (
      <InputFlatList
        {...virtualization}
        data={rows}
        keyExtractor={String}
        renderItem={({ item, index }) => <Row name={item} first={index === 0} />}
      />
    );
  if (kind === "section")
    return (
      <InputSectionList
        {...virtualization}
        sections={[{ key: "inputs", data: rows }]}
        keyExtractor={String}
        renderItem={({ item, index }) => <Row name={item} first={index === 0} />}
      />
    );
  return (
    <InputScrollView>
      <Row name="First input row" first />
      <Row name="Second input row" first={false} />
    </InputScrollView>
  );
}
function SheetFixture({ kind, customWindow }: { kind: Kind; customWindow?: boolean }) {
  return (
    <HeaderHeightContext.Provider value={64}>
      <InputFieldContext value={createRef<View>()}>
        <NativeTestProviders>
          <BottomSheet isOpen>
            <BottomSheet.Portal>
              <BottomSheet.Content snapPoints={["80%"]} enableDynamicSizing={false}>
                <FormInteractionScope>
                  <ActualContainer kind={kind} customWindow={customWindow} />
                </FormInteractionScope>
              </BottomSheet.Content>
            </BottomSheet.Portal>
          </BottomSheet>
        </NativeTestProviders>
      </InputFieldContext>
    </HeaderHeightContext.Provider>
  );
}
function nativeScroll() {
  const hosts = screen.container.queryAll(
    (node) =>
      typeof node.props.onScroll === "function" &&
      typeof node.props.onScrollBeginDrag === "function",
  );
  if (hosts.length !== 1) throw new Error("Expected one actual Gorhom-backed native scroll host");
  return hosts[0];
}
function viewportHost() {
  for (let node = nativeScroll().parent; node; node = node.parent)
    if (
      typeof node.props.onLayout === "function" &&
      typeof node.props.onTouchStart === "function" &&
      typeof node.props.onScroll !== "function"
    )
      return node;
  throw new Error("Expected actual input scroll viewport inside the real sheet");
}
function avoidanceHost() {
  for (let node = viewportHost().parent; node; node = node.parent)
    if (typeof node.props.onLayout === "function") return node;
  throw new Error("Expected actual header-safe KeyboardAvoidingView host");
}
beforeEach(() => {
  owner = null;
  target = createRef<View>();
  vi.spyOn(Keyboard, "isVisible").mockReturnValue(false);
  vi.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
  vi.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
});

// All sheet/container/context implementations are installed RN/HeroUI/Gorhom.
// Gorhom worklet opening does not execute in Node: queries establish rendered
// scopes/ref/command behavior only, never physical visibility or native gestures.
it.each(kinds)(
  "%s consumes the actual Gorhom sheet context and avoids double iOS keyboard padding",
  async (kind) => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    await render(<SheetFixture kind={kind} />);
    expect(screen.getByText("First input row", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(
      screen.getAllByText("Scope: sheet; inherited field: cleared", {
        includeHiddenElements: true,
      }),
    ).toHaveLength(2);
    const avoidance = avoidanceHost();
    await fireEvent.layout(avoidance, { x: 0, y: 0, width: 390, height: 600 });
    await act(() =>
      DeviceEventEmitter.emit("keyboardWillShow", {
        duration: 0,
        easing: "keyboard",
        endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 300 },
      }),
    );
    expect(StyleSheet.flatten(avoidance.props.style)?.paddingBottom).toBeUndefined();
    expect(nativeScroll()).toHaveProp("keyboardShouldPersistTaps", "handled");
  },
);

it.each(["flat", "section"] as const)(
  "%s forwards a custom bounded initial window to the actual native virtualized sheet list",
  async (kind) => {
    await render(<SheetFixture kind={kind} customWindow />);
    // SectionList's leading section-header cell consumes one of its 12 slots.
    expect(screen.getAllByText(/^Native row \d+$/, { includeHiddenElements: true })).toHaveLength(
      kind === "flat" ? 12 : 11,
    );
    expect(screen.queryByText("Native row 12", { includeHiddenElements: true })).toBeNull();
    expect(owner?.inSheet).toBe(true);
  },
);

it.each(kinds)(
  "%s routes its public focus-reveal owner through the real sheet's forwarded scroll handle",
  async (kind) => {
    const frames: Parameters<typeof requestAnimationFrame>[0][] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const native = await vi.importActual<{
      default: { prototype: Pick<NativeMethods, "measureInWindow"> };
    }>("react-native/Libraries/Components/View/ViewNativeComponent");
    const measures = vi
      .spyOn(native.default.prototype, "measureInWindow")
      .mockImplementation(function (this: NativeMethods, callback) {
        if (this === target.current) callback(0, 390, 200, 44);
        else callback(0, 100, 390, 300);
      });
    const commands = createRequire(import.meta.url)(
      "react-native/Libraries/Components/ScrollView/ScrollViewCommands",
    ).default as {
      scrollTo: (host: unknown, x: number, y: number, animated: boolean) => void;
    };
    const scrollTo = vi.spyOn(commands, "scrollTo").mockImplementation(() => {});
    await render(<SheetFixture kind={kind} />);
    const field = target.current;
    const currentOwner = owner;
    if (!field || !currentOwner)
      throw new Error("Expected actual native field and public scroll owner");
    scrollTo.mockClear();
    await act(() => currentOwner.reveal(field));
    let passes = 0;
    while (frames.length && passes++ < 10) {
      const batch = frames.splice(0);
      await act(() => {
        for (const callback of batch) callback(0);
      });
    }
    expect(frames).toHaveLength(0);
    expect(measures.mock.contexts).toContain(field);
    expect(measures.mock.contexts.some((context) => context !== field)).toBe(true);
    expect(scrollTo.mock.calls.map(([, x, y, animated]) => ({ x, y, animated }))).toEqual([
      { x: 0, y: 226, animated: false },
    ]);
  },
);
