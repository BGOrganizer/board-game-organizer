import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => mocks);
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
  vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
  vi.stubEnv("NEXT_RUNTIME", undefined);
});
afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "development", "production"])(
  "initializes the browser with the web DSN and explicit environment %s",
  async (environment) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/42");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", environment);
    const client = await import("../../instrumentation-client");
    expect(client.onRouterTransitionStart).toBe(mocks.captureRouterTransitionStart);
    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.invalid/42",
        enabled: true,
        environment: environment ?? "development",
        sendDefaultPii: false,
        enableLogs: false,
        tracesSampleRate: 0,
        maxBreadcrumbs: 0,
      }),
    );
  },
);

it("keeps the app usable without a web DSN and disables event delivery", async () => {
  await import("../../instrumentation-client");
  expect(mocks.init).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
});

it.each(["nodejs", "edge", undefined])(
  "registers only the selected web runtime %s",
  async (runtime) => {
    vi.stubEnv("NEXT_RUNTIME", runtime);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "production");
    const instrumentation = await import("../../instrumentation");
    expect(instrumentation.onRequestError).toBe(mocks.captureRequestError);
    await instrumentation.register();
    expect(mocks.init).toHaveBeenCalledTimes(runtime ? 1 : 0);
    if (runtime)
      expect(mocks.init).toHaveBeenCalledWith(
        expect.objectContaining({ environment: "production" }),
      );
  },
);

it("removes identity and request context while retaining error, release and environment", async () => {
  const { stripSentryRequestContext } = await import("../sentry");
  const event: ErrorEvent = {
    type: undefined,
    event_id: "event-id",
    environment: "development",
    release: "web@1",
    exception: { values: [{ type: "Error", value: "Test error" }] },
    request: { url: "https://private.invalid/?bypass=private", data: "private body" },
    user: { id: "private-user", email: "private@example.invalid" },
    breadcrumbs: [{ message: "private breadcrumb" }],
    extra: { token: "private" },
    contexts: { response: { headers: { authorization: "private" } } },
    transaction: "/private-resource",
  };
  expect(stripSentryRequestContext(event)).toEqual({
    event_id: "event-id",
    environment: "development",
    release: "web@1",
    exception: { values: [{ type: "Error", value: "Test error" }] },
  });
  expect(stripSentryRequestContext({ type: undefined })).toEqual({ type: undefined });
});
