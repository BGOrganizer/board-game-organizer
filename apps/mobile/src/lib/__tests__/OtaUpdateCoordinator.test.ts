import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { createUpdateController, isRestartSafeNavigation, type UpdatePhase } from "../otaUpdates";

// Actual component callbacks/JSX with host hooks, not native rendering evidence.
function harness() {
  const hooks: { current?: unknown; value?: unknown; deps?: unknown[]; cleanup?: () => void }[] =
    [];
  let cursor = 0;
  const effects: (() => void)[] = [];
  const listeners: Record<string, (state?: string) => void> = {};
  const remove = vi.fn();
  let ports!: Parameters<typeof createUpdateController>[0];
  let controller!: ReturnType<typeof createUpdateController>;
  const state = {
    navigation: {
      routes: [
        {
          name: "__root",
          state: { routes: [{ name: "(tabs)", state: { routes: [{ name: "events" }] } }] },
        },
      ],
    } as Parameters<typeof isRestartSafeNavigation>[0],
    navigationReady: true,
    blocks: 0,
    pendingUser: null as object | null,
    pendingGame: null as object | null,
    pendingLocation: null as object | null,
    mutations: 0,
  };
  const native = {
    AppState: {
      currentState: "active",
      addEventListener: (_: string, fn: (s?: string) => void) => {
        listeners.app = fn;
        return { remove };
      },
    },
    Keyboard: {
      isVisible: vi.fn(() => false),
      addListener: (name: string, fn: () => void) => {
        listeners[name] = fn;
        return { remove };
      },
    },
  };
  const updates = {
    isEnabled: true,
    checkAutomatically: "NEVER",
    UpdatesCheckAutomaticallyValue: { NEVER: "NEVER" },
    checkForUpdateAsync: vi.fn(async () => ({ isAvailable: true, isRollBackToEmbedded: false })),
    fetchUpdateAsync: vi.fn(async () => ({ isNew: true, isRollBackToEmbedded: false })),
    reloadAsync: vi.fn(async () => {}),
  };
  const queryClient = { isMutating: () => state.mutations };
  const navigationRef = {
    isReady: () => state.navigationReady,
    getRootState: () => state.navigation,
    addListener: (name: string, listener: () => void) => {
      const key = `navigation-${name}`;
      listeners[key] = listener;
      return () => {
        delete listeners[key];
        remove();
      };
    },
  };
  const captureException = vi.fn();
  const selector = Object.assign((fn: (s: typeof state) => unknown) => fn(state), {
    getState: () => state,
  });
  const modules: Record<string, unknown> = {
    "@board-game-organizer/store": { useAppStore: selector },
    "@sentry/react-native": { captureException },
    "@tanstack/react-query": {
      useIsMutating: () => state.mutations,
      useQueryClient: () => queryClient,
    },
    "expo-router": { useNavigationContainerRef: () => navigationRef },
    "expo-updates": updates,
    "react-native": native,
    "@/components/common/ui/ConfirmDialog": { ConfirmDialog: "Dialog" },
    "@/lib/appRestartGuard": { useAppRestartGuard: selector },
    "@/lib/i18n": { useT: () => (text: string) => text },
    "@/lib/otaUpdates": {
      isRestartSafeNavigation,
      createUpdateController: (p: typeof ports) => {
        ports = p;
        controller = createUpdateController(p);
        return controller;
      },
    },
    react: {
      useState: (initial: unknown) => {
        const i = cursor++;
        hooks[i] ??= { value: typeof initial === "function" ? initial() : initial };
        return [
          hooks[i].value,
          (value: unknown) => {
            hooks[i].value = value;
          },
        ];
      },
      useRef: (initial: unknown) => {
        const i = cursor++;
        hooks[i] ??= { current: initial };
        return hooks[i];
      },
      useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
        const i = cursor++;
        const previous = hooks[i];
        if (!previous || deps.some((value, index) => value !== previous.deps?.[index])) {
          effects.push(() => {
            previous?.cleanup?.();
            hooks[i] = { deps, cleanup: effect() };
          });
        }
      },
    },
    "react/jsx-runtime": {
      jsx: (type: string, props: Record<string, unknown>) => ({ type, props }),
    },
  };
  const exports: Record<
    string,
    (props: { startupSettled: boolean }) => { props: Record<string, unknown> } | null
  > = {};
  const context = {
    exports,
    __DEV__: false,
    Boolean,
    require: (id: string) => {
      if (!(id in modules)) throw Error(id);
      return modules[id];
    },
  };
  const source = readFileSync(
    new URL("../../components/common/startup/OtaUpdateCoordinator.tsx", import.meta.url),
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
    context,
  );
  const render = (startupSettled = true) => {
    cursor = 0;
    const tree = exports.OtaUpdateCoordinator({ startupSettled });
    while (effects.length) effects.shift()?.();
    return tree;
  };
  return {
    render,
    state,
    native,
    updates,
    listeners,
    context,
    captureException,
    remove,
    ports: () => ports,
    controller: () => controller,
    phase: (value: UpdatePhase) => ports.change(value),
    unmount: () => {
      for (const hook of hooks) hook.cleanup?.();
    },
  };
}

