// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { Activity, act, createContext, createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import ts from "typescript";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { useListActivity } from "../listActivity";

// Real React/Activity lifecycle with test-only hosts; native motion/frame timing uses the device.
type Host = HTMLDivElement & { textContent: string | null; remove(): void };
const document = (
  globalThis as unknown as {
    document: { createElement(tag: "div"): Host; body: { append(host: Host): void } };
  }
).document;
let root: Root, host: Host;
const source = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/common/ui/AnimatedDetailArtwork.tsx",
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

type Listener = (value?: unknown) => void;
function harness(realLease = false) {
  const handlers = new Map<string, Set<Listener>>();
  const remove = vi.fn();
  const subscribe = (name: string, listener: Listener) => {
    const set = handlers.get(name) ?? new Set<Listener>();
    handlers.set(name, set);
    set.add(listener);
    return () => {
      set.delete(listener);
      remove(name);
    };
  };
  const started = vi.fn(),
    stopped = vi.fn(),
    reset = vi.fn(),
    cancel = vi.fn();
  class Value {
    stopAnimation = cancel;
    setValue = reset;
  }
  const timing = vi.fn((_value: unknown, options: unknown) => ({ options }));
  let simultaneous = 0,
    maximum = 0;
  const loop = vi.fn((_animation: unknown, options: unknown) => {
    let running = false;
    return {
      options,
      start: () => {
        if (!running) {
          running = true;
          simultaneous++;
          maximum = Math.max(maximum, simultaneous);
        }
        started();
      },
      stop: () => {
        if (running) {
          running = false;
          simultaneous--;
        }
        stopped();
      },
    };
  });
  let resolvePreference!: (value: boolean) => void;
  let rejectPreference!: (error: Error) => void;
  const read = vi.fn(
    () =>
      new Promise<boolean>((resolve, reject) => {
        resolvePreference = resolve;
        rejectPreference = reject;
      }),
  );
  const app = {
    currentState: "active",
    addEventListener: (name: string, callback: Listener) => ({ remove: subscribe(name, callback) }),
  };
  let focused = true,
    active = true;
  const navigation = { isFocused: () => focused, addListener: subscribe };
  const isActive = () => active;
  const context = createContext<typeof navigation | null>(navigation);
  let layout:
    | ((event: { nativeEvent: { layout: { width: number; height: number } } }) => void)
    | undefined;
  const layouts = new Set<NonNullable<typeof layout>>();
  const enabled: boolean[] = [];
  const parser = vi.fn((_svg: string, middleware: (root: unknown) => unknown) =>
    middleware({ children: [] }),
  );
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "expo-router/react-navigation": { NavigationContext: context },
    "react-native": {
      View: ({ children, onLayout }: { children: ReactNode; onLayout?: typeof layout }) => {
        if (onLayout) {
          layout = onLayout;
          layouts.add(onLayout);
        }
        return createElement("div", null, children);
      },
      Animated: { Value, timing, loop },
      Easing: { linear: (value: number) => value },
      AccessibilityInfo: {
        isReduceMotionEnabled: read,
        addEventListener: (name: string, callback: Listener) => ({
          remove: subscribe(name, callback),
        }),
      },
      AppState: app,
    },
    "react-native-svg": { parse: parser },
    "@/lib/listActivity": { useListActivity: realLease ? useListActivity : () => isActive },
    "@/lib/resourceArtworkMotion": { ARTWORK_CYCLE_MS: 4800 },
    "@/lib/resourceArtworkLayers": { resourceArtworkLayers: () => [{ key: "plane" }] },
    "./DicebearArtworkLayer": {
      DicebearArtworkLayer: (props: { enabled: boolean }) => {
        enabled.push(props.enabled);
        return createElement("span", null, "native planes");
      },
    },
  };
  const output = {} as {
    AnimatedDetailArtwork(props: { artwork: unknown; children?: ReactNode }): ReactNode;
  };
  runInNewContext(compiled, {
    exports: output,
    require: (name: string) => {
      if (!(name in modules)) throw Error(`Unexpected detail animation dependency ${name}`);
      return modules[name];
    },
  });
  const artwork = { svg: "canonical static drawing", options: {} };
  const render = async (visible = true, withNavigation = true) => {
    active = visible;
    await act(async () =>
      root.render(
        <context.Provider value={withNavigation ? navigation : null}>
          <Activity mode={visible ? "visible" : "hidden"}>
            <output.AnimatedDetailArtwork artwork={artwork}>
              <span>complete static drawing</span>
            </output.AnimatedDetailArtwork>
          </Activity>
        </context.Provider>,
      ),
    );
  };
  const measure = async (width = 300, height = 224) => {
    if (!layout) throw Error("Missing native layout callback");
    await act(async () => layout?.({ nativeEvent: { layout: { width, height } } }));
  };
  const event = async (name: string, value?: unknown) => {
    if (name === "change") app.currentState = String(value);
    if (name === "blur") focused = false;
    if (name === "focus") focused = true;
    await act(async () => {
      for (const callback of handlers.get(name) ?? []) callback(value);
    });
  };
  return {
    render,
    measure,
    event,
    started,
    stopped,
    timing,
    loop,
    reset,
    remove,
    parser,
    enabled,
    resolve: async (value: boolean) => {
      await act(async () => resolvePreference(value));
    },
    reject: async () => {
      await act(async () => rejectPreference(Error("Preference unavailable")));
    },
    lateLayout: () => layout,
    clocks: () => ({ simultaneous, maximum }),
    renderPanels: async (selected: "members" | "events", shown = true) => {
      await act(async () =>
        root.render(
          <context.Provider value={navigation}>
            <Activity mode={shown ? "visible" : "hidden"}>
              {(["members", "events"] as const).map((tab) => (
                <RetainedTabPanel key={tab} active={selected === tab}>
                  <output.AnimatedDetailArtwork artwork={artwork}>
                    <span>complete static drawing</span>
                  </output.AnimatedDetailArtwork>
                </RetainedTabPanel>
              ))}
            </Activity>
          </context.Provider>,
        ),
      );
    },
    measureAll: async () => {
      await act(async () => {
        for (const callback of layouts)
          callback({ nativeEvent: { layout: { width: 300, height: 224 } } });
      });
    },
  };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("keeps the complete SVG until preference and positive layout allow one noninteractive native clock", async () => {
  const h = harness();
  await h.render();
  expect(host.textContent).toBe("complete static drawing");
  await h.resolve(false);
  await h.measure(0, 0);
  expect(h.started).not.toHaveBeenCalled();
  expect(h.parser).not.toHaveBeenCalled();
  await h.measure();
  expect(host.textContent).toBe("native planes");
  expect(h.parser).toHaveBeenCalledOnce();
  expect(h.started).toHaveBeenCalledOnce();
  expect(h.timing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      duration: 4800,
      useNativeDriver: true,
      isInteraction: false,
    }),
  );
  await h.measure();
  await h.measure(-1, 224);
  expect(h.parser).toHaveBeenCalledOnce();
  expect(h.started).toHaveBeenCalledOnce();
});

