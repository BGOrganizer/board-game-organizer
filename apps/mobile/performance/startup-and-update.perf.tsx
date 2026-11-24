import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent } from "@testing-library/react-native";
import {
  createContext,
  createRef,
  type Ref,
  useContext,
  useImperativeHandle,
  useState,
} from "react";
import { AppState, Keyboard, Linking, StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Startup } from "@/components/common/startup/Startup";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const fixture = vi.hoisted(() => ({
  hideSplash: vi.fn(),
  revealSplash: vi.fn(),
  badge: vi.fn(async () => true),
  check: vi.fn(async () => ({ isAvailable: true, isRollBackToEmbedded: false })),
  download: vi.fn(),
  reload: vi.fn(),
  getToken: vi.fn(),
  report: vi.fn(),
}));
const AuthReady = createContext(false);
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: useContext(AuthReady),
    isSignedIn: false,
    userId: null,
    sessionId: null,
    getToken: fixture.getToken,
  }),
  useUser: () => ({ isLoaded: useContext(AuthReady), user: null }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://startup-render.test" } } },
}));
vi.mock("expo-contacts", () => ({}));
vi.mock("expo-notifications", () => ({ setBadgeCountAsync: fixture.badge }));
vi.mock("@sentry/react-native", () => ({ captureException: fixture.report }));
vi.mock("@/lib/splash", () => ({
  hideStartupSplash: fixture.hideSplash,
  revealStartupSplash: fixture.revealSplash,
}));
vi.mock("expo-updates", () => ({
  isEnabled: true,
  checkAutomatically: "NEVER",
  UpdatesCheckAutomaticallyValue: { NEVER: "NEVER" },
  checkForUpdateAsync: fixture.check,
  fetchUpdateAsync: fixture.download,
  reloadAsync: fixture.reload,
}));
const navigationState = {
  routes: [
    {
      name: "__root",
      state: { routes: [{ name: "(tabs)", state: { routes: [{ name: "groups" }] } }] },
    },
  ],
};
const navigation = {
  isReady: () => true,
  getRootState: () => navigationState,
  addListener: () => () => {},
};
vi.mock("expo-router", () => ({
  usePathname: () => "/groups",
  useNavigationContainerRef: () => navigation,
}));

const appState = Object.getOwnPropertyDescriptor(AppState, "currentState");
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    writable: true,
    value: "active",
  });
  vi.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
  vi.spyOn(Keyboard, "isVisible").mockReturnValue(false);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (appState) Object.defineProperty(AppState, "currentState", appState);
});

function RestoringStartup({ resume }: { resume: Ref<() => void> }) {
  const [restored, restore] = useState(false);
  const [startedAt] = useState(Date.now);
  useImperativeHandle(resume, () => () => restore(true), []);
  return (
    <QueryClientProvider client={client}>
      <AuthReady value={restored}>
        <Startup startedAt={startedAt} initialNotificationHref={null} />
      </AuthReady>
    </QueryClientProvider>
  );
}

it("Startup: reveal the native splash, settle authentication and postpone a real OTA offer", async () => {
  const resume = createRef<() => void>();
  const result = await measureRenders(<RestoringStartup resume={resume} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      vi.clearAllMocks();
    },
    scenario: async () => {
      const splash = screen.container.queryAll(
        (node) =>
          typeof node.props.onLayout === "function" &&
          StyleSheet.flatten(node.props.style)?.zIndex === 100,
      );
      expect(splash).toHaveLength(1);
      expect(fixture.check).not.toHaveBeenCalled();
      await fireEvent.layout(splash[0], { x: 0, y: 0, width: 390, height: 844 });
      expect(fixture.revealSplash).toHaveBeenCalledOnce();
      await act(() => resume.current?.());
      expect(await screen.findByText("An update is available")).toBeVisible();
      expect(fixture.hideSplash).toHaveBeenCalledOnce();
      expect(fixture.check).toHaveBeenCalledOnce();
      await userEvent.setup().press(screen.getByTestId("ota-update-later"));
      expect(screen.queryByText("An update is available")).toBeNull();
      expect(fixture.download).not.toHaveBeenCalled();
      expect(fixture.reload).not.toHaveBeenCalled();
      expect(fixture.getToken).not.toHaveBeenCalled();
    },
  });
  assertRenderMeasurement(result);
});
