import { createRequire } from "node:module";
import { act, cleanup, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { type FlatList, type SectionList, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListActivityContext } from "@/lib/listActivity";
import { measureNativeList, measureNativeListCells } from "@/test/nativeListGeometry";
import { FormInteractionScope } from "../FormInteractionScope";
import { InputFlatList } from "../InputFlatList";
import { InputSectionList } from "../InputSectionList";

type IndexFailure = { index: number; averageItemLength: number; highestMeasuredFrameIndex: number };
const data = Array.from({ length: 40 }, (_, index) => `Input row ${index + 1}`);
const commands = createRequire(import.meta.url)(
  "react-native/Libraries/Components/ScrollView/ScrollViewCommands",
).default as { scrollTo(host: unknown, x: number, y: number, animated: boolean): void };
beforeEach(() => {
  vi.spyOn(commands, "scrollTo").mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});
async function measureMountedRows() {
  const hosts = screen.container.queryAll(
    (node) =>
      typeof node.props.onScroll === "function" &&
      typeof node.props.onScrollBeginDrag === "function",
  );
  expect(hosts).toHaveLength(1);
  await measureNativeList(hosts[0], { contentHeight: 2200, viewportHeight: 100 });
  await measureNativeListCells(hosts[0], { headerHeight: 0, cellHeight: 55 });
  vi.mocked(commands.scrollTo).mockClear();
}

// Invoke real RN public list methods: VirtualizedList itself must detect the
// unmeasured target and dispatch the app's failure policy. No extracted handler.
it("gates the real FlatList failure fallback while hidden and uses measured lengths once active", async () => {
  const active = { current: false };
  const ref = createRef<FlatList<string>>();
  const view = await render(
    <ListActivityContext value={active}>
      <FormInteractionScope>
        <InputFlatList
          ref={ref}
          data={data}
          keyExtractor={String}
          initialNumToRender={3}
          renderItem={({ item }) => <Text>{item}</Text>}
        />
      </FormInteractionScope>
    </ListActivityContext>,
  );
  await measureMountedRows();
  const list = ref.current;
  if (!list) throw new Error("Expected the actual forwarded FlatList ref");
  await act(() => list.scrollToIndex({ index: 35, animated: false }));
  expect(commands.scrollTo).not.toHaveBeenCalled();
  active.current = true;
  await act(() => list.scrollToIndex({ index: 35, animated: false }));
  expect(commands.scrollTo).toHaveBeenCalledExactlyOnceWith(expect.anything(), 0, 1925, false);
  await view.unmount();
  vi.mocked(commands.scrollTo).mockClear();
  // RN releases its list ref on unmount; a retained public command cannot
  // manufacture a late index-failure callback against a null application ref.
  await act(() => list.scrollToIndex({ index: 35, animated: false }));
  expect(ref.current).toBeNull();
  expect(commands.scrollTo).not.toHaveBeenCalled();
});

it("forwards the FlatList SDK failure to the active caller override without a fallback command", async () => {
  const active = { current: false };
  const ref = createRef<FlatList<string>>();
  const failure = vi.fn<(event: IndexFailure) => void>();
  await render(
    <ListActivityContext value={active}>
      <FormInteractionScope>
        <InputFlatList
          ref={ref}
          data={data}
          keyExtractor={String}
          initialNumToRender={3}
          renderItem={({ item }) => <Text>{item}</Text>}
          onScrollToIndexFailed={failure}
        />
      </FormInteractionScope>
    </ListActivityContext>,
  );
  await measureMountedRows();
  const list = ref.current;
  if (!list) throw new Error("Expected the actual forwarded FlatList ref");
  await act(() => list.scrollToIndex({ index: 35 }));
  expect(failure).not.toHaveBeenCalled();
  active.current = true;
  await act(() => list.scrollToIndex({ index: 35 }));
  expect(failure).toHaveBeenCalledExactlyOnceWith({
    index: 35,
    averageItemLength: 55,
    highestMeasuredFrameIndex: expect.any(Number),
  });
  expect(failure.mock.calls[0][0].highestMeasuredFrameIndex).toBeLessThan(35);
  expect(commands.scrollTo).not.toHaveBeenCalled();
  active.current = false;
  await act(() => list.scrollToIndex({ index: 35 }));
  expect(failure).toHaveBeenCalledOnce();
});

it("gates SectionList failure overrides and leaves the SDK's missing-handler contract intact", async () => {
  const active = { current: false };
  const ref = createRef<SectionList<string>>();
  const failure = vi.fn<(event: IndexFailure) => void>();
  const fixture = (onScrollToIndexFailed?: (event: IndexFailure) => void) => (
    <ListActivityContext value={active}>
      <FormInteractionScope>
        <InputSectionList
          ref={ref}
          sections={[{ key: "inputs", data }]}
          keyExtractor={String}
          initialNumToRender={3}
          renderItem={({ item }) => <Text>{item}</Text>}
          onScrollToIndexFailed={onScrollToIndexFailed}
        />
      </FormInteractionScope>
    </ListActivityContext>
  );
  const view = await render(fixture(failure));
  await measureMountedRows();
  const list = ref.current;
  if (!list) throw new Error("Expected the actual forwarded SectionList ref");
  await act(() => list.scrollToLocation({ sectionIndex: 0, itemIndex: 35 }));
  expect(failure).not.toHaveBeenCalled();
  active.current = true;
  await act(() => list.scrollToLocation({ sectionIndex: 0, itemIndex: 35 }));
  expect(failure).toHaveBeenCalledExactlyOnceWith({
    index: 35,
    averageItemLength: 55,
    highestMeasuredFrameIndex: expect.any(Number),
  });
  expect(commands.scrollTo).not.toHaveBeenCalled();
  await view.rerender(fixture());
  expect(() => list.scrollToLocation({ sectionIndex: 0, itemIndex: 35 })).toThrow(
    /scrollToIndex should be used in conjunction with getItemLayout or onScrollToIndexFailed/,
  );
  expect(failure).toHaveBeenCalledOnce();
  expect(commands.scrollTo).not.toHaveBeenCalled();
});
