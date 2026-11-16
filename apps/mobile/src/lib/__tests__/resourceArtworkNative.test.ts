import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { createResourceArtwork } from "@board-game-organizer/shared/artwork";
import type { XmlAST } from "react-native-svg";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { createArtworkVisibility } from "../artworkVisibility";
import * as motion from "../resourceArtworkMotion";
import { resourceArtworkTree } from "../resourceArtworkTree";

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
      const classes = [...xml.matchAll(/class="([^"]+)"/g)].map((match) => ({
        tag: "g",
        props: { class: match[1] },
        children: [],
        parent: null,
        Tag: "G",
      }));
      const ast = middleware({
        tag: "svg",
        props: {},
        children: classes,
        parent: null,
        Tag: "Svg",
      } as unknown as XmlAST);
      // react-native-svg astToReact converts XML class to className after middleware.
      for (const node of ast.children) {
        if (typeof node !== "string" && node.props.class) {
          node.props.className = node.props.class;
          delete node.props.class;
        }
      }
      return Object.assign(ast, { svg: xml });
    });
  const timing = vi.fn((value: number, options: unknown) => ({ value, options })),
    repeat = vi.fn((animation: unknown) => ({ animation })),
    cancel = vi.fn();
  const easing = vi.fn(() => ({ factory: () => (value: number) => value }));
  const jsx = (type: any, props: Record<string, any>): Element => {
    if (type?.context) type.value = props.value;
    if (props.ref && type === "View") props.ref.current = nativeFrame;
    return { type, props };
  };
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
      default: { createAnimatedComponent: () => "Animated.G" },
      Easing: { bezier: easing, linear: (value: number) => value },
      ReduceMotion: { Never: "never" },
      useReducedMotion: () => state.initialReduced,
      useSharedValue: () => {
        const ref = react.useRef(null);
        if (!ref.current) {
          let value = 0;
          ref.current = {
            get: () => value,
            set: (next: unknown) => {
              if (typeof next === "number") value = next;
            },
          };
        }
        progress = ref.current;
        return ref.current;
      },
      useAnimatedProps: (fn: () => unknown) => fn(),
      withTiming: timing,
      withRepeat: repeat,
      cancelAnimation: cancel,
    },
    "react-native-svg": { G: "G", SvgAst: "SvgAst", parse: parsed },
    uniwind: { ScopedTheme: "ScopedTheme" },
    "@/lib/resourceArtworkMotion": motion,
    "@/lib/resourceArtworkTree": { resourceArtworkTree },
    "./ArtworkVisibility": { ArtworkVisibleContext: visible, ArtworkHeaderContext: header },
  };
  const output: Record<string, any> = {};
  const source = readFileSync(
    new URL("../../components/common/ui/AnimatedDicebearArtwork.tsx", import.meta.url),
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
  let props: Record<string, unknown> = { seed: "stable", variant: "events" };
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
    cancel,
    remove,
    updates,
    easing,
    get progress() {
      return progress;
    },
    render(next = {}) {
      props = { ...props, ...next };
      let tree!: Element;
      for (let count = 0; count < 10; count++) {
        dirty = false;
        cursor = 0;
        tree = output.AnimatedDicebearArtwork(props);
        while (effects.length) effects.shift()!();
        if (!dirty) return tree;
      }
      throw new Error("Artwork effects failed to settle");
    },
    emitReduced: (value: boolean) => listeners.reduced(value),
    emitApp: (value: string) => listeners.app(value),
    emitFocus: (focused: boolean) => {
      state.focused = focused;
      navigationListeners[focused ? "focus" : "blur"]?.();
    },
    part(ast: XmlAST) {
      const group = ast.children.find(
        (node) => typeof node !== "string" && typeof node.Tag === "function",
      ) as XmlAST;
      const rootHooks = hooks;
      hooks = [];
      cursor = 0;
      const result = (group.Tag as any)(group.props);
      hooks = rootHooks;
      return result as Element;
    },
    unmount() {
      for (const hook of hooks) hook.cleanup?.();
    },
  };
}
function svg(tree: Element) {
  return tree.props.children.props.children.props.children.props.children as Element;
}
function enabled(tree: Element) {
  return tree.props.children.props.children.props.children.props.value.enabled;
}

it.each(["events", "tables", "groups"])(
  "uses shared deterministic %s SVG unchanged at64/96 and contains every composition",
  (variant) => {
    const h = harness();
    const small = h.render({ variant, size: 64 });
    const xml = svg(small).props.ast.svg;
    expect(small.props.style).toMatchObject({ width: 64, height: 64 });
    expect(small.props.children.props.theme).toBe("light");
    expect(small.props.children.props.children.props.className).toBe("bg-surface");
    expect(svg(small).props.override.preserveAspectRatio).toBe("xMidYMid meet");
    expect(xml).toBe(createResourceArtwork(variant as "events", "stable").svg);
    expect(h.generated).toHaveBeenCalledWith(variant, "stable");
    for (const presentation of ["thumbnail", "cover", "background"]) {
      const large = h.render({ size: 96, presentation });
      expect(svg(large).props.ast.svg).toBe(xml);
      expect(svg(large).props.override.preserveAspectRatio).toBe("xMidYMid meet");
    }
    expect(h.generated).toHaveBeenCalledOnce();
    expect(h.parsed).toHaveBeenCalledOnce();
    expect(h.easing).toHaveBeenCalledWith(0.42, 0, 0.58, 1);
    expect(h.timing.mock.calls[0][1]).toMatchObject({ duration: 4800, reduceMotion: "never" });
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
  const activePart = h.part(svg(tree).props.ast);
  expect(activePart.props.animatedProps.matrix).not.toEqual([1, 0, 0, 1, 0, 0]);
  h.emitReduced(true);
  tree = h.render();
  expect(enabled(tree)).toBe(false);
  expect(h.part(svg(tree).props.ast).props.animatedProps).toEqual({
    matrix: [1, 0, 0, 1, 0, 0],
    opacity: 1,
  });
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
  expect(h.part(svg(tree).props.ast).props.animatedProps).toEqual({
    matrix: [1, 0, 0, 1, 0, 0],
    opacity: 1,
  });
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
  expect(h.part(svg(portal).props.ast).props.animatedProps).toEqual({
    matrix: [1, 0, 0, 1, 0, 0],
    opacity: 1,
  });
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
  expect(h.timing).toHaveBeenCalledWith(1, expect.objectContaining({ reduceMotion: "never" }));
  expect(h.repeat).toHaveBeenCalledWith(expect.anything(), -1, false, undefined, "never");
  resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(enabled(h.render())).toBe(true);
  h.progress.set(0.5);
  expect(h.part(svg(tree).props.ast).props.animatedProps.matrix).not.toEqual([1, 0, 0, 1, 0, 0]);
  const cancellations = h.cancel.mock.calls.length;
  h.emitReduced(true);
  tree = h.render();
  expect(enabled(tree)).toBe(false);
  expect(h.cancel.mock.calls.length).toBeGreaterThan(cancellations);
  expect(h.progress.get()).toBe(0);
  expect(h.part(svg(tree).props.ast).props.animatedProps).toEqual({
    matrix: [1, 0, 0, 1, 0, 0],
    opacity: 1,
  });
  h.emitReduced(false);
  expect(enabled(h.render())).toBe(true);
  expect(h.timing).toHaveBeenCalledTimes(2);
  expect(h.repeat).toHaveBeenCalledTimes(2);
  h.unmount();
});
