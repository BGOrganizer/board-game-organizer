import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beforeEach, expect, it, vi } from "vitest";

const header = vi.hoisted(() => ({ context: {}, height: undefined as number | undefined }));
vi.mock("expo-router/react-navigation", () => ({ HeaderHeightContext: header.context }));
vi.mock("react", () => ({
  useContext: (context: unknown) => {
    expect(context).toBe(header.context);
    return header.height;
  },
}));

import { useOptionalHeaderHeight } from "../useOptionalHeaderHeight";

beforeEach(() => {
  header.height = undefined;
});

it.each([undefined, 0, 64, 103.5])("preserves optional screen header height %s", (height) => {
  header.height = height;
  expect(useOptionalHeaderHeight()).toBe(height ?? 0);
});

const containers = ["InputFlatList", "InputScrollView", "InputSectionList"] as const;
type Container = (typeof containers)[number];
type ScrollEvent = {
  nativeEvent: {
    contentSize: { height: number };
    layoutMeasurement: { height: number };
    contentOffset: { y: number };
  };
};
type ContainerProps = Record<string, unknown> & {
  onScroll: (event: ScrollEvent) => void;
  onContentSizeChange: (width: number, height: number) => void;
  onScrollBeginDrag: (event: ScrollEvent) => void;
  onMomentumScrollBegin: (event: ScrollEvent) => void;
  onEndReached: (event: { distanceFromEnd: number }) => void;
};
type Scroller = { scrollTo: (options: { y: number; animated: boolean }) => void };
type Node = { type: string; props: ContainerProps; children: Node[] };
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const compiled = new Map(
  containers.map((name) => [
    name,
    ts.transpileModule(source(`components/common/ui/${name}.tsx`), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    }).outputText,
  ]),
);

// Execute the real container modules without loading RN's Flow sources. This verifies
// adapter wiring/callbacks, not native keyboard geometry, portal mounting or touch timing.
function renderContainer(
  name: Container,
  {
    height,
    inSheet = false,
    os = "ios",
    props = {},
  }: {
    height?: number;
    inSheet?: boolean;
    os?: string;
    props?: Partial<ContainerProps>;
  } = {},
) {
  header.height = height;
  const nativeList = {
    scrollToOffset: vi.fn(),
    scrollTo: vi.fn(),
    getScrollResponder: () => ({ scrollTo: nativeList.scrollTo }),
  };
  let scrollTarget: () => Scroller | null = () => null;
  const scroll = {
    inSheet,
    minHeight: 200,
    owner: {},
    viewport: {},
    onLayout: vi.fn(),
    touch: vi.fn(),
    onScroll: vi.fn(),
    contentChanged: vi.fn(),
    beginScroll: vi.fn(),
  };
  const modules: Record<string, unknown> = {
    "@gorhom/bottom-sheet": {
      BottomSheetFlatList: "BottomSheetFlatList",
      BottomSheetScrollView: "BottomSheetScrollView",
      BottomSheetSectionList: "BottomSheetSectionList",
    },
    "expo-router/react-navigation": {
      useHeaderHeight: () => {
        throw Error("Strict header lookup must not run in an optional container");
      },
    },
    react: {
      useRef: (initial: unknown) => ({ current: initial === null ? nativeList : initial }),
      useImperativeHandle: vi.fn(),
    },
    "react-native": {
      FlatList: "FlatList",
      ScrollView: "ScrollView",
      SectionList: "SectionList",
      KeyboardAvoidingView: "KeyboardAvoidingView",
      Platform: { OS: os },
      StyleSheet: { flatten: (style: unknown) => style },
      View: "View",
    },
    "@/lib/inputScrollContext": {
      InputFieldContext: { Provider: "InputFieldProvider" },
      InputScrollContext: { Provider: "InputScrollProvider" },
    },
    "@/lib/useInputScroll": {
      useInputScroll: (target: () => Scroller | null) => {
        scrollTarget = target;
        return scroll;
      },
    },
    "@/lib/useOptionalHeaderHeight": { useOptionalHeaderHeight },
  };
  const exports: Record<string, (props: Partial<ContainerProps>) => Node> = {};
  const code = compiled.get(name);
  if (!code) throw Error(`Missing container: ${name}`);
  runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (!(id in modules)) throw Error(`Unexpected import: ${id}`);
      return modules[id];
    },
    React: {
      createElement: (type: string, props: Node["props"], ...children: Node[]) => ({
        type,
        props,
        children,
      }),
    },
  });
  const root = exports[name](props);
  const viewport = root.children[0];
  const owner = viewport.children[0];
  const field = owner.children[0];
  return {
    root,
    viewport,
    owner,
    field,
    list: field.children[0],
    scroll,
    nativeList,
    scrollTarget,
  };
}

