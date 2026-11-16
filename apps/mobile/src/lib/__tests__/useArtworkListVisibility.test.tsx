import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ View: "View" }));
vi.mock("react", async () => ({
  ...(await vi.importActual("react")),
  useState: (initialize: () => unknown) => [initialize()],
  useRef: (value: unknown) => ({ current: value }),
  useMemo: (work: () => unknown) => work(),
  useCallback: (work: unknown) => work,
  useLayoutEffect: (work: () => void) => work(),
}));

import { useArtworkListVisibility } from "../useArtworkListVisibility";

it("keeps list viewability receipts and headers while forwarding the original form callback", () => {
  const original = vi.fn();
  const list = useArtworkListVisibility(original);
  const row = list.row("resource-id", "row") as any;
  const store = row.props.store;
  expect(row.props.id).toBe("resource-id");
  expect(row.props.children).toBe("row");
  const receipt = {
    viewableItems: [{ key: "resource-id", item: {}, index: 0, isViewable: true }],
    changed: [],
  };
  list.onViewableItemsChanged(receipt);
  expect(original).toHaveBeenCalledWith(receipt);
  expect(store.isVisible("resource-id")).toBe(true);
  expect(list.header(undefined)).toBeNull();
  expect(list.header(null)).toBeNull();
  expect(list.header(false)).toBeNull();
  const header = list.header("header") as any;
  const wrapper = header.props.children;
  expect(wrapper.props.id).toBe(store.headerKey);
  const view = wrapper.props.children;
  list.onLayout({ nativeEvent: { layout: { height: 96 } } } as any);
  view.props.onLayout({ nativeEvent: { layout: { y: 12, height: 96 } } });
  expect(store.isVisible(store.headerKey)).toBe(true);
  list.onScroll({
    nativeEvent: { contentOffset: { y: 108 }, layoutMeasurement: { height: 96 } },
  } as any);
  expect(store.isVisible(store.headerKey)).toBe(false);
  expect(store.isVisible("resource-id")).toBe(true);
});

it("supports resource-only lists without an existing viewability callback", () => {
  const list = useArtworkListVisibility();
  expect(() => list.onViewableItemsChanged({ viewableItems: [], changed: [] })).not.toThrow();
});
