import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequestDiagnostics } from "../request-diagnostics";

beforeEach(() => vi.spyOn(console, "info").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());
it("keeps unselected domains silent", () => {
  const trace = createRequestDiagnostics();
  trace("failed", "transaction", 500, "INTERNAL_ERROR");
  expect(console.info).not.toHaveBeenCalled();
});
it.each(["group.create", "location.search"] as const)(
  "correlates safe stages for %s without arbitrary messages",
  (operation) => {
    const trace = createRequestDiagnostics(operation);
    trace("completed", "storage", 200);
    trace("failed", "lookup", 503, "GEOCODING_UNAVAILABLE");
    trace("failed", "lookup", 500, "private-address@example.test");
    const calls = vi.mocked(console.info).mock.calls;
    expect(
      calls.every(
        ([tag]) =>
          tag === (operation.startsWith("group.") ? "[bgo.group-write]" : "[bgo.location-write]"),
      ),
    ).toBe(true);
    const entries = calls.map(([, value]) => value);
    expect(entries[0]).toMatchObject({
      operation,
      phase: "received",
      stage: "auth",
      requestId: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    expect(entries.every((value) => value.requestId === entries[0].requestId)).toBe(true);
    expect(entries.at(-1)).toMatchObject({ code: "REQUEST_REJECTED", status: 500 });
    expect(JSON.stringify(entries)).not.toContain("private-address@example.test");
  },
);