it("shows both localized HeroUI choices, defers until process restart and checks without a download", async () => {
  const h = harness();
  expect(h.render()).toBeNull();
  await vi.waitFor(() => expect(h.render()?.props.title).toBe("An update is available"));
  const props = h.render()?.props;
  expect(props).toMatchObject({
    title: "An update is available",
    busy: false,
    blocksAppRestart: false,
    cancelLabel: "Later",
  });
  const actions = props?.actions as { label: string; variant: string; onPress: () => void }[];
  expect(actions.map(({ label, variant }) => [label, variant])).toEqual([
    ["Later", "ghost"],
    ["Update and restart", "primary"],
  ]);
  expect(h.updates.fetchUpdateAsync).not.toHaveBeenCalled();
  actions[0].onPress();
  expect(h.render()).toBeNull();
  h.native.AppState.currentState = "background";
  h.listeners.app("background");
  h.render();
  h.native.AppState.currentState = "active";
  h.listeners.app("active");
  h.render();
  await h.controller().check();
  expect(h.render()).toBeNull();
  expect(h.updates.checkForUpdateAsync).toHaveBeenCalledOnce();
  h.unmount();
  expect(h.remove).toHaveBeenCalledTimes(5);
});

it("checks after the SDK root becomes ready and reacts to child navigation without losing live restart guards", async () => {
  const h = harness();
  const home = h.state.navigation;
  h.state.navigationReady = false;
  h.state.navigation = undefined;
  expect(h.render()).toBeNull();
  expect(h.updates.checkForUpdateAsync).not.toHaveBeenCalled();
  h.state.navigation = {
    routes: [{ name: "__root", state: { routes: [{ name: "event/wizard" }] } }],
  };
  h.state.navigationReady = true;
  h.listeners["navigation-ready"]();
  expect(h.render()).toBeNull();
  expect(h.updates.checkForUpdateAsync).not.toHaveBeenCalled();
  h.state.navigation = home;
  h.listeners["navigation-state"]();
  h.render();
  await vi.waitFor(() => expect(h.render()?.props.title).toBe("An update is available"));
  h.state.navigation = {
    routes: [{ name: "__root", state: { routes: [{ name: "index" }, { name: "event/wizard" }] } }],
  };
  expect(h.ports().canRestart()).toBe(false);
  h.listeners["navigation-state"]();
  expect(h.render()).toBeNull();
  h.unmount();
  expect(h.listeners["navigation-state"]).toBeUndefined();
  expect(h.listeners["navigation-ready"]).toBeUndefined();
});

