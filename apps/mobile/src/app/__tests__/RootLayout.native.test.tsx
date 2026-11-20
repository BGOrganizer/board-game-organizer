import { useAppStore } from "@board-game-organizer/store";
import { useQueryClient } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Dialog } from "heroui-native/dialog";
import { Text } from "react-native";
import { Uniwind } from "uniwind";
import { afterAll, afterEach, expect, it, vi } from "vitest";

const bootstrap = vi.hoisted(() => {
  const error = console.error;
  const sink = vi.fn();
  console.error = sink;
  vi.stubGlobal("__DEV__", false);
  vi.stubEnv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture_only");
  vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", "https://public-fixture@example.invalid/1");
  return { error, sink };
});

import { RootFixture, rootSdk, useFixtureAuth } from "./rootLayoutFixture";

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(rootSdk.token).not.toHaveBeenCalled();
  expect(rootSdk.secureRead).not.toHaveBeenCalled();
  expect(rootSdk.digest).not.toHaveBeenCalled();
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  console.error = bootstrap.error;
});

it("preserves existing production telemetry settings and excludes Fabric-sensitive integrations at the actual root import", async () => {
  expect(rootSdk.init).toHaveBeenCalledExactlyOnceWith({
    dsn: "https://public-fixture@example.invalid/1",
    environment: "production",
    sendDefaultPii: true,
    enableLogs: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [],
  });
  expect(rootSdk.replayFactory).not.toHaveBeenCalled();
  expect(rootSdk.feedbackFactory).not.toHaveBeenCalled();
  expect(rootSdk.preventSplash).toHaveBeenCalledOnce();
  const handler = rootSdk.handler.mock.calls[0]?.[0] as
    | { handleNotification: () => Promise<unknown> }
    | undefined;
  if (!handler)
    throw new Error("Expected the real notification helper to configure the OS handler");
  await expect(handler.handleNotification()).resolves.toEqual({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  });
});

it("mounts real signed-out providers/startup and invokes actual native header configuration callbacks", async () => {
  await render(<RootFixture />);
  await waitFor(() => expect(rootSdk.badge).toHaveBeenCalledWith(0));
  expect(rootSdk.clerk).toHaveBeenCalledWith({
    publishableKey: "pk_test_fixture_only",
    tokenCache: rootSdk.tokenCache,
  });
  expect(rootSdk.createStorage).toHaveBeenCalledWith({ id: "bgo.cache-control.v1" });
  expect(rootSdk.hideSplash).toHaveBeenCalled();
  expect(screen.getByRole("header", { name: "Group details" })).toBeVisible();
  expect(screen.getByRole("header", { name: "Register event results" })).toBeVisible();
  expect(rootSdk.screen).toHaveBeenCalledWith(
    "sign-in",
    expect.objectContaining({ presentation: "modal", headerTitle: expect.any(Function) }),
  );
  expect(rootSdk.screen).toHaveBeenCalledWith("(tabs)", { headerShown: false });
  expect(rootSdk.stack).toHaveBeenCalledWith(expect.objectContaining({ headerBackVisible: false }));
  await userEvent.setup().press(screen.getByRole("button", { name: "Back" }));
  expect(rootSdk.goBack).toHaveBeenCalledExactlyOnceWith();
  expect(rootSdk.lastResponse).not.toHaveBeenCalled();
});

it("keeps ThemeSync, native navigation colors and status-bar configuration reactive to the actual shared store", async () => {
  await render(<RootFixture />);
  await act(() => useAppStore.getState().setThemePreference("dark"));
  await waitFor(() => expect(Uniwind.currentTheme).toBe("dark"));
  expect(rootSdk.statusBar).toHaveBeenLastCalledWith("light");
  await act(() => useAppStore.getState().setThemePreference("light"));
  await waitFor(() => expect(Uniwind.currentTheme).toBe("light"));
  expect(rootSdk.statusBar).toHaveBeenLastCalledWith("dark");
});

it("forwards release console diagnostics once while preserving the original console sink and never throwing on SDK failure", () => {
  const error = new Error("Synthetic root diagnostic");
  console.error("Root warning", error, 7);
  expect(bootstrap.sink).toHaveBeenCalledWith("Root warning", error, 7);
  expect(rootSdk.captureMessage).toHaveBeenCalledExactlyOnceWith(
    "Root warning Synthetic root diagnostic 7",
    "error",
  );
  rootSdk.captureMessage.mockImplementationOnce(() => {
    throw new Error("Telemetry transport unavailable");
  });
  expect(() => console.error("Later warning")).not.toThrow();
  expect(bootstrap.sink).toHaveBeenCalledWith("Later warning");
});

it.each([
  { error: new Error("Synthetic root exception"), message: "Synthetic root exception" },
  { error: "Synthetic non-Error rejection", message: "Synthetic non-Error rejection" },
])(
  "renders the real provider-independent RuntimeError for $message through the SDK fallback contract",
  async ({ error, message }) => {
    rootSdk.fault = error;
    await render(<RootFixture />);
    expect(screen.getByText("Errore imprevisto")).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByText("Fixture root component stack")).toBeVisible();
    expect(rootSdk.capture).toHaveBeenCalledWith(error);
    expect(rootSdk.clerk).not.toHaveBeenCalled();
  },
);

function PortalSessionProbe() {
  const { isLoaded } = useFixtureAuth();
  const client = useQueryClient();
  return <Text>{isLoaded && client ? "Portal session ready" : "Portal session missing"}</Text>;
}

it("makes the active Clerk and Query contexts available inside a real HeroUI portal", async () => {
  rootSdk.portalProbe = (
    <Dialog isOpen>
      <Dialog.Portal>
        <Dialog.Content>
          <Dialog.Title>Session check</Dialog.Title>
          <PortalSessionProbe />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
  await render(<RootFixture />);
  expect(await screen.findByText("Portal session ready")).toBeVisible();
});
