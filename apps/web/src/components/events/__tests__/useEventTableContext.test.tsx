import type { EventResponse, EventTableResponse } from "@board-game-organizer/schemas";
import { CommunityApiError } from "@board-game-organizer/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useEventTableContext } from "../../../../../../packages/shared/src/events/hooks/useEventTableContext";

const mocks = vi.hoisted(() => ({
  event: {} as { data?: EventResponse; error: unknown },
  table: {} as { data?: EventTableResponse; error: unknown },
  tableOptions: vi.fn(),
  window: vi.fn(),
}));
vi.mock("../../../../../../packages/shared/src/events/hooks/useEvents", () => ({
  useEvent: () => mocks.event,
  useEventTable: (options: unknown) => {
    mocks.tableOptions(options);
    return mocks.table;
  },
}));
vi.mock("../../../../../../packages/shared/src/events/hooks/useEventWindow", () => ({
  useEventWindow: (event: unknown) => {
    mocks.window(event);
    return Boolean(event);
  },
}));
const options = { apiUrl: "https://api.test", userId: "me", getToken: vi.fn(async () => "fresh") };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.event = { data: { id: "event" } as EventResponse, error: null };
  mocks.table = { data: { id: "table" } as EventTableResponse, error: null };
});
it("loads a dependent table only when the event exists and respects disabled context", () => {
  const first = renderHook(() => useEventTableContext(options, "event", "table"));
  expect(first.result.current.table).toBe(mocks.table.data);
  expect(mocks.tableOptions).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
  first.unmount();
  const disabled = renderHook(() =>
    useEventTableContext({ ...options, enabled: false }, "event", "table"),
  );
  expect(mocks.tableOptions).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  disabled.unmount();
  mocks.event.data = undefined;
  const missing = renderHook(() => useEventTableContext(options, "event", "table"));
  expect(missing.result.current.table).toBeUndefined();
  expect(mocks.tableOptions).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
});
it.each([401, 403, 404])(
  "removes private event and table data after explicit denial %s",
  (status) => {
    const hook = renderHook(() => useEventTableContext(options, "event", "table"));
    mocks.event.error = new CommunityApiError(status, "DENIED");
    hook.rerender();
    expect(hook.result.current.event).toBeUndefined();
    expect(hook.result.current.table).toBeUndefined();
    expect(mocks.window).toHaveBeenLastCalledWith(undefined);
    mocks.event.error = null;
    mocks.table.error = new CommunityApiError(status, "DENIED");
    hook.rerender();
    expect(hook.result.current.event).toBe(mocks.event.data);
    expect(hook.result.current.table).toBeUndefined();
  },
);
it("keeps usable cache on network errors with observable query errors", () => {
  mocks.event.error = new Error("network");
  mocks.table.error = new Error("network");
  const hook = renderHook(() => useEventTableContext(options, "event", "table"));
  expect(hook.result.current.event).toBe(mocks.event.data);
  expect(hook.result.current.table).toBe(mocks.table.data);
  expect(hook.result.current.eventQuery.error).toBeTruthy();
  expect(hook.result.current.tableQuery.error).toBeTruthy();
});