it.each([
  ["downloading", "Downloading the update…", true],
  ["restarting", "Restarting the app…", true],
  ["download-error", "The update could not be downloaded. Try again or choose Later.", false],
  ["restart-error", "The app could not restart. Try again or choose Later.", false],
  ["ready", "The update is downloaded. Restart when you are ready.", false],
] as const)("renders %s with observable recovery and busy state", (phase, description, busy) => {
  const h = harness();
  h.render();
  h.phase(phase);
  expect(h.render()?.props).toMatchObject({ description, busy });
  h.unmount();
});

it("adapts update, rollback, reload and error reporting without changing Sentry privacy", async () => {
  const h = harness();
  h.render();
  for (const rollback of [true, false]) {
    h.updates.checkForUpdateAsync.mockResolvedValue({
      isAvailable: false,
      isRollBackToEmbedded: rollback,
    });
    h.updates.fetchUpdateAsync.mockResolvedValue({ isNew: false, isRollBackToEmbedded: rollback });
    expect(await h.ports().check()).toBe(rollback);
    expect(await h.ports().download()).toBe(rollback);
  }
  await h.ports().reload();
  expect(h.updates.reloadAsync).toHaveBeenCalledOnce();
  const error = Error("offline");
  h.ports().report(error);
  expect(h.captureException).toHaveBeenCalledWith(error, { tags: { operation: "updates.manual" } });
  h.phase("available");
  const actions = h.render()?.props.actions as { onPress: () => void }[];
  const accept = vi.spyOn(h.controller(), "accept");
  actions[1].onPress();
  expect(accept).toHaveBeenCalledOnce();
  const defer = vi.spyOn(h.controller(), "defer");
  const onCancel = h.render()?.props.onCancel as () => void;
  onCancel();
  expect(defer).toHaveBeenCalledOnce();
  h.unmount();
});

it("rechecks every restart safeguard and hides while forms, keyboard or startup are active", () => {
  const h = harness();
  h.render();
  h.phase("available");
  expect(h.ports().canRestart()).toBe(true);
  for (const key of ["blocks", "mutations"] as const) {
    h.state[key] = 1;
    expect(h.render()).toBeNull();
    expect(h.ports().canRestart()).toBe(false);
    h.state[key] = 0;
  }
  for (const key of ["pendingUser", "pendingGame", "pendingLocation"] as const) {
    h.state[key] = {};
    expect(h.render()).toBeNull();
    expect(h.ports().canRestart()).toBe(false);
    h.state[key] = null;
  }
  expect(h.render(false)).toBeNull();
  expect(h.ports().canRestart()).toBe(false);
  h.render();
  h.listeners.keyboardDidShow();
  h.native.Keyboard.isVisible.mockReturnValue(true);
  expect(h.render()).toBeNull();
  expect(h.ports().canRestart()).toBe(false);
  h.native.Keyboard.isVisible.mockReturnValue(false);
  h.listeners.keyboardDidHide();
  expect(h.render()).not.toBeNull();
  h.native.AppState.currentState = "background";
  h.listeners.app("background");
  expect(h.render()).toBeNull();
  expect(h.ports().canRestart()).toBe(false);
  h.native.AppState.currentState = "active";
  h.listeners.app("active");
  h.state.navigation = { routes: [{ name: "event/wizard", state: { routes: [] } }] };
  h.listeners["navigation-state"]();
  expect(h.render()).toBeNull();
  expect(h.ports().canRestart()).toBe(false);
  h.unmount();
});

it.each(["dev", "disabled", "ON_LOAD"])("does not offer false consent on %s runtimes", (mode) => {
  const h = harness();
  if (mode === "dev") h.context.__DEV__ = true;
  if (mode === "disabled") h.updates.isEnabled = false;
  if (mode === "ON_LOAD") h.updates.checkAutomatically = "ON_LOAD";
  expect(h.render()).toBeNull();
  expect(h.ports().canRestart()).toBe(false);
  expect(h.updates.checkForUpdateAsync).not.toHaveBeenCalled();
  h.unmount();
});
