import { render, screen, waitFor } from "@testing-library/react-native";
import { FlatList, Text } from "react-native";
import { expect, it, vi } from "vitest";
import { scrollNativeListToEnd } from "../nativeListGeometry";

it.each([
  { count: 1, batch: 12 },
  { count: 40, batch: 6 },
  { count: 40, batch: 12 },
])(
  "delivers native end-reached after measured scrolling through $count rows with $batch-row batches",
  async ({ count, batch }) => {
    const end = vi.fn();
    await render(
      <FlatList
        testID="geometry-list"
        data={Array.from({ length: count }, (_, index) => index)}
        keyExtractor={String}
        renderItem={({ item }) => <Text>{`Row ${item}`}</Text>}
        initialNumToRender={12}
        maxToRenderPerBatch={batch}
        windowSize={7}
        onEndReached={end}
        onEndReachedThreshold={0.4}
      />,
    );
    await scrollNativeListToEnd(screen.getByTestId("geometry-list"), Math.max(1200, count * 96));
    // Native layout growth may emit end again for a new content length; callers
    // coalesce page requests. This helper must deliver a genuine near-end event.
    await waitFor(() => expect(end).toHaveBeenCalled());
    for (const [event] of end.mock.calls) {
      expect(event.distanceFromEnd).toBeGreaterThanOrEqual(0);
      expect(event.distanceFromEnd).toBeLessThanOrEqual(200);
    }
    expect(screen.getByText(`Row ${count - 1}`)).toBeOnTheScreen();
  },
);

it("resets native end deduplication before a newly active user's real drag", async () => {
  const end = vi.fn();
  let active = false,
    scrolled = false;
  await render(
    <FlatList
      testID="geometry-list"
      data={[1]}
      keyExtractor={String}
      renderItem={({ item }) => <Text>{`Row ${item}`}</Text>}
      onScrollBeginDrag={() => {
        if (active) scrolled = true;
      }}
      onEndReached={() => {
        if (active && scrolled) end();
      }}
      onEndReachedThreshold={0.4}
    />,
  );
  const list = screen.getByTestId("geometry-list");
  await scrollNativeListToEnd(list, 1200);
  expect(end).not.toHaveBeenCalled();
  active = true;
  await scrollNativeListToEnd(list, 1264);
  await waitFor(() => expect(end).toHaveBeenCalledOnce());
});
