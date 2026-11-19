import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus, Keyboard } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { blockAppRestart, useAppRestartGuard } from "@/lib/appRestartGuard";
import type { isRestartSafeNavigation } from "@/lib/otaUpdates";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { OtaUpdateCoordinator } from "../OtaUpdateCoordinator";

const boundary = vi.hoisted(() => ({
  enabled: true,
  automatic: "NEVER",
  ready: true,
  keyboard: false,
  navigation: undefined as Parameters<typeof isRestartSafeNavigation>[0],
  check: vi.fn(),
  download: vi.fn(),
  reload: vi.fn(),
  report: vi.fn(),
}));
const navigationListeners = new Map<string, Set<() => void>>();
const appListeners = new Set<(state: AppStateStatus) => void>();
const keyboardListeners = new Map<string, Set<() => void>>();
const navigation = {
  isReady: () => boundary.ready,
  getRootState: () => boundary.navigation,
  addListener: (name: string, callback: () => void) => {
    const listeners = navigationListeners.get(name) ?? new Set();
    navigationListeners.set(name, listeners);
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};
vi.mock("expo-router", () => ({ useNavigationContainerRef: () => navigation }));
vi.mock("expo-updates", () => ({
  get isEnabled() {
    return boundary.enabled;
  },
  get checkAutomatically() {
    return boundary.automatic;
  },
  UpdatesCheckAutomaticallyValue: { NEVER: "NEVER" },
  checkForUpdateAsync: boundary.check,
  fetchUpdateAsync: boundary.download,
  reloadAsync: boundary.reload,
}));
vi.mock("@sentry/react-native", () => ({ captureException: boundary.report }));

const originalStore = useAppStore.getState();
const originalGuard = useAppRestartGuard.getState();
const originalAppState = Object.getOwnPropertyDescriptor(AppState, "currentState");
let client: QueryClient;
const safeNavigation = (): Parameters<typeof isRestartSafeNavigation>[0] => ({
  routes: [
    {
      name: "__root",
      state: { routes: [{ name: "(tabs)", state: { routes: [{ name: "groups" }] } }] },
    },
  ],
});
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function Fixture({ settled = true, locale = "en" }: { settled?: boolean; locale?: "en" | "it" }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders locale={locale}>
        <OtaUpdateCoordinator startupSettled={settled} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function appState(state: AppStateStatus) {
  await act(() => {
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      writable: true,
      value: state,
    });
    for (const listener of appListeners) listener(state);
  });
}
async function keyboard(visible: boolean) {
  await act(() => {
    boundary.keyboard = visible;
    for (const listener of keyboardListeners.get(visible ? "keyboardDidShow" : "keyboardDidHide") ??
      [])
      listener();
  });
}
async function navigationChanged() {
  await act(() => {
    for (const listener of navigationListeners.get("state") ?? []) listener();
  });
}
const offer = () => screen.findByText("An update is available");

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  boundary.enabled = true;
  boundary.automatic = "NEVER";
  boundary.ready = true;
  boundary.keyboard = false;
  boundary.navigation = safeNavigation();
  boundary.check.mockReset().mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false });
  boundary.download.mockReset().mockResolvedValue({ isNew: true, isRollBackToEmbedded: false });
  boundary.reload.mockReset().mockResolvedValue(undefined);
  boundary.report.mockReset();
  navigationListeners.clear();
  appListeners.clear();
  keyboardListeners.clear();
  useAppStore.setState(originalStore, true);
  useAppStore.getState().clearPending();
  useAppRestartGuard.setState({ blocks: 0 });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    writable: true,
    value: "active",
  });
  vi.spyOn(AppState, "addEventListener").mockImplementation((_name, callback) => {
    appListeners.add(callback);
    return { remove: () => appListeners.delete(callback) };
  });
  vi.spyOn(Keyboard, "isVisible").mockImplementation(() => boundary.keyboard);
  const subscribeKeyboard = Keyboard.addListener.bind(Keyboard);
  vi.spyOn(Keyboard, "addListener").mockImplementation((name, callback) => {
    const listeners = keyboardListeners.get(name) ?? new Set();
    const invoke = () =>
      callback({
        duration: 0,
        easing: "keyboard",
        endCoordinates: { screenX: 0, screenY: 844, width: 390, height: 0 },
      });
    keyboardListeners.set(name, listeners);
    listeners.add(invoke);
    const subscription = subscribeKeyboard(name, callback);
    const remove = subscription.remove.bind(subscription);
    subscription.remove = () => {
      listeners.delete(invoke);
      remove();
    };
    return subscription;
  });
});
afterEach(async () => {
  await act(() => {
    client.clear();
    useAppStore.setState(originalStore, true);
    useAppRestartGuard.setState(originalGuard, true);
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalAppState) Object.defineProperty(AppState, "currentState", originalAppState);
});

it("renders actual consent, postpones for the whole JS session and cleans native listeners", async () => {
  const view = await render(<Fixture />);
  expect(await offer()).toBeVisible();
  expect(boundary.check).toHaveBeenCalledOnce();
  expect(boundary.download).not.toHaveBeenCalled();
  expect(boundary.reload).not.toHaveBeenCalled();
  expect(useAppRestartGuard.getState().blocks).toBe(0);
  await fireEvent.press(screen.getByTestId("ota-update-later"));
  expect(screen.queryByText("An update is available")).toBeNull();
  await appState("background");
  await appState("active");
  await navigationChanged();
  expect(boundary.check).toHaveBeenCalledOnce();
  expect(screen.queryByText("An update is available")).toBeNull();
  await view.unmount();
  expect(appListeners.size).toBe(0);
  for (const listeners of [...navigationListeners.values(), ...keyboardListeners.values()])
    expect(listeners.size).toBe(0);
  await render(<Fixture />);
  expect(await offer()).toBeVisible();
  expect(boundary.check).toHaveBeenCalledTimes(2);
});

it("downloads only after explicit acceptance and disables every decision until restart", async () => {
  const download = pending<{ isNew: boolean }>();
  boundary.download.mockReturnValueOnce(download.promise);
  await render(<Fixture />);
  await offer();
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  expect(screen.getByText("Downloading the update…")).toBeVisible();
  for (const id of ["ota-update-accept", "ota-update-later", "ota-update-close"]) {
    expect(screen.getByTestId(id)).toBeDisabled();
    await fireEvent.press(screen.getByTestId(id));
  }
  expect(boundary.download).toHaveBeenCalledOnce();
  expect(boundary.reload).not.toHaveBeenCalled();
  await act(() => download.resolve({ isNew: true }));
  expect(screen.getByText("Restarting the app…")).toBeVisible();
  expect(boundary.reload).toHaveBeenCalledOnce();
});

it.each([
  "startup",
  "navigation",
  "keyboard",
  "background",
  "editor",
  "user-selection",
  "game-selection",
  "location-selection",
  "mutation",
] as const)(
  "waits for the real %s safeguard before checking and showing consent",
  async (guard) => {
    let release = () => {};
    const mutation = pending<void>();
    let mutationTask: Promise<unknown> | undefined;
    if (guard === "navigation") boundary.ready = false;
    if (guard === "keyboard") boundary.keyboard = true;
    if (guard === "background")
      Object.defineProperty(AppState, "currentState", {
        configurable: true,
        writable: true,
        value: "background",
      });
    if (guard === "editor") release = blockAppRestart();
    if (guard === "user-selection")
      useAppStore.getState().setPendingUser("picker", {
        id: "fixture-user",
        name: "Fixture user",
        email: null,
        avatarUrl: null,
      });
    if (guard === "game-selection")
      useAppStore
        .getState()
        .setPendingGame("picker", { id: 1, name: "Chess", imageUrl: null, year: null });
    if (guard === "location-selection")
      useAppStore.getState().setPendingLocation("picker", {
        id: "fixture-location",
        name: "Games venue",
        address: "Fixture address",
        longitude: 12.5,
        latitude: 41.9,
      });
    if (guard === "mutation")
      mutationTask = client
        .getMutationCache()
        .build(client, { mutationFn: () => mutation.promise })
        .execute(undefined);
    const view = await render(<Fixture settled={guard !== "startup"} />);
    expect(boundary.check).not.toHaveBeenCalled();
    expect(screen.queryByText("An update is available")).toBeNull();
    if (guard === "startup") await view.rerender(<Fixture />);
    if (guard === "navigation") {
      boundary.ready = true;
      await navigationChanged();
    }
    if (guard === "keyboard") await keyboard(false);
    if (guard === "background") await appState("active");
    if (guard === "editor") await act(release);
    if (guard.endsWith("selection")) await act(() => useAppStore.getState().clearPending());
    if (guard === "mutation")
      await act(async () => {
        mutation.resolve();
        await mutationTask;
      });
    expect(await offer()).toBeVisible();
    expect(boundary.check).toHaveBeenCalledOnce();
  },
);

it("tracks navigation readiness and blocks editors anywhere in the live root stack", async () => {
  boundary.ready = false;
  boundary.navigation = { routes: [{ name: "event/wizard" }] };
  await render(<Fixture />);
  expect(boundary.check).not.toHaveBeenCalled();
  await act(() => {
    boundary.ready = true;
    for (const listener of navigationListeners.get("ready") ?? []) listener();
  });
  expect(boundary.check).not.toHaveBeenCalled();
  boundary.navigation = safeNavigation();
  await navigationChanged();
  expect(await offer()).toBeVisible();
  boundary.navigation = {
    routes: [{ name: "event/wizard" }, { name: "(tabs)", state: { routes: [{ name: "groups" }] } }],
  };
  await navigationChanged();
  expect(screen.queryByText("An update is available")).toBeNull();
  expect(boundary.download).not.toHaveBeenCalled();
});

it("rechecks live guards after download and restarts the already-downloaded update later", async () => {
  const download = pending<{ isNew: boolean }>();
  boundary.download.mockReturnValueOnce(download.promise);
  await render(<Fixture />);
  await offer();
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  let release = () => {};
  await act(() => {
    release = blockAppRestart();
  });
  expect(screen.queryByText("An update is available")).toBeNull();
  await act(() => download.resolve({ isNew: true }));
  expect(boundary.reload).not.toHaveBeenCalled();
  await act(release);
  expect(screen.getByText("The update is downloaded. Restart when you are ready.")).toBeVisible();
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  expect(boundary.download).toHaveBeenCalledOnce();
  expect(boundary.reload).toHaveBeenCalledOnce();
});

it("keeps recoverable download/restart failures visible and reuses a successful download", async () => {
  const downloadFailure = Error("download unavailable");
  const reloadFailure = Error("native reload unavailable");
  boundary.download.mockRejectedValueOnce(downloadFailure);
  boundary.reload.mockRejectedValueOnce(reloadFailure);
  await render(<Fixture />);
  await offer();
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  expect(
    await screen.findByText("The update could not be downloaded. Try again or choose Later."),
  ).toBeVisible();
  expect(screen.getByTestId("ota-update-accept")).toBeEnabled();
  expect(boundary.report).toHaveBeenCalledWith(downloadFailure, {
    tags: { operation: "updates.manual" },
  });
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  expect(
    await screen.findByText("The app could not restart. Try again or choose Later."),
  ).toBeVisible();
  expect(boundary.report).toHaveBeenCalledWith(reloadFailure, {
    tags: { operation: "updates.manual" },
  });
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  expect(boundary.download).toHaveBeenCalledTimes(2);
  expect(boundary.reload).toHaveBeenCalledTimes(2);
});

it("handles rollback availability and a false download receipt without inventing a restart", async () => {
  boundary.check.mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: true });
  boundary.download.mockResolvedValueOnce({ isNew: false, isRollBackToEmbedded: false });
  await render(<Fixture />);
  await offer();
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  expect(
    await screen.findByText("The update could not be downloaded. Try again or choose Later."),
  ).toBeVisible();
  expect(boundary.reload).not.toHaveBeenCalled();
  boundary.download.mockResolvedValueOnce({ isNew: false, isRollBackToEmbedded: true });
  await fireEvent.press(screen.getByTestId("ota-update-accept"));
  expect(boundary.reload).toHaveBeenCalledOnce();
});

