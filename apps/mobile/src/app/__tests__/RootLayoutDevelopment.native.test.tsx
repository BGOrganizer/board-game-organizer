import { afterAll, expect, it, vi } from "vitest";

const bootstrap = vi.hoisted(() => {
  const error = console.error;
  const sink = vi.fn();
  console.error = sink;
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", "");
  return { error, sink };
});

import { rootSdk } from "./rootLayoutFixture";

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  console.error = bootstrap.error;
});

it("preserves the actual development-only integrations and existing default telemetry configuration without provider traffic", () => {
  expect(rootSdk.init).toHaveBeenCalledExactlyOnceWith({
    dsn: "",
    environment: "development",
    sendDefaultPii: true,
    enableLogs: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [rootSdk.replay, rootSdk.feedback],
  });
  expect(rootSdk.replayFactory).toHaveBeenCalledOnce();
  expect(rootSdk.feedbackFactory).toHaveBeenCalledOnce();
  expect(rootSdk.handler).toHaveBeenCalledOnce();
  expect(bootstrap.sink).toHaveBeenCalledWith("[Clerk] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
  expect(rootSdk.captureMessage).not.toHaveBeenCalled();
  expect(rootSdk.clerk).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