it.each(containers)("%s handles screen, headerless screen, portal and sheet contexts", (name) => {
  for (const height of [undefined, 0, 64, 103.5]) {
    for (const inSheet of [false, true]) {
      for (const os of ["ios", "android"]) {
        const h = renderContainer(name, { height, inSheet, os });
        expect(h.root.type).toBe("KeyboardAvoidingView");
        expect(h.root.props.keyboardVerticalOffset).toBe(height ?? 0);
        expect(h.root.props.behavior).toBe(os === "ios" && !inSheet ? "padding" : undefined);
        expect(h.list.type).toBe(`${inSheet ? "BottomSheet" : ""}${name.slice(5)}`);
        expect(h.list.props.keyboardShouldPersistTaps).toBe("handled");
        expect(h.list.props.scrollEventThrottle).toBe(16);
        expect(h.viewport.props.ref).toBe(h.scroll.viewport);
        expect(h.viewport.props.onLayout).toBe(h.scroll.onLayout);
        expect(h.viewport.props.onTouchStart).toBe(h.scroll.touch);
        expect(h.owner.props.value).toBe(h.scroll.owner);
        expect(h.field.props.value).toBeNull();
        if (name !== "InputScrollView") {
          expect(h.list.props.initialNumToRender).toBe(8);
          expect(h.list.props.maxToRenderPerBatch).toBe(6);
          expect(h.list.props.windowSize).toBe(7);
        }
      }
    }
  }
});

it("keeps external keyboard avoidance owned by the portal caller", () => {
  const { root } = renderContainer("InputFlatList", {
    props: { keyboardAvoidance: "external" },
  });
  expect(root.props.behavior).toBeUndefined();
  expect(root.props.keyboardVerticalOffset).toBe(0);
});