it.each(["none", "error"] as const)(
  "retries an initial %s result only on a later foreground",
  async (outcome) => {
    const error = Error("update endpoint offline");
    if (outcome === "none") boundary.check.mockResolvedValueOnce({ isAvailable: false });
    else boundary.check.mockRejectedValueOnce(error);
    await render(<Fixture />);
    await waitFor(() => expect(boundary.check).toHaveBeenCalledOnce());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("An update is available")).toBeNull();
    if (outcome === "error")
      expect(boundary.report).toHaveBeenCalledWith(error, {
        tags: { operation: "updates.manual" },
      });
    await navigationChanged();
    expect(boundary.check).toHaveBeenCalledOnce();
    await appState("background");
    await appState("active");
    expect(await offer()).toBeVisible();
    expect(boundary.check).toHaveBeenCalledTimes(2);
  },
);

it.each(["development", "disabled", "automatic"] as const)(
  "does not check or offer a manual update in %s runtime",
  async (mode) => {
    if (mode === "development") vi.stubGlobal("__DEV__", true);
    if (mode === "disabled") boundary.enabled = false;
    if (mode === "automatic") boundary.automatic = "ON_LOAD";
    await render(<Fixture />);
    expect(boundary.check).not.toHaveBeenCalled();
    expect(screen.queryByText("An update is available")).toBeNull();
  },
);

