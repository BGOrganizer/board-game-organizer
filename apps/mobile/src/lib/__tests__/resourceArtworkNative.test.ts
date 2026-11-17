import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { createResourceArtwork } from "@board-game-organizer/shared/artwork";
import type { XmlAST } from "react-native-svg";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { createArtworkVisibility } from "../artworkVisibility";
import * as frames from "../resourceArtworkFrames";
import * as layers from "../resourceArtworkLayers";
import { resourceArtworkLayers } from "../resourceArtworkLayers";
import * as motion from "../resourceArtworkMotion";

type Element = { type: any; props: Record<string, any> };
function harness(preference: Promise<boolean> = Promise.resolve(false)) {
  let hooks: any[] = [],
    cursor = 0,
    dirty = false;
  const effects: Array<() => void> = [];
  const listeners: Record<string, (value: any) => void> = {};
  const remove = vi.fn(),
    updates = vi.fn();
  const visible = { value: true },
    header = { value: null as any };
  const state = { focused: true, initialReduced: false };
  const measurements: Array<{ success: (...args: number[]) => void; fail: () => void }> = [];
  const nativeFrame = {
    measureLayout: (_parent: unknown, success: (...args: number[]) => void, fail: () => void) =>
      measurements.push({ success, fail }),
  };
  const react: Record<string, any> = {
    memo: (component: unknown) => component,
    createContext: (value: unknown) => ({ context: true, value }),
    use: (context: { value: unknown }) => context.value,
    useState: (initial: unknown) => {
      const i = cursor++;
      hooks[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        hooks[i].value,
        (value: unknown) => {
          updates();
          const next = typeof value === "function" ? value(hooks[i].value) : value;
          if (!Object.is(next, hooks[i].value)) {
            hooks[i].value = next;
            dirty = true;
          }
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = cursor++;
      hooks[i] ??= { current: initial };
      return hooks[i];
    },
    useMemo: (work: () => unknown, deps: unknown[]) => {
      const i = cursor++,
        old = hooks[i];
      if (
        !old ||
        deps.length !== old.deps.length ||
        deps.some((value, index) => !Object.is(value, old.deps[index]))
      )
        hooks[i] = { deps, value: work() };
      return hooks[i].value;
    },
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const i = cursor++,
        old = hooks[i];
      if (
        !old ||
        deps.length !== old.deps.length ||
        deps.some((value, index) => !Object.is(value, old.deps[index]))
      )
        effects.push(() => {
          old?.cleanup?.();
          hooks[i] = { deps, cleanup: effect() };
        });
    },
  };
  react.useCallback = (fn: unknown, deps: unknown[]) => react.useMemo(() => fn, deps);
  react.useId = () => react.useRef("artwork-frame").current;
  react.useSyncExternalStore = (
    subscribe: (fn: () => void) => () => void,
    snapshot: () => boolean,
  ) => {
    const [, setValue] = react.useState(snapshot);
    react.useEffect(() => subscribe(() => setValue(snapshot())), [subscribe, snapshot]);
    return snapshot();
  };
  let progress!: { get(): number; set(value: unknown): void };
  const generated = vi.fn(createResourceArtwork),
    parsed = vi.fn((xml: string, middleware: (node: XmlAST) => XmlAST) => {
      const node = (
        tag: string,
        props: Record<string, string> = {},
        children: XmlAST[] = [],
      ): XmlAST => ({ tag, props, children, parent: null, Tag: "G" as unknown as XmlAST["Tag"] });
      const parts = [...xml.matchAll(/class="([^"]+)"/g)].map((match, index) =>
        node("g", { id: `part-${index}` }, [node("g", { class: match[1] })]),
      );
      const clip = node("clipPath", { id: "clip" }, [
        node("rect", { width: "240", height: "240", rx: "0", ry: "0" }),
      ]);
      const ast = Object.assign(
        node("svg", { viewBox: "0 0 240 240" }, [
          node("defs", {}, [...parts, clip]),
          node(
            "g",
            { clipPath: "url(#clip)" },
            parts.map((part) => node("use", { href: `#${part.props.id}` })),
          ),
        ]),
        { svg: xml },
      );
      return middleware(ast);
    });
  const started = vi.fn(),
    stopped = vi.fn(),
    constructed = vi.fn(),
    interpolated = vi.fn();
  const timing = vi.fn((value: unknown, options: unknown) => ({ value, options })),
    repeat = vi.fn((animation: unknown, options: unknown) => ({
      animation,
      options,
      start: started,
      stop: stopped,
    })),
    cancel = vi.fn();
  class NativeValue {
    value: number;
    constructor(value: number) {
      this.value = value;
      progress = this;
      constructed(this);
    }
    get() {
      return this.value;
    }
    set(value: unknown) {
      if (typeof value === "number") this.value = value;
    }
    setValue(value: number) {
      this.value = value;
    }
    stopAnimation() {
      cancel();
    }
    interpolate({
      inputRange,
      outputRange,
    }: {
      inputRange: number[];
      outputRange: (number | string)[];
    }) {
      interpolated({ inputRange, outputRange });
      let index = 0;
      while (index < inputRange.length - 2 && this.value >= inputRange[index + 1]) index++;
      const amount = (this.value - inputRange[index]) / (inputRange[index + 1] - inputRange[index]);
      const start = outputRange[index],
        end = outputRange[index + 1];
      if (typeof start === "string")
        return `${Number.parseFloat(start) + (Number.parseFloat(String(end)) - Number.parseFloat(start)) * amount}rad`;
      return start + (Number(end) - start) * amount;
    }
  }
  const easing = vi.fn(() => ({ factory: () => (value: number) => value }));
  const jsx = (type: any, props: Record<string, any>): Element => {
    if (type?.context) type.value = props.value;
    if (props.ref && type === "View") props.ref.current = nativeFrame;
    return { type, props };
  };
  react.createElement = (type: any, props: Record<string, any>, ...children: unknown[]) =>
    jsx(type, { ...props, children });
  const navigationListeners: Record<string, () => void> = {};
  const removeNavigation = vi.fn();
  const navigation = {
    value: {
      isFocused: () => state.focused,
      addListener: (event: string, callback: () => void) => {
        navigationListeners[event] = callback;
        return removeNavigation;
      },
    } as object | undefined,
  };
  const modules: Record<string, any> = {
    "@board-game-organizer/shared/artwork": { createResourceArtwork: generated },
    "expo-router/react-navigation": { NavigationContext: navigation },
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      View: "View",
      Animated: { View: "Animated.View", Value: NativeValue, timing, loop: repeat },
      Easing: { linear: (value: number) => value },
      AccessibilityInfo: {
        isReduceMotionEnabled: () => preference,
        addEventListener: (_name: string, fn: (value: boolean) => void) => {
          listeners.reduced = fn;
          return { remove };
        },
      },
      AppState: {
        currentState: "active",
        addEventListener: (_name: string, fn: (value: string) => void) => {
          listeners.app = fn;
          return { remove };
        },
      },
    },
    "react-native-reanimated": {
      __esModule: true,
      default: { View: "Animated.View" },
      Easing: { bezier: easing, linear: (value: number) => value },
      ReduceMotion: { Never: "never" },
      useReducedMotion: () => state.initialReduced,
    },
    "react-native-svg": { G: "G", SvgAst: "SvgAst", parse: parsed },
    uniwind: { ScopedTheme: "ScopedTheme" },
    "@/lib/resourceArtworkMotion": motion,
    "@/lib/resourceArtworkFrames": frames,
    "@/lib/resourceArtworkLayers": {
      resourceArtworkLayers,
      artworkLayerTransform: layers.artworkLayerTransform,
    },
    "./DicebearArtworkLayer": { DicebearArtworkLayer: "DicebearArtworkLayer" },
    "./ArtworkVisibility": { ArtworkVisibleContext: visible, ArtworkHeaderContext: header },
  };
  function load(name: string) {
    const output: Record<string, any> = {};
    const source = readFileSync(
      new URL(`../../components/common/ui/${name}.tsx`, import.meta.url),
      "utf8",
    );
    runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      {
        exports: output,
        require: (id: string) => {
          if (!(id in modules)) throw new Error(`Unexpected artwork dependency ${id}`);
          return modules[id];
        },
      },
    );
    return output;
  }
  const output = load("AnimatedDicebearArtwork"),
    layerComponent = load("DicebearArtworkLayer");
  let props: Record<string, unknown> = { seed: "stable", variant: "events" };
  const retainedPartHooks = new Map<unknown, any[]>();
  return {
    state,
    navigation,
    removeNavigation,
    visible,
    header,
    measurements,
    generated,
    parsed,
    timing,
    repeat,
    started,
    stopped,
    constructed,
    interpolated,
    cancel,
    remove,
    updates,
    easing,
    get progress() {
      return progress;
    },
    renderUnmeasured(next = {}) {
      props = { ...props, ...next };
      dirty = false;
      cursor = 0;
      const tree = output.AnimatedDicebearArtwork(props);
      while (effects.length) effects.shift()?.();
      return tree as Element;
    },
    render(next = {}) {
      props = { ...props, ...next };
      let tree!: Element;
      for (let count = 0; count < 10; count++) {
        dirty = false;
        cursor = 0;
        tree = output.AnimatedDicebearArtwork(props);
        while (effects.length) effects.shift()!();
        if (!dirty) {
          const measure = tree.props.children.props.children.props.children as Element;
          const square = measure.props.children as Element;
          if (square.props.style.width === 0) {
            measure.props.onLayout({ nativeEvent: { layout: { width: 64, height: 64 } } });
            continue;
          }
          return tree;
        }
      }
      throw new Error("Artwork effects failed to settle");
    },
    emitReduced: (value: boolean) => listeners.reduced(value),
    emitApp: (value: string) => listeners.app(value),
    emitFocus: (focused: boolean) => {
      state.focused = focused;
      navigationListeners[focused ? "focus" : "blur"]?.();
    },
    part(props: Record<string, unknown>, retain = false) {
      const rootHooks = hooks;
      const key = (props.layer as { ast: XmlAST }).ast;
      hooks = retain ? (retainedPartHooks.get(key) ?? []) : [];
      cursor = 0;
      const result = layerComponent.DicebearArtworkLayer(props);
      if (retain) retainedPartHooks.set(key, hooks);
      hooks = rootHooks;
      return result as Element;
    },
    unmount() {
      for (const hook of hooks) hook.cleanup?.();
    },
  };
}
function svg(tree: Element) {
  const square = tree.props.children.props.children.props.children.props.children as Element;
  return square.props.children.find((child: Element) => child.props.layer.motion) as Element;
}
function enabled(tree: Element) {
  return svg(tree).props.enabled;
}
const identity = {
  opacity: 1,
  transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0rad" }],
};

