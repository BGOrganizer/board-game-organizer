import { createRequire } from "node:module";
import { act, cleanup, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { createRef, useContext } from "react";
import { type NativeMethods, PixelRatio, Text, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InputScrollContext, type InputScrollOwner } from "@/lib/inputScrollContext";
import { measureNativeList } from "@/test/nativeListGeometry";
import { FormInteractionScope } from "../FormInteractionScope";
import { InputFlatList } from "../InputFlatList";
import { InputSectionList } from "../InputSectionList";

let owner: InputScrollOwner | null;
const field = createRef<View>();
function ActualField({ name }: { name: string }) {
  owner = useContext(InputScrollContext);
  return (
    <View ref={name === "First field" ? field : undefined}>
      <Text>{name}</Text>
    </View>
  );
}
beforeEach(() => {
  owner = null;
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

// Focus reveal is an application-owned public context command. Geometry and
// native scroll notifications are OS boundaries; userEvent supplies the real
// subsequent gesture. No composite/private onEndReached shortcut is invoked.
it.each(["flat", "section"] as const)(
  "%s suppresses focus-driven end events until an actual user drag resumes paging",
  async (kind) => {
    const frames: Parameters<typeof requestAnimationFrame>[0][] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
    const native = await vi.importActual<{
      default: { prototype: Pick<NativeMethods, "measureInWindow"> };
    }>("react-native/Libraries/Components/View/ViewNativeComponent");
    const measures = vi
      .spyOn(native.default.prototype, "measureInWindow")
      .mockImplementation(function (this: NativeMethods, callback) {
        if (this === field.current) callback(0, 3900, 200, 44);
        else callback(0, 100, 390, 300);
      });
    const commands = createRequire(import.meta.url)(
      "react-native/Libraries/Components/ScrollView/ScrollViewCommands",
    ).default as {
      scrollTo: (host: unknown, x: number, y: number, animated: boolean) => void;
    };
    const scrollTo = vi.spyOn(commands, "scrollTo").mockImplementation(() => {});
    const end = vi.fn<(event: { distanceFromEnd: number }) => void>();
    const data = ["First field", "Second field"];
    await render(
      <FormInteractionScope>
        {kind === "flat" ? (
          <InputFlatList
            data={data}
            keyExtractor={String}
            renderItem={({ item }) => <ActualField name={item} />}
            onEndReached={end}
          />
        ) : (
          <InputSectionList
            sections={[{ key: "fields", data }]}
            keyExtractor={String}
            renderItem={({ item }) => <ActualField name={item} />}
            onEndReached={end}
          />
        )}
      </FormInteractionScope>,
    );
    const hosts = screen.container.queryAll(
      (node) =>
        typeof node.props.onScroll === "function" &&
        typeof node.props.onScrollBeginDrag === "function",
    );
    expect(hosts).toHaveLength(1);
    const list = hosts[0];
    await measureNativeList(list, {
      contentHeight: 4000,
      width: 390,
      viewportHeight: 500,
    });
    const currentField = field.current;
    const currentOwner = owner;
    if (!currentField || !currentOwner)
      throw new Error("Expected actual field and public input-scroll owner");
    scrollTo.mockClear();
    end.mockClear();
    await act(() => currentOwner.reveal(currentField));
    let passes = 0;
    while (frames.length && passes++ < 10) {
      const batch = frames.splice(0);
      await act(() => {
        for (const callback of batch) callback(0);
      });
    }
    expect(frames).toHaveLength(0);
    expect(measures.mock.contexts).toContain(currentField);
    expect(measures.mock.contexts.some((context) => context !== currentField)).toBe(true);
    expect(scrollTo.mock.calls.map(([, x, y, animated]) => ({ x, y, animated }))).toEqual([
      { x: 0, y: 3736, animated: false },
    ]);
    await fireEvent.scroll(list, {
      nativeEvent: {
        contentOffset: { x: 0, y: 3736 },
        contentSize: { width: 390, height: 4000 },
        layoutMeasurement: { width: 390, height: 500 },
        zoomScale: 1,
      },
    });
    expect(end).not.toHaveBeenCalled();
    await userEvent.setup({ delay: 16 }).scrollTo(list, {
      y: 3400,
      contentSize: { width: 390, height: 4000 },
      layoutMeasurement: { width: 390, height: 500 },
    });
    expect(end).toHaveBeenCalled();
    for (const [event] of end.mock.calls) expect(event.distanceFromEnd).toBeLessThanOrEqual(1000);
  },
);
