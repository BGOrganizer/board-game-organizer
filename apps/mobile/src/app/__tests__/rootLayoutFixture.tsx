import { createRequire } from "node:module";
import { useAppStore } from "@board-game-organizer/store";
import { act } from "@testing-library/react-native";
import { createContext, type ReactNode, useContext } from "react";
import { Linking, View } from "react-native";
import { Uniwind } from "uniwind";
import { afterAll, afterEach, beforeEach, vi } from "vitest";

type HeaderOptions = {
  title?: string;
  headerShown?: boolean;
  headerBackVisible?: boolean;
  presentation?: string;
  headerTitle?: (props: { children: string }) => ReactNode;
  headerLeft?: (props: { canGoBack: boolean }) => ReactNode;
};
const Session = createContext(false);
const rootSdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureMessage: vi.fn(),
  replayFactory: vi.fn(),
  feedbackFactory: vi.fn(),
  replay: { name: "fixture-replay" },
  feedback: { name: "fixture-feedback" },
  fault: undefined as unknown,
  clerk: vi.fn(),
  token: vi.fn(),
  portalProbe: null as ReactNode,
  goBack: vi.fn(),
  screen: vi.fn(),
  stack: vi.fn(),
  statusBar: vi.fn(),
  tokenCache: { getToken: vi.fn(), saveToken: vi.fn() },
  handler: vi.fn(),
  badge: vi.fn(async () => true),
  lastResponse: vi.fn(async () => null),
  clearResponse: vi.fn(async () => undefined),
  preventSplash: vi.fn(async () => undefined),
  hideSplash: vi.fn(async () => undefined),
  secureRead: vi.fn(),
  secureWrite: vi.fn(),
  secureDelete: vi.fn(async () => undefined),
  digest: vi.fn(),
  random: vi.fn(),
  databases: new Map<string, Map<string, string>>(),
  createStorage: vi.fn(),
  deleteStorage: vi.fn(),
}));
vi.mock("@sentry/react-native", () => ({
  init: rootSdk.init,
  captureException: rootSdk.capture,
  captureMessage: rootSdk.captureMessage,
  mobileReplayIntegration: () => {
    rootSdk.replayFactory();
    return rootSdk.replay;
  },
  feedbackIntegration: () => {
    rootSdk.feedbackFactory();
    return rootSdk.feedback;
  },
  ErrorBoundary: ({
    children,
    fallback,
  }: {
    children: ReactNode;
    fallback: (props: { error: unknown; componentStack: string }) => ReactNode;
  }) =>
    rootSdk.fault === undefined
      ? children
      : fallback({ error: rootSdk.fault, componentStack: "Fixture root component stack" }),
}));
export function useFixtureAuth() {
  if (!useContext(Session)) throw new Error("Missing Clerk provider");
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    sessionId: null,
    getToken: rootSdk.token,
  };
}
vi.mock("@clerk/expo", () => ({
  ClerkProvider: ({
    children,
    ...config
  }: {
    children: ReactNode;
    publishableKey: string;
    tokenCache: unknown;
  }) => {
    rootSdk.clerk(config);
    return <Session.Provider value={true}>{children}</Session.Provider>;
  },
  useAuth: useFixtureAuth,
  useUser: () => ({ isLoaded: true, user: null }),
}));
vi.mock("@clerk/expo/token-cache", () => ({ tokenCache: rootSdk.tokenCache }));
vi.mock("expo-router", () => {
  const router = { push: vi.fn() };
  const navigationRef = {
    isReady: () => false,
    getRootState: () => undefined,
    addListener: () => () => {},
  };
  const Stack = ({
    children,
    screenOptions,
  }: {
    children: ReactNode;
    screenOptions: (props: { navigation: { goBack: typeof rootSdk.goBack } }) => HeaderOptions;
  }) => {
    const options = screenOptions({ navigation: { goBack: rootSdk.goBack } });
    rootSdk.stack(options);
    return (
      <View>
        {options.headerLeft?.({ canGoBack: true })}
        {rootSdk.portalProbe}
        {children}
      </View>
    );
  };
  Stack.Screen = ({ name, options }: { name: string; options: HeaderOptions }) => {
    rootSdk.screen(name, options);
    return options.headerShown === false
      ? null
      : options.headerTitle?.({ children: options.title ?? "" });
  };
  return {
    Stack,
    useRouter: () => router,
    usePathname: () => "/sign-in",
    useNavigationContainerRef: () => navigationRef,
  };
});
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: "https://root-layout-fixtures.test",
        sentryEnvironment: __DEV__ ? undefined : "production",
      },
    },
  },
}));
vi.mock("expo-status-bar", () => ({
  StatusBar: ({ style }: { style: string }) => {
    rootSdk.statusBar(style);
    return null;
  },
}));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: rootSdk.handler,
  setBadgeCountAsync: rootSdk.badge,
  getLastNotificationResponseAsync: rootSdk.lastResponse,
  clearLastNotificationResponseAsync: rootSdk.clearResponse,
  addNotificationResponseReceivedListener: () => ({ remove: vi.fn() }),
  addNotificationReceivedListener: () => ({ remove: vi.fn() }),
}));
vi.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: rootSdk.preventSplash,
  hideAsync: rootSdk.hideSplash,
}));
vi.mock("expo-updates", () => ({
  isEnabled: false,
  checkAutomatically: "NEVER",
  UpdatesCheckAutomaticallyValue: { NEVER: "NEVER" },
}));
vi.mock("expo-contacts", () => ({
  getPermissionsAsync: vi.fn(),
  Contact: { getAllDetails: vi.fn() },
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: rootSdk.digest,
  getRandomBytesAsync: rootSdk.random,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: rootSdk.secureRead,
  setItemAsync: rootSdk.secureWrite,
  deleteItemAsync: rootSdk.secureDelete,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "fixture-unlocked-only",
}));
// MMKV itself is the native storage boundary. All BGO tombstones, queueing,
// owner checks and persistence/provider code run unchanged above this port.
vi.mock("react-native-mmkv", () => ({
  createMMKV: (config: { id: string }) => {
    rootSdk.createStorage(config);
    let values = rootSdk.databases.get(config.id);
    if (!values) {
      values = new Map();
      rootSdk.databases.set(config.id, values);
    }
    const current = values;
    return {
      getString: (key: string) => current.get(key),
      set: (key: string, value: string) => current.set(key, value),
      remove: (key: string) => current.delete(key),
      clearAll: () => current.clear(),
      encrypt: vi.fn(),
    };
  },
  deleteMMKV: rootSdk.deleteStorage,
}));