it.each(containers)("%s preserves local scroll callbacks, sizes and caller overrides", (name) => {
  const props = {
    onScroll: vi.fn(),
    onContentSizeChange: vi.fn(),
    onScrollBeginDrag: vi.fn(),
    onMomentumScrollBegin: vi.fn(),
    onEndReached: vi.fn(),
    keyboardShouldPersistTaps: "always",
    initialNumToRender: 12,
    maxToRenderPerBatch: 4,
    windowSize: 5,
    scrollEventThrottle: 32,
    contentContainerStyle: { minHeight: 250 },
    style: { flex: 2 },
  };
  const h = renderContainer(name, { props });
  const event = {
    nativeEvent: {
      contentSize: { height: 100 },
      layoutMeasurement: { height: 80 },
      contentOffset: { y: 20 },
    },
  };
  expect(h.root.props.style).toBe(props.style);
  expect(h.list.props.contentContainerStyle).toEqual([
    props.contentContainerStyle,
    { minHeight: 250 },
  ]);
  expect(h.list.props.keyboardShouldPersistTaps).toBe("always");
  expect(h.list.props.scrollEventThrottle).toBe(32);
  h.list.props.onScroll(event);
  expect(h.scroll.onScroll).toHaveBeenCalledWith(event);
  expect(props.onScroll).toHaveBeenCalledWith(event);
  h.list.props.onContentSizeChange(100, 300);
  expect(h.scroll.contentChanged).toHaveBeenCalledOnce();
  expect(props.onContentSizeChange).toHaveBeenCalledWith(100, 300);
  if (name !== "InputScrollView") {
    expect(h.list.props.initialNumToRender).toBe(12);
    expect(h.list.props.maxToRenderPerBatch).toBe(4);
    expect(h.list.props.windowSize).toBe(5);
    h.scrollTarget()?.scrollTo({ y: 50, animated: false });
    expect(
      name === "InputFlatList" ? h.nativeList.scrollToOffset : h.nativeList.scrollTo,
    ).toHaveBeenCalledWith(
      name === "InputFlatList" ? { offset: 50, animated: false } : { y: 50, animated: false },
    );
    h.list.props.onEndReached({ distanceFromEnd: 0 });
    expect(props.onEndReached).not.toHaveBeenCalled();
  }
  h.list.props.onScrollBeginDrag(event);
  expect(h.scroll.beginScroll).toHaveBeenCalledOnce();
  expect(props.onScrollBeginDrag).toHaveBeenCalledWith(event);
  if (name !== "InputScrollView") {
    expect(props.onEndReached).toHaveBeenCalledWith({ distanceFromEnd: 0 });
    h.list.props.onMomentumScrollBegin(event);
    expect(props.onMomentumScrollBegin).toHaveBeenCalledWith(event);
    h.list.props.onEndReached({ distanceFromEnd: 5 });
    expect(props.onEndReached).toHaveBeenLastCalledWith({ distanceFromEnd: 5 });
  } else {
    expect(h.scrollTarget()).toBe(h.nativeList);
  }
});

it("keeps affected portal, sheet and invitation callers on the shared input containers", () => {
  expect(source("components/events/EventGroupSelect.tsx")).toContain("<Select.Portal>");
  expect(source("components/events/EventGroupSelect.tsx")).toContain("<InputFlatList");
  expect(source("components/common/ui/ConfirmDialog.tsx")).toContain("<Dialog.Portal");
  expect(source("components/common/ui/ConfirmDialog.tsx")).toContain("<InputScrollView");
  expect(source("components/events/TableScoreEditor.tsx")).toContain("<BottomSheet.Portal>");
  expect(source("components/events/TableScoreEditor.tsx")).toContain("<InputScrollView");
  expect(source("components/events/EventInvitationPicker.tsx")).toContain("<PeoplePicker");
  expect(source("components/contacts/PeoplePicker.tsx")).toContain("<UserList");
  expect(source("components/common/ui/UserList.tsx")).toContain("<InputFlatList");
});

it.each([
  ["EventVoteButtons", "EventTableOverview", "Game voting"],
  ["EventProposalReviewDialog", "EventProposalSection", "Other players' proposals"],
])("keeps %s on the portal-safe shared dialog for %s (%s)", (consumer, parent) => {
  expect(source(`components/events/${parent}.tsx`)).toContain(`<${consumer}`);
  expect(source(`components/events/${consumer}.tsx`)).toContain("<ConfirmDialog");
  expect(source("components/common/ui/ConfirmDialog.tsx")).toContain("<Dialog.Portal");
  expect(source("components/common/ui/ConfirmDialog.tsx")).toContain("<InputScrollView");
});

it("uses the same optional height in LocationPicker without relaxing the inline Back guard", () => {
  const picker = source("components/locations/LocationPicker.tsx");
  expect(picker).toContain(
    'import { useOptionalHeaderHeight } from "@/lib/useOptionalHeaderHeight"',
  );
  expect(picker).toContain("const headerHeight = useOptionalHeaderHeight()");
  expect(picker).toContain("keyboardVerticalOffset={headerHeight}");
  expect(picker).toContain("usePreventRemove(Boolean(onClose), () => onClose?.())");
  for (const path of [
    "components/locations/LocationPicker.tsx",
    ...containers.map((name) => `components/common/ui/${name}.tsx`),
  ])
    expect(source(path)).not.toMatch(/\buseHeaderHeight\b/);
});