it.each(["events", "tables", "groups"])(
  "uses shared deterministic %s SVG unchanged at64/96 and contains every composition",
  (variant) => {
    const h = harness();
    const small = h.render({ variant, size: 64 });
    const xml = svg(small).props.layer.ast.svg;
    expect(small.props.style).toMatchObject({ width: 64, height: 64 });
    expect(small.props.children.props.theme).toBe("light");
    expect(small.props.children.props.children.props.className).toBe("bg-surface");
    expect(h.part(svg(small).props).props.children.props.override.preserveAspectRatio).toBe(
      "xMidYMid meet",
    );
    expect(xml).toBe(createResourceArtwork(variant as "events", "stable").svg);
    expect(h.generated).toHaveBeenCalledWith(variant, "stable");
    for (const presentation of ["thumbnail", "cover", "background"]) {
      const large = h.render({ size: 96, presentation });
      expect(svg(large).props.layer.ast.svg).toBe(xml);
      expect(h.part(svg(large).props).props.children.props.override.preserveAspectRatio).toBe(
        "xMidYMid meet",
      );
    }
    expect(h.generated).toHaveBeenCalledOnce();
    expect(h.parsed).toHaveBeenCalledOnce();
    expect(h.easing).toHaveBeenCalledWith(0.42, 0, 0.58, 1);
    expect(h.timing.mock.calls[0][1]).toMatchObject({
      duration: 4800,
      toValue: 1,
      useNativeDriver: true,
      isInteraction: false,
    });
    h.unmount();
  },
);

