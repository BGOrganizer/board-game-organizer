import { describe, expect, it, vi } from "vitest";
import { blockAppRestart, useAppRestartGuard } from "../appRestartGuard";
import { createUpdateController, isRestartSafeNavigation } from "../otaUpdates";

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness() {
  const ports = {
    check: vi.fn(async () => true),
    download: vi.fn(async () => true),
    reload: vi.fn(async () => {}),
    canRestart: vi.fn(() => true),
    change: vi.fn(),
    report: vi.fn(),
  };
  const controller = createUpdateController(ports);
  return { ports, controller };
}

describe("OTA consent for one JS session", () => {
  it("checks without downloading, applies only on acceptance and deduplicates taps", async () => {
    const { controller: c, ports: p } = harness();
    const check = pending<boolean>();
    p.check.mockReturnValueOnce(check.promise);
    const checking = c.check();
    await c.check();
    await c.accept();
    expect(p.check).toHaveBeenCalledOnce();
    expect(p.download).not.toHaveBeenCalled();
    check.resolve(true);
    await checking;
    const download = pending<boolean>();
    p.download.mockReturnValueOnce(download.promise);
    const accepting = c.accept();
    c.defer();
    await c.accept();
    expect(p.download).toHaveBeenCalledOnce();
    download.resolve(true);
    await accepting;
    c.defer();
    await c.accept();
    expect(p.reload).toHaveBeenCalledOnce();
    expect(p.change.mock.calls.map(([phase]) => phase)).toEqual([
      "checking",
      "available",
      "downloading",
      "restarting",
    ]);
  });
  it("Later survives background, navigation checks and repeated taps until a new instance", async () => {
    const { controller: c, ports: p } = harness();
    await c.check();
    c.defer();
    c.background();
    await c.check();
    await c.accept();
    expect(p.check).toHaveBeenCalledOnce();
    expect(p.download).not.toHaveBeenCalled();
    const next = harness();
    await next.controller.check();
    expect(next.ports.change).toHaveBeenLastCalledWith("available");
  });
  it("checks again only on a new foreground when no update exists", async () => {
    const { controller: c, ports: p } = harness();
    p.check.mockResolvedValue(false);
    await c.check();
    await c.check();
    expect(p.check).toHaveBeenCalledOnce();
    c.background();
    await c.check();
    expect(p.check).toHaveBeenCalledTimes(2);
    expect(p.change).toHaveBeenLastCalledWith("idle");
  });
  it("does not check or accept while unsafe", async () => {
    const { controller: c, ports: p } = harness();
    p.canRestart.mockReturnValue(false);
    await c.check();
    expect(p.check).not.toHaveBeenCalled();
    p.canRestart.mockReturnValue(true);
    await c.check();
    p.canRestart.mockReturnValue(false);
    await c.accept();
    expect(p.download).not.toHaveBeenCalled();
  });
  it("defers a restart when a form, mutation, keyboard or background appears during download", async () => {
    const { controller: c, ports: p } = harness();
    await c.check();
    const download = pending<boolean>();
    p.download.mockReturnValueOnce(download.promise);
    const accepting = c.accept();
    p.canRestart.mockReturnValue(false);
    download.resolve(true);
    await accepting;
    expect(p.change).toHaveBeenLastCalledWith("ready");
    expect(p.reload).not.toHaveBeenCalled();
    p.canRestart.mockReturnValue(true);
    await c.accept();
    expect(p.download).toHaveBeenCalledOnce();
    expect(p.reload).toHaveBeenCalledOnce();
  });
  it("reports check failures and retries on a later foreground without an error dialog", async () => {
    const { controller: c, ports: p } = harness();
    const error = Error("offline");
    p.check.mockRejectedValueOnce(error);
    await c.check();
    expect(p.report).toHaveBeenCalledWith(error);
    expect(p.change).toHaveBeenLastCalledWith("idle");
    c.background();
    await c.check();
    expect(p.change).toHaveBeenLastCalledWith("available");
  });
  it.each([false, "reject"])("offers retry or Later after download failure %s", async (failure) => {
    const { controller: c, ports: p } = harness();
    const error = Error("offline");
    if (failure === false) p.download.mockResolvedValueOnce(false);
    else p.download.mockRejectedValueOnce(error);
    await c.check();
    await c.accept();
    expect(p.change).toHaveBeenLastCalledWith("download-error");
    expect(p.reload).not.toHaveBeenCalled();
    expect(p.report).toHaveBeenCalledTimes(failure === false ? 0 : 1);
    await c.accept();
    expect(p.reload).toHaveBeenCalledOnce();
  });
  it("retries a failed restart without downloading again", async () => {
    const { controller: c, ports: p } = harness();
    const error = Error("reload");
    p.reload.mockRejectedValueOnce(error);
    await c.check();
    await c.accept();
    expect(p.change).toHaveBeenLastCalledWith("restart-error");
    expect(p.report).toHaveBeenCalledWith(error);
    await c.accept();
    expect(p.download).toHaveBeenCalledOnce();
    expect(p.reload).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])("ignores disposed check results (success %s)", async (success) => {
    const { controller: c, ports: p } = harness();
    const check = pending<boolean>();
    p.check.mockReturnValueOnce(check.promise);
    const running = c.check();
    c.dispose();
    if (success) check.resolve(true);
    else check.reject(Error("late"));
    await running;
    c.defer();
    await c.check();
    await c.accept();
    expect(p.change).toHaveBeenCalledTimes(1);
    expect(p.report).not.toHaveBeenCalled();
  });
  it.each([true, false])("ignores disposed download results (success %s)", async (success) => {
    const { controller: c, ports: p } = harness();
    const download = pending<boolean>();
    await c.check();
    p.download.mockReturnValueOnce(download.promise);
    const running = c.accept();
    c.dispose();
    if (success) download.resolve(true);
    else download.reject(Error("late"));
    await running;
    expect(p.reload).not.toHaveBeenCalled();
    expect(p.change).toHaveBeenLastCalledWith("downloading");
    expect(p.report).not.toHaveBeenCalled();
  });
  it("ignores a disposed reload rejection", async () => {
    const { controller: c, ports: p } = harness();
    const reload = pending<void>();
    await c.check();
    p.reload.mockReturnValueOnce(reload.promise);
    const running = c.accept();
    await Promise.resolve();
    c.dispose();
    reload.reject(Error("late"));
    await running;
    expect(p.report).not.toHaveBeenCalled();
    expect(p.change).toHaveBeenLastCalledWith("restarting");
  });
});