it.each(["check", "download"] as const)(
  "disposes a pending %s without late dialogs or restarts",
  async (phase) => {
    const operation = pending<{ isAvailable: boolean; isNew: boolean }>();
    if (phase === "check") boundary.check.mockReturnValueOnce(operation.promise);
    else boundary.download.mockReturnValueOnce(operation.promise);
    const view = await render(<Fixture />);
    if (phase === "download") {
      await offer();
      await fireEvent.press(screen.getByTestId("ota-update-accept"));
    }
    await view.unmount();
    await act(() => operation.resolve({ isAvailable: true, isNew: true }));
    expect(boundary.reload).not.toHaveBeenCalled();
    expect(boundary.report).not.toHaveBeenCalled();
    expect(appListeners.size).toBe(0);
    for (const listeners of [...navigationListeners.values(), ...keyboardListeners.values()])
      expect(listeners.size).toBe(0);
  },
);

it.each(["en", "it"] as const)(
  "renders the actual %s update consent and both explicit choices without downloading on display or native close",
  async (locale) => {
    await render(<Fixture locale={locale} />);
    const title = locale === "it" ? "È disponibile un aggiornamento" : "An update is available";
    const later = locale === "it" ? "Più tardi" : "Later";
    const accept = locale === "it" ? "Aggiorna e riavvia" : "Update and restart";
    const description =
      locale === "it"
        ? "Aggiorna ora o scegli Più tardi per visualizzare l’avviso al prossimo avvio dell’app."
        : "Update now, or choose Later to be reminded the next time you start the app.";
    expect(await screen.findByText(title)).toBeVisible();
    expect(screen.getByText(description)).toBeVisible();
    expect(screen.getByTestId("ota-update-accept")).toHaveTextContent(accept);
    expect(screen.getByTestId("ota-update-accept")).toBeEnabled();
    expect(screen.getByTestId("ota-update-later")).toHaveTextContent(later);
    expect(screen.getByTestId("ota-update-later")).toBeEnabled();
    expect(screen.getByTestId("ota-update-close")).toHaveAccessibleName(later);
    expect(boundary.download).not.toHaveBeenCalled();
    expect(boundary.reload).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("ota-update-close"));
    expect(screen.queryByText(title)).toBeNull();
    await appState("background");
    await appState("active");
    await navigationChanged();
    expect(screen.queryByText(title)).toBeNull();
    expect(boundary.check).toHaveBeenCalledOnce();
    expect(boundary.download).not.toHaveBeenCalled();
    expect(boundary.reload).not.toHaveBeenCalled();
  },
);