it("reacts to system reduced motion without a stale initial read re-enabling movement", async () => {
  let resolve!: (value: boolean) => void;
  const h = harness(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let tree = h.render();
  expect(enabled(tree)).toBe(true);
  h.progress.set(0.5);
  const activePart = h.part(svg(tree).props);
  expect(activePart.props.style[1]).not.toEqual(identity);
  h.emitReduced(true);
  tree = h.render();
  expect(enabled(tree)).toBe(false);
  expect(h.part(svg(tree).props).props.style[1]).toEqual(identity);
  resolve(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(enabled(h.render())).toBe(false);
  h.emitReduced(false);
  expect(enabled(h.render())).toBe(true);
  h.unmount();
  const calls = h.timing.mock.calls.length;
  h.emitReduced(false);
  h.emitApp("active");
  expect(h.timing).toHaveBeenCalledTimes(calls);
  expect(h.remove).toHaveBeenCalledTimes(2);
});

it("pauses on blur, background and offscreen rows without rebuilding the SVG", () => {
  const h = harness();
  expect(enabled(h.render())).toBe(true);
  h.visible.value = false;
  expect(enabled(h.render())).toBe(false);
  h.visible.value = true;
  h.emitFocus(false);
  expect(enabled(h.render())).toBe(false);
  h.emitFocus(true);
  h.emitApp("background");
  expect(enabled(h.render())).toBe(false);
  h.emitApp("active");
  expect(enabled(h.render())).toBe(true);
  expect(h.generated).toHaveBeenCalledOnce();
  expect(h.parsed).toHaveBeenCalledOnce();
  h.unmount();
});

it("keeps a static fallback if the system preference cannot be read", async () => {
  const h = harness(Promise.reject(new Error("unavailable")));
  h.render();
  await Promise.resolve();
  await Promise.resolve();
  expect(enabled(h.render())).toBe(false);
  h.unmount();
});

it("measures header artwork only on layout and ignores callbacks after unmount", () => {
  const h = harness();
  const store = createArtworkVisibility();
  store.headerLayout(0, 1000);
  store.viewport(100);
  h.header.value = { store, ref: { current: {} } };
  let tree = h.render();
  expect(enabled(tree)).toBe(false);
  h.measurements[0].success(0, 0, 64, 64);
  tree = h.render();
  expect(enabled(tree)).toBe(true);
  const count = h.measurements.length;
  store.scroll(300, 100);
  expect(enabled(h.render())).toBe(false);
  expect(h.measurements).toHaveLength(count);
  tree.props.onLayout();
  expect(h.measurements).toHaveLength(count + 1);
  h.measurements.at(-1)!.fail();
  expect(enabled(h.render())).toBe(false);
  h.unmount();
  h.measurements[0].success(0, 0, 64, 64);
  expect(store.isVisible("artwork-frame")).toBe(false);
});

it("starts static under the system preference and rejects late reads/events after disposal", async () => {
  let resolve!: (value: boolean) => void;
  const h = harness(
    new Promise((done) => {
      resolve = done;
    }),
  );
  h.state.initialReduced = true;
  const tree = h.render();
  expect(enabled(tree)).toBe(false);
  expect(h.timing).not.toHaveBeenCalled();
  expect(h.part(svg(tree).props).props.style[1]).toEqual(identity);
  h.unmount();
  const updates = h.updates.mock.calls.length;
  resolve(false);
  await Promise.resolve();
  await Promise.resolve();
  h.emitReduced(false);
  h.emitApp("active");
  expect(h.updates).toHaveBeenCalledTimes(updates);
});

it("renders portal artwork statically without a navigator and disposes prior focus listeners", () => {
  const h = harness();
  expect(enabled(h.render())).toBe(true);
  h.navigation.value = undefined;
  const portal = h.render();
  expect(enabled(portal)).toBe(false);
  expect(h.part(svg(portal).props).props.style[1]).toEqual(identity);
  expect(h.removeNavigation).toHaveBeenCalledTimes(2);
  const calls = h.updates.mock.calls.length;
  h.emitFocus(true);
  expect(h.updates).toHaveBeenCalledTimes(calls);
  h.unmount();
});

it("resumes after startup Reduce Motion is turned off and cancels when it is enabled again", async () => {
  let resolve!: (value: boolean) => void;
  const h = harness(
    new Promise((done) => {
      resolve = done;
    }),
  );
  h.state.initialReduced = true;
  expect(enabled(h.render())).toBe(false);
  expect(h.timing).not.toHaveBeenCalled();
  expect(h.repeat).not.toHaveBeenCalled();
  h.emitReduced(false);
  let tree = h.render();
  expect(enabled(tree)).toBe(true);
  expect(h.timing).toHaveBeenCalledWith(
    h.progress,
    expect.objectContaining({ toValue: 1, useNativeDriver: true, isInteraction: false }),
  );
  expect(h.repeat).toHaveBeenCalledWith(expect.anything(), {
    iterations: -1,
    resetBeforeIteration: true,
  });
  resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(enabled(h.render())).toBe(true);
  h.progress.set(0.5);
  expect(h.part(svg(tree).props).props.style[1]).not.toEqual(identity);
  const cancellations = h.cancel.mock.calls.length;
  h.emitReduced(true);
  tree = h.render();
  expect(enabled(tree)).toBe(false);
  expect(h.cancel.mock.calls.length).toBeGreaterThan(cancellations);
  expect(h.progress.get()).toBe(0);
  expect(h.part(svg(tree).props).props.style[1]).toEqual(identity);
  h.emitReduced(false);
  expect(enabled(h.render())).toBe(true);
  expect(h.timing).toHaveBeenCalledTimes(2);
  expect(h.repeat).toHaveBeenCalledTimes(2);
  h.unmount();
});

it("keeps GPU planes static and contains the complete illustration in square and letterboxed frames", () => {
  const h = harness();
  let tree = h.render({ presentation: "cover" });
  expect(tree.props.children.props.children.props.style.padding).toBe(4);
  const measure = tree.props.children.props.children.props.children as Element;
  measure.props.onLayout({ nativeEvent: { layout: { width: 88, height: 88 } } });
  tree = h.render();
  let square = tree.props.children.props.children.props.children.props.children as Element;
  expect(square.props.style).toEqual({ width: 88, height: 88, overflow: "hidden" });
  const plane = h.part(svg(tree).props);
  expect(plane.type).toBe("Animated.View");
  expect(plane.props.renderToHardwareTextureAndroid).toBe(true);
  expect(plane.props.shouldRasterizeIOS).toBe(true);
  expect(plane.props.style[0].transformOrigin).toEqual([0, 0, 0]);
  expect(plane.props.children.type).toBe("SvgAst");
  expect(plane.props.children.props).not.toHaveProperty("animatedProps");
  expect(
    h.part({ ...svg(tree).props, layer: { ...svg(tree).props.layer, motion: undefined } }).props
      .style[1],
  ).toEqual(identity);
  measure.props.onLayout({ nativeEvent: { layout: { width: 390, height: 150 } } });
  tree = h.render({ presentation: "background" });
  square = tree.props.children.props.children.props.children.props.children as Element;
  expect(square.props.style).toEqual({ width: 150, height: 150, overflow: "hidden" });
  expect(tree.props.children.props.children.props.style.padding).toBe(0);
  expect(h.generated).toHaveBeenCalledOnce();
  expect(h.parsed).toHaveBeenCalledOnce();
  h.unmount();
});

it("owns one native noninteraction clock for all planes and stops it on every disable and disposal", () => {
  const h = harness();
  let tree = h.render({ variant: "groups" });
  const square = tree.props.children.props.children.props.children.props.children as Element;
  expect(square.props.children.length).toBeGreaterThan(1);
  for (const layer of square.props.children) {
    expect(layer.props.progress).toBe(h.progress);
    h.part(layer.props);
  }
  expect(h.constructed).toHaveBeenCalledOnce();
  expect(h.timing).toHaveBeenCalledOnce();
  expect(h.repeat).toHaveBeenCalledOnce();
  expect(h.started).toHaveBeenCalledOnce();
  h.progress.set(0.5);
  tree = h.render({ size: 96, presentation: "background" });
  expect(h.timing).toHaveBeenCalledOnce();
  expect(h.progress.get()).toBe(0.5);
  h.emitApp("background");
  expect(enabled(h.render())).toBe(false);
  expect(h.stopped).toHaveBeenCalledOnce();
  expect(h.progress.get()).toBe(0);
  h.emitApp("active");
  expect(enabled(h.render())).toBe(true);
  expect(h.started).toHaveBeenCalledTimes(2);
  h.unmount();
  expect(h.stopped).toHaveBeenCalledTimes(2);
  expect(h.progress.get()).toBe(0);
  expect(h.constructed).toHaveBeenCalledOnce();
});

it("mounts no SVG planes until the artwork frame has a usable size", () => {
  const h = harness();
  const unmeasured = h.renderUnmeasured();
  const emptySquare = unmeasured.props.children.props.children.props.children.props
    .children as Element;
  expect(emptySquare.props.style.width).toBe(0);
  expect(emptySquare.props.children).toBe(false);
  const measured = h.render();
  const square = measured.props.children.props.children.props.children.props.children as Element;
  expect(square.props.style.width).toBe(64);
  expect(square.props.children.length).toBeGreaterThan(0);
  expect(h.constructed).toHaveBeenCalledOnce();
  h.unmount();
});

it("collapses only exactly constant channels without changing sampled geometry or the shared clock", () => {
  const h = harness();
  const props = svg(h.render()).props;
  const cases: Array<[string, string | undefined, number]> = [
    ["bgo-events-calendar", undefined, 3],
    ["bgo-events-banner", "bunting", 3],
    ["bgo-events-banner", "flag", 3],
    ["bgo-events-banner", "stars", 3],
    ["bgo-events-accessory", undefined, 1],
    ["bgo-tables-die", undefined, 3],
    ["bgo-tables-token", undefined, 1],
    ["bgo-groups-member-0", undefined, 1],
    ["bgo-groups-member-1", undefined, 1],
    ["bgo-groups-member-2", undefined, 1],
    ["bgo-groups-badge", undefined, 1],
  ];
  const placement = { x: 148, y: 151, scale: 0.72 };
  for (const [name, celebration, channels] of cases) {
    const profile = motion.resourceArtworkMotion(name, celebration) as motion.ArtworkMotion;
    const expected = frames.resourceArtworkFrames(profile, placement, 96, (value) => value);
    for (const progress of [0, 0.25, 0.5, 0.75]) {
      h.progress.set(progress);
      h.interpolated.mockClear();
      const plane = h.part({
        ...props,
        size: 96,
        layer: { ...props.layer, motion: profile, placement },
      });
      const index = progress * (expected.inputRange.length - 1);
      expect(plane.props.style[1]).toEqual({
        opacity: expected.opacity[index],
        transform: [
          { translateX: expected.translateX[index] },
          { translateY: expected.translateY[index] },
          { rotate: expected.rotate[index] },
        ],
      });
      expect(h.interpolated).toHaveBeenCalledTimes(channels);
      expect(h.timing).toHaveBeenCalledOnce();
    }
  }
  h.unmount();
});

it("reuses the exact SVG subtree while focus or frame dimensions change", () => {
  const h = harness();
  const props = svg(h.render()).props;
  const first = h.part(props, true);
  const disabled = h.part({ ...props, enabled: false }, true);
  const resized = h.part({ ...props, size: 96 }, true);
  expect(disabled.props.children).toBe(first.props.children);
  expect(resized.props.children).toBe(first.props.children);
  expect(disabled.props.style[1]).toEqual(identity);
  const replacement = h.part(
    { ...props, layer: { ...props.layer, ast: { ...props.layer.ast } } },
    true,
  );
  expect(replacement.props.children).not.toBe(first.props.children);
  expect(h.constructed).toHaveBeenCalledOnce();
  expect(h.timing).toHaveBeenCalledOnce();
  h.unmount();
});