it("stops on live reduced motion, blur and background and reconnects only when permitted", async () => {
  const h = harness();
  await h.render();
  await h.measure();
  await h.resolve(false);
  expect(h.started).toHaveBeenCalledOnce();
  await h.event("reduceMotionChanged", true);
  expect(h.stopped).toHaveBeenCalled();
  expect(h.enabled.at(-1)).toBe(false);
  expect(h.reset).toHaveBeenLastCalledWith(0);
  await h.event("reduceMotionChanged", false);
  expect(h.started).toHaveBeenCalledTimes(2);
  await h.event("blur");
  expect(h.enabled.at(-1)).toBe(false);
  await h.event("focus");
  expect(h.started).toHaveBeenCalledTimes(3);
  await h.event("change", "background");
  expect(h.enabled.at(-1)).toBe(false);
  await h.event("change", "active");
  expect(h.started).toHaveBeenCalledTimes(4);
  expect(h.parser).toHaveBeenCalledOnce();
});

it("disconnects hidden Activity, rejects hidden layout and rechecks preference before restarting", async () => {
  const h = harness();
  await h.render();
  await h.measure();
  await h.resolve(false);
  const late = h.lateLayout();
  await h.render(false);
  const starts = h.started.mock.calls.length;
  expect(h.remove).toHaveBeenCalledWith("reduceMotionChanged");
  await act(async () => late?.({ nativeEvent: { layout: { width: 1, height: 1 } } }));
  await h.render(true);
  expect(h.started).toHaveBeenCalledTimes(starts);
  await h.resolve(true);
  expect(h.started).toHaveBeenCalledTimes(starts);
  await h.event("reduceMotionChanged", false);
  expect(h.started).toHaveBeenCalledTimes(starts + 1);
});

it("never starts outside a navigation route", async () => {
  const h = harness();
  await h.render(true, false);
  await h.measure();
  await h.resolve(false);
  expect(h.started).not.toHaveBeenCalled();
});
it("fails closed when the system preference read rejects", async () => {
  const h = harness();
  await h.render();
  await h.measure();
  await h.reject();
  expect(h.started).not.toHaveBeenCalled();
  expect(host.textContent).toBe("complete static drawing");
});
it("ignores a delayed read after a newer reduced-motion event or unmount", async () => {
  const h = harness();
  await h.render();
  await h.measure();
  await h.event("reduceMotionChanged", true);
  await h.resolve(false);
  expect(h.started).not.toHaveBeenCalled();
  await h.render(false);
  await h.resolve(false);
  expect(h.started).not.toHaveBeenCalled();
});

it("runs at most one header clock across two real retained panels and parent hide/reentry", async () => {
  const h = harness(true);
  await h.renderPanels("members");
  await h.resolve(false);
  await h.measureAll();
  expect(h.clocks()).toEqual({ simultaneous: 1, maximum: 1 });
  await h.renderPanels("events");
  expect(h.clocks().simultaneous).toBe(0);
  await h.resolve(false);
  await h.measureAll();
  expect(h.clocks()).toEqual({ simultaneous: 1, maximum: 1 });
  await h.renderPanels("events", false);
  await h.measureAll();
  expect(h.clocks().simultaneous).toBe(0);
  await h.renderPanels("events");
  expect(h.clocks().simultaneous).toBe(0);
  await h.resolve(false);
  expect(h.clocks()).toEqual({ simultaneous: 1, maximum: 1 });
  await h.renderPanels("members");
  await h.resolve(false);
  expect(h.clocks()).toEqual({ simultaneous: 1, maximum: 1 });
});
