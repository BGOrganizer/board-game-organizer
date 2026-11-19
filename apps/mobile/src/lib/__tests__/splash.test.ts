import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { STARTUP_SPLASH_LIMIT_MS } from "../startup";

const native = vi.hoisted(() => ({
  prevent: vi.fn<() => Promise<void>>(),
  hide: vi.fn<() => Promise<void>>(),
  report: vi.fn(),
}));
vi.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: native.prevent,
  hideAsync: native.hide,
}));
vi.mock("@sentry/react-native", () => ({ captureException: native.report }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T12:00:00.000Z"));
  native.prevent.mockReset().mockResolvedValue(undefined);
  native.hide.mockReset().mockResolvedValue(undefined);
  native.report.mockReset();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("holds the real bootstrap splash until the five-second failsafe even when startup never mounts", async () => {
  const start = Date.now();
  const splash = await import("../splash");
  expect(splash.startupStartedAt).toBe(start);
  expect(native.prevent).toHaveBeenCalledExactlyOnceWith();
  expect(native.hide).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(STARTUP_SPLASH_LIMIT_MS - 1);
  expect(native.hide).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(native.hide).toHaveBeenCalledExactlyOnceWith();
  expect(native.report).not.toHaveBeenCalled();
});

it("releases the native splash immediately when startup settles and cancels its failsafe", async () => {
  const splash = await import("../splash");
  splash.hideStartupSplash();
  await vi.advanceTimersByTimeAsync(STARTUP_SPLASH_LIMIT_MS * 2);
  expect(native.hide).toHaveBeenCalledExactlyOnceWith();
  expect(vi.getTimerCount()).toBe(0);
  expect(native.report).not.toHaveBeenCalled();
});

it("allows the animated startup owner to reveal the app without removing bootstrap's independent failsafe", async () => {
  const splash = await import("../splash");
  splash.revealStartupSplash();
  expect(native.hide).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(STARTUP_SPLASH_LIMIT_MS);
  expect(native.hide).toHaveBeenCalledTimes(2);
  expect(native.report).not.toHaveBeenCalled();
});

it("reports a failed native hold while retaining the failsafe instead of leaving startup blocked", async () => {
  const failure = new Error("Native splash hold failed");
  native.prevent.mockRejectedValueOnce(failure);
  await import("../splash");
  await vi.advanceTimersByTimeAsync(0);
  expect(native.report).toHaveBeenCalledExactlyOnceWith(failure);
  await vi.advanceTimersByTimeAsync(STARTUP_SPLASH_LIMIT_MS);
  expect(native.hide).toHaveBeenCalledOnce();
});

it("reports a failed explicit release and still retires its failsafe", async () => {
  const failure = new Error("Native splash release failed");
  const splash = await import("../splash");
  native.hide.mockRejectedValueOnce(failure);
  splash.hideStartupSplash();
  await vi.advanceTimersByTimeAsync(0);
  expect(native.report).toHaveBeenCalledExactlyOnceWith(failure);
  await vi.advanceTimersByTimeAsync(STARTUP_SPLASH_LIMIT_MS);
  expect(native.hide).toHaveBeenCalledOnce();
});

it("reports a native failsafe failure without producing an unhandled rejection", async () => {
  const failure = new Error("Native failsafe release failed");
  native.hide.mockRejectedValueOnce(failure);
  await import("../splash");
  await vi.advanceTimersByTimeAsync(STARTUP_SPLASH_LIMIT_MS);
  expect(native.report).toHaveBeenCalledExactlyOnceWith(failure);
  expect(native.hide).toHaveBeenCalledOnce();
});
