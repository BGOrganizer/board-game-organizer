import { act, cleanup, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { createRef, useContext } from "react";
import {
  Keyboard,
  type KeyboardEvent,
  type KeyboardEventName,
  Platform,
  type ScrollViewProps,
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
import { ListActivityContext } from "@/lib/listActivity";
import { measureNativeList } from "@/test/nativeListGeometry";
import { FormInteractionScope, useFormInteraction } from "../FormInteractionScope";
import { InputFlatList } from "../InputFlatList";
import { InputScrollView } from "../InputScrollView";
import { InputSectionList } from "../InputSectionList";

type Kind = "flat" | "section" | "scroll";
const kinds: readonly Kind[] = ["flat", "section", "scroll"];
type Callbacks = Pick<
  ScrollViewProps,
  | "onScroll"
  | "onContentSizeChange"
  | "onScrollBeginDrag"
  | "onMomentumScrollBegin"
  | "onLayout"
  | "contentContainerStyle"
  | "scrollEventThrottle"
  | "keyboardShouldPersistTaps"
>;
const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
let owner: InputScrollOwner | null;
let form: ReturnType<typeof useFormInteraction>;
let handlers: Map<KeyboardEventName, Set<(event: KeyboardEvent) => void>>;
function Row({ name }: { name: string }) {
  owner = useContext(InputScrollContext);
  const inherited = useContext(InputFieldContext);
  form = useFormInteraction();
  return (
    <View>
      <Text>{name}</Text>
      <Text>{`Owner: ${owner ? "present" : "missing"}; field: ${inherited === null ? "clear" : "inherited"}; sheet: ${owner?.inSheet ? "yes" : "no"}`}</Text>
    </View>
  );
}
function Container({
  kind,
  props = {},
  contentSized = false,
}: {
  kind: Kind;
  props?: Callbacks;
  contentSized?: boolean;
}) {
  if (kind === "flat")
    return (
      <InputFlatList
        {...props}
        data={["First row", "Second row"]}
        keyExtractor={String}
        renderItem={({ item }) => <Row name={item} />}
      />
    );
  if (kind === "section")
    return (
      <InputSectionList
        {...props}
        sections={[{ key: "test", data: ["First row", "Second row"] }]}
        keyExtractor={String}
        renderItem={({ item }) => <Row name={item} />}
      />
    );
  return (
    <InputScrollView {...props} sizing={contentSized ? "content" : "fill"}>
      <Row name="First row" />
      <Row name="Second row" />
    </InputScrollView>
  );
}
function Fixture({
  kind,
  height,
  active,
  props,
  contentSized,
}: {
  kind: Kind;
  height?: number;
  active?: { current: boolean };
  props?: Callbacks;
  contentSized?: boolean;
}) {
  return (
    <HeaderHeightContext.Provider value={height}>
      <ListActivityContext value={active ?? null}>
        <InputFieldContext value={createRef<View>()}>
          <FormInteractionScope>
            <Container kind={kind} props={props} contentSized={contentSized} />
          </FormInteractionScope>
        </InputFieldContext>
      </ListActivityContext>
    </HeaderHeightContext.Provider>
  );
}
function scrollHost() {
  const matches = screen.container.queryAll(
    (node) =>
      typeof node.props.onScroll === "function" &&
      typeof node.props.onScrollBeginDrag === "function",
  );
  if (matches.length !== 1) throw new Error("Expected one actual RN ScrollView host");
  return matches[0];
}
function viewportHost() {
  let node = scrollHost().parent;
  while (node) {
    if (
      typeof node.props.onLayout === "function" &&
      typeof node.props.onTouchStart === "function" &&
      typeof node.props.onScroll !== "function"
    )
      return node;
    node = node.parent;
  }
  throw new Error("Expected the app's actual input viewport host");
}
function avoidanceHost() {
  const viewport = viewportHost();
  let node = viewport.parent;
  while (node) {
    if (typeof node.props.onLayout === "function") return node;
    node = node.parent;
  }
  throw new Error("Expected actual KeyboardAvoidingView native layout host");
}
async function emit(name: KeyboardEventName, keyboardTop = 500) {
  await act(async () => {
    const event: KeyboardEvent = {
      duration: 0,
      easing: "keyboard",
      endCoordinates: {
        screenX: 0,
        screenY: keyboardTop,
        width: 390,
        height: 300,
      },
    };
    for (const callback of handlers.get(name) ?? []) callback(event);
    await Promise.resolve();
  });
}
beforeEach(() => {
  owner = null;
  form = null;
  handlers = new Map();
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
  vi.spyOn(Keyboard, "isVisible").mockReturnValue(false);
  vi.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
  const subscribe = Keyboard.addListener.bind(Keyboard);
  vi.spyOn(Keyboard, "addListener").mockImplementation((name, callback) => {
    const callbacks = handlers.get(name) ?? new Set();
    callbacks.add(callback);
    handlers.set(name, callbacks);
    const subscription = subscribe(name, callback);
    const remove = subscription.remove.bind(subscription);
    subscription.remove = () => {
      callbacks.delete(callback);
      remove();
    };
    return subscription;
  });
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
});

// Actual RN containers, optional navigation context and real input/form hooks.
// OS events and Yoga rectangles are fixture native boundaries, not device
// keyboard frames, sheet visibility, native hit testing or FPS acceptance.
it.each(kinds)(
  "%s owns its actual scroll/input scope and clears an inherited field context",
  async (kind) => {
    await render(<Fixture kind={kind} />);
    expect(screen.getByText("First row")).toBeOnTheScreen();
    expect(screen.getByText("Second row")).toBeOnTheScreen();
    expect(screen.getAllByText("Owner: present; field: clear; sheet: no")).toHaveLength(2);
    expect(owner).not.toBeNull();
    expect(form).not.toBeNull();
    expect(scrollHost()).toBeOnTheScreen();
  },
);

const headerCases = kinds.flatMap((kind) =>
  [undefined, 0, 64, 103.5].map((height) => ({ kind, height })),
);
it.each(headerCases)(
  "$kind uses optional iOS header offset $height in actual KeyboardAvoidingView geometry",
  async ({ kind, height }) => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    await render(<Fixture kind={kind} height={height} />);
    const avoidance = avoidanceHost();
    await fireEvent.layout(avoidance, { x: 0, y: 0, width: 390, height: 600 });
    await emit("keyboardWillShow");
    expect(StyleSheet.flatten(avoidance.props.style)?.paddingBottom).toBe(100 + (height ?? 0));
    await emit("keyboardWillHide");
    expect(StyleSheet.flatten(avoidance.props.style)?.paddingBottom).toBe(0);
  },
);

it.each(kinds)(
  "%s leaves Android keyboard resizing to its platform instead of adding iOS padding",
  async (kind) => {
    await render(<Fixture kind={kind} height={64} />);
    const avoidance = avoidanceHost();
    await fireEvent.layout(avoidance, { x: 0, y: 0, width: 390, height: 600 });
    await emit("keyboardDidShow");
    expect(StyleSheet.flatten(avoidance.props.style)?.paddingBottom).toBeUndefined();
  },
);

it.each(kinds)(
  "%s preserves caller native layout/content/scroll/drag callbacks and form cancellation",
  async (kind) => {
    const callbacks = {
      onLayout: vi.fn(),
      onScroll: vi.fn(),
      onContentSizeChange: vi.fn(),
      onScrollBeginDrag: vi.fn(),
      onMomentumScrollBegin: vi.fn(),
    };
    await render(
      <Fixture
        kind={kind}
        props={{
          ...callbacks,
          contentContainerStyle: { minHeight: 250 },
          scrollEventThrottle: 32,
          keyboardShouldPersistTaps: "always",
        }}
      />,
    );
    const list = scrollHost();
    const ticket = form?.deferFirstError();
    if (!ticket) throw new Error("Expected real form cancellation ticket");
    await measureNativeList(list, {
      contentHeight: 1000,
      width: 390,
      viewportHeight: 500,
    });
    expect(callbacks.onLayout).toHaveBeenCalled();
    expect(callbacks.onContentSizeChange).toHaveBeenCalledWith(390, 1000);
    expect(ticket.isCurrent()).toBe(true);
    await userEvent.setup({ delay: 16 }).scrollTo(list, {
      y: 200,
      momentumY: 250,
      contentSize: { width: 390, height: 1000 },
      layoutMeasurement: { width: 390, height: 500 },
    });
    expect(callbacks.onScroll).toHaveBeenCalled();
    expect(callbacks.onScrollBeginDrag).toHaveBeenCalled();
    expect(ticket.isCurrent()).toBe(false);
    if (kind !== "scroll") expect(callbacks.onMomentumScrollBegin).toHaveBeenCalled();
  },
);

it.each(kinds)(
  "%s ignores late inactive native layout/content/scroll callbacks and accepts a new active gesture",
  async (kind) => {
    const active = { current: false };
    const callbacks = {
      onLayout: vi.fn(),
      onScroll: vi.fn(),
      onContentSizeChange: vi.fn(),
      onScrollBeginDrag: vi.fn(),
      ...(kind !== "scroll" ? { onMomentumScrollBegin: vi.fn() } : {}),
    };
    await render(<Fixture kind={kind} active={active} props={callbacks} />);
    const list = scrollHost();
    const ticket = form?.deferFirstError();
    if (!ticket) throw new Error("Expected real form cancellation ticket");
    await measureNativeList(list, { contentHeight: 1000 });
    await userEvent.setup({ delay: 16 }).scrollTo(list, {
      y: 200,
      momentumY: 250,
      contentSize: { width: 390, height: 1000 },
      layoutMeasurement: { width: 390, height: 500 },
    });
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    expect(ticket.isCurrent()).toBe(true);
    active.current = true;
    await measureNativeList(list, { contentHeight: 1100 });
    await userEvent.setup({ delay: 16 }).scrollTo(list, {
      y: 300,
      momentumY: 350,
      contentSize: { width: 390, height: 1100 },
      layoutMeasurement: { width: 390, height: 500 },
    });
    expect(callbacks.onLayout).toHaveBeenCalled();
    expect(callbacks.onContentSizeChange).toHaveBeenCalledWith(390, 1100);
    expect(callbacks.onScrollBeginDrag).toHaveBeenCalled();
    expect(callbacks.onScroll).toHaveBeenCalled();
    expect(ticket.isCurrent()).toBe(false);
  },
);

it("keeps content-sized InputScrollView's native content range independent of viewport reveal height", async () => {
  await render(
    <Fixture kind="scroll" contentSized props={{ contentContainerStyle: { minHeight: 250 } }} />,
  );
  await fireEvent.layout(viewportHost(), {
    x: 0,
    y: 0,
    width: 390,
    height: 600,
  });
  const content = scrollHost().children.find(
    (node) => typeof node !== "string" && typeof node.props.onLayout === "function",
  );
  if (!content || typeof content === "string")
    throw new Error("Expected real native scroll content view");
  expect(StyleSheet.flatten(content.props.style)?.minHeight).toBe(250);
  expect(StyleSheet.flatten(avoidanceHost().props.style)?.flexShrink).toBe(1);
});

it("keeps portal-owned external keyboard avoidance outside the actual InputFlatList", async () => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  await render(
    <HeaderHeightContext.Provider value={64}>
      <FormInteractionScope>
        <InputFlatList
          keyboardAvoidance="external"
          data={["Portal field"]}
          keyExtractor={String}
          renderItem={({ item }) => <Row name={item} />}
        />
      </FormInteractionScope>
    </HeaderHeightContext.Provider>,
  );
  const avoidance = avoidanceHost();
  await fireEvent.layout(avoidance, { x: 0, y: 0, width: 390, height: 600 });
  await emit("keyboardWillShow");
  expect(StyleSheet.flatten(avoidance.props.style)?.paddingBottom).toBeUndefined();
  expect(screen.getByText("Portal field")).toBeOnTheScreen();
});

it.each(kinds)(
  "%s uses only the active viewport to establish the native content range",
  async (kind) => {
    const active = { current: false };
    await render(<Fixture kind={kind} active={active} />);
    const content = scrollHost().children.find(
      (node) => typeof node !== "string" && typeof node.props.onLayout === "function",
    );
    if (!content || typeof content === "string") throw new Error("Expected native input content");
    const height = () => StyleSheet.flatten(content.props.style)?.minHeight;
    const layout = (height: number) =>
      fireEvent.layout(viewportHost(), { x: 0, y: 0, width: 390, height });

    const original = height();
    await layout(250);
    expect(height()).toBe(original);

    active.current = true;
    await layout(360);
    expect(height()).toBe(360);
    active.current = false;
    await layout(500);
    expect(height()).toBe(360);
    expect(screen.getByText("First row")).toBeOnTheScreen();
  },
);
