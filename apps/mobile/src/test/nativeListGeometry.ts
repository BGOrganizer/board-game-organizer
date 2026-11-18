import { fireEvent, type screen, userEvent, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

type NativeHost = ReturnType<typeof screen.getByTestId>;
type ListGeometry = { contentHeight: number; width?: number; viewportHeight?: number };
function contentHost(list: NativeHost) {
  if (typeof list.props.onScroll !== "function")
    throw new Error("Expected the actual native ScrollView host");
  // RN strips native onContentSizeChange. The immediate content View forwards
  // Yoga layout; searching descendants could instead measure a header or row.
  const content = list.children.find(
    (node) => typeof node !== "string" && typeof node.props.onLayout === "function",
  );
  if (!content || typeof content === "string")
    throw new Error("Expected the immediate native ScrollView content-layout host");
  return content;
}
const isCell = (node: NativeHost) =>
  typeof node.props.onFocusCapture === "function" && typeof node.props.onLayout === "function";
function renderedWindow(list: NativeHost) {
  return contentHost(list).children.flatMap((node) =>
    typeof node === "string"
      ? []
      : [{ node, height: StyleSheet.flatten(node.props.style)?.height }],
  );
}

/** Supply missing Yoga geometry while keeping real RN list/event handling. */
export async function measureNativeList(
  list: NativeHost,
  { contentHeight, width = 390, viewportHeight = 500 }: ListGeometry,
) {
  await fireEvent.layout(list, { x: 0, y: 0, width, height: viewportHeight });
  await fireEvent.layout(contentHost(list), { x: 0, y: 0, width, height: contentHeight });
}

/**
 * Fixture sizes belong to this native boundary, never production row heights.
 * Walk immediate native hosts in document order, preserving RN's public spacer
 * styles so a newly mounted window does not restart its cell offsets at zero.
 */
export async function measureNativeListCells(
  list: NativeHost,
  { headerHeight = 120, cellHeight = 96, width = 390 } = {},
) {
  const content = contentHost(list);
  const style = StyleSheet.flatten(content.props.style);
  const padding = style?.padding ?? 0;
  let y = style?.paddingTop ?? style?.paddingVertical ?? padding;
  let count = 0;
  let trailingSpacer = false;
  for (const node of content.children) {
    if (typeof node === "string") continue;
    const rowStyle = StyleSheet.flatten(node.props.style);
    if (isCell(node)) {
      await fireEvent.layout(node, { x: 0, y, width, height: cellHeight });
      y += cellHeight;
      count++;
      trailingSpacer = false;
    } else if (typeof node.props.onLayout === "function") {
      const height =
        typeof rowStyle?.height === "number" ? rowStyle.height : count ? 32 : headerHeight;
      await fireEvent.layout(node, { x: 0, y, width, height });
      y += height;
    } else if (typeof rowStyle?.height === "number") {
      y += rowStyle.height;
      // The actual RN tail spacer is capped at its highest measured cell.
      // Until the last window mounts, it cannot claim the full dataset height.
      trailingSpacer = count > 0;
    }
  }
  y += style?.paddingBottom ?? style?.paddingVertical ?? padding;
  return { height: y, trailingSpacer, count };
}

/**
 * Reproduce progressive native layout plus real drag/scroll events. A long
 * VirtualizedList first measures only its mounted window, not the whole data
 * set. Each newly mounted window gets its genuine Yoga pass before continuing.
 */
export async function scrollNativeListToEnd(list: NativeHost, contentHeight = 1200) {
  // A real drag spans frames. Zero-delay steps finish before RN's 50ms window
  // batching can observe an empty-to-cached list, so its final edge is missed.
  const user = userEvent.setup({ delay: 16 });
  const metrics = (height: number) => ({
    contentSize: { width: 390, height },
    layoutMeasurement: { width: 390, height: 500 },
  });
  // Move away from the previous end before changing content dimensions. This
  // resets RN's native end deduplication before a newly active user's gesture.
  const initial = await measureNativeListCells(list);
  const initialHeight = Math.max(501, initial.height);
  await measureNativeList(list, { contentHeight: initialHeight });
  await user.scrollTo(list, { y: 0, ...metrics(initialHeight) });
  for (let pass = 0; pass < 32; pass++) {
    const before = renderedWindow(list);
    const layout = await measureNativeListCells(list);
    const height = layout.trailingSpacer
      ? Math.max(501, layout.height)
      : Math.max(contentHeight, layout.height);
    await measureNativeList(list, { contentHeight: height });
    await user.scrollTo(list, { y: height - 500, ...metrics(height) });
    // An absent tail spacer means the final window was already laid out. Stop
    // after its gesture; any appended API page belongs to the caller's next action.
    if (!layout.trailingSpacer) return;
    // RN can revise a capped tail spacer before mounting another cell. Wait
    // for either public geometry or mounted hosts to advance before the next Yoga pass.
    await waitFor(() => {
      const after = renderedWindow(list);
      if (
        before.length === after.length &&
        before.every(
          (entry, index) =>
            entry.node === after[index].node && entry.height === after[index].height,
        )
      )
        throw new Error("Waiting for RN's next native virtualized window");
    });
  }
  throw new Error("Native fixture window did not settle after 32 layout/scroll passes");
}