it("keeps restart blocks until all mounted form scopes release, with idempotent cleanup", () => {
  const releaseFirst = blockAppRestart(),
    releaseSecond = blockAppRestart();
  expect(useAppRestartGuard.getState().blocks).toBe(2);
  releaseFirst();
  releaseFirst();
  expect(useAppRestartGuard.getState().blocks).toBe(1);
  releaseSecond();
  expect(useAppRestartGuard.getState().blocks).toBe(0);
});

it("only allows read-only main navigation and rejects editors anywhere in the stack", () => {
  expect(isRestartSafeNavigation(undefined)).toBe(false);
  expect(isRestartSafeNavigation({ routes: [] })).toBe(false);
  expect(isRestartSafeNavigation({ routes: [{ name: "index" }] })).toBe(true);
  for (const name of ["tables", "events", "groups", "contacts"]) {
    expect(
      isRestartSafeNavigation({ routes: [{ name: "(tabs)", state: { routes: [{ name }] } }] }),
    ).toBe(true);
  }
  expect(isRestartSafeNavigation({ routes: [{ name: "(tabs)" }] })).toBe(false);
  expect(isRestartSafeNavigation({ routes: [{ name: "event/wizard" }, { name: "index" }] })).toBe(
    false,
  );
  expect(
    isRestartSafeNavigation({ routes: [{ name: "(tabs)", state: { index: 5, routes: [] } }] }),
  ).toBe(false);
  expect(
    isRestartSafeNavigation({
      routes: [
        {
          name: "(tabs)",
          state: { index: 1, routes: [{ name: "tables" }, { name: "community" }] },
        },
      ],
    }),
  ).toBe(false);
  expect(
    isRestartSafeNavigation({
      routes: [{ name: "(tabs)", state: { routes: [{ name: "tables", state: { routes: [] } }] } }],
    }),
  ).toBe(false);
});