import { hideStartupSplash } from "@/lib/splash";
// The exact Metro-compiled Uniwind artifact is already registered by native
// global setup; this fixture neither replaces CSS nor wraps any BGO component.
import RootLayout from "../_layout";

export { RootLayout, rootSdk };

const { SafeAreaProvider } = createRequire(import.meta.url)(
  "react-native-safe-area-context",
) as typeof import("react-native-safe-area-context");
const originalStore = useAppStore.getState();
const originalTheme = Uniwind.currentTheme;
const originalAdaptiveTheme = Uniwind.hasAdaptiveThemes;
beforeEach(() => {
  rootSdk.fault = undefined;
  rootSdk.portalProbe = null;
  rootSdk.capture.mockClear();
  rootSdk.captureMessage.mockClear();
  rootSdk.clerk.mockClear();
  rootSdk.screen.mockClear();
  rootSdk.stack.mockClear();
  rootSdk.goBack.mockClear();
  rootSdk.statusBar.mockClear();
  for (const values of rootSdk.databases.values()) values.clear();
  vi.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Signed-out RootLayout cannot request private API/provider data");
    }),
  );
});
afterEach(async () => {
  await act(() => {
    useAppStore.setState(originalStore, true);
    Uniwind.setTheme(originalAdaptiveTheme ? "system" : originalTheme);
  });
});
afterAll(hideStartupSplash);
export function RootFixture() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <RootLayout />
    </SafeAreaProvider>
  );
}