it.each([
  "startup",
  "navigation-ready",
  "navigation-route",
  "keyboard",
  "background",
  "user-selection",
  "game-selection",
  "location-selection",
  "mutation",
] as const)(
  "rechecks a newly acquired %s guard after download and requires fresh explicit restart consent after it clears",
  async (guard) => {
    const download = pending<{ isNew: boolean }>();
    const mutation = pending<void>();
    let mutationTask: Promise<unknown> | undefined;
    boundary.download.mockReturnValueOnce(download.promise);
    const view = await render(<Fixture />);
    await offer();
    await fireEvent.press(screen.getByTestId("ota-update-accept"));
    expect(screen.getByText("Downloading the update…")).toBeVisible();
    if (guard === "startup") await view.rerender(<Fixture settled={false} />);
    if (guard === "navigation-ready") {
      boundary.ready = false;
      await navigationChanged();
    }
    if (guard === "navigation-route") {
      boundary.navigation = { routes: [{ name: "event/wizard" }] };
      await navigationChanged();
    }
    if (guard === "keyboard") await keyboard(true);
    if (guard === "background") await appState("background");
    if (guard === "user-selection")
      await act(() =>
        useAppStore.getState().setPendingUser("picker", {
          id: "pending-user",
          name: "Pending user",
          email: null,
          avatarUrl: null,
        }),
      );
    if (guard === "game-selection")
      await act(() =>
        useAppStore
          .getState()
          .setPendingGame("picker", { id: 1, name: "Chess", imageUrl: null, year: null }),
      );
    if (guard === "location-selection")
      await act(() =>
        useAppStore.getState().setPendingLocation("picker", {
          id: "pending-location",
          name: "Games venue",
          address: "Fixture address",
          longitude: 12.5,
          latitude: 41.9,
        }),
      );
    if (guard === "mutation")
      await act(() => {
        mutationTask = client
          .getMutationCache()
          .build(client, { mutationFn: () => mutation.promise })
          .execute(undefined);
      });
    if (guard === "mutation") expect(client.isMutating()).toBe(1);
    // useIsMutating observes Query's scheduled notification, not the synchronous cache write.
    await waitFor(() => expect(screen.queryByText("An update is available")).toBeNull());
    await act(() => download.resolve({ isNew: true }));
    expect(boundary.reload).not.toHaveBeenCalled();
    expect(boundary.download).toHaveBeenCalledOnce();
    if (guard === "startup") await view.rerender(<Fixture />);
    if (guard === "navigation-ready") {
      boundary.ready = true;
      await navigationChanged();
    }
    if (guard === "navigation-route") {
      boundary.navigation = safeNavigation();
      await navigationChanged();
    }
    if (guard === "keyboard") await keyboard(false);
    if (guard === "background") await appState("active");
    if (guard.endsWith("selection")) await act(() => useAppStore.getState().clearPending());
    if (guard === "mutation")
      await act(async () => {
        mutation.resolve();
        await mutationTask;
      });
    expect(
      await screen.findByText("The update is downloaded. Restart when you are ready."),
    ).toBeVisible();
    expect(boundary.reload).not.toHaveBeenCalled();
    expect(screen.getByTestId("ota-update-accept")).toBeEnabled();
    await fireEvent.press(screen.getByTestId("ota-update-accept"));
    expect(boundary.download).toHaveBeenCalledOnce();
    expect(boundary.reload).toHaveBeenCalledOnce();
    expect(boundary.report).not.toHaveBeenCalled();
  },
);
