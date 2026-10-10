import type { EventResponse } from "@board-game-organizer/schemas";
import { useEventWindow } from "@board-game-organizer/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());
const event = {
  id: "event",
  status: "PUBLISHED",
  bookingClosesAt: "2030-01-01T12:00:00.000Z",
  canModify: true,
} as EventResponse;
describe("event cutoff UI clock", () => {
  it("freezes at equality without polling APIs; replacement deadlines replace old timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T11:59:59.000Z"));
    const { result, rerender, unmount } = renderHook(
      ({ row }: { row: EventResponse | undefined }) => useEventWindow(row),
      { initialProps: { row: event as EventResponse | undefined } },
    );
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
    rerender({ row: { ...event, bookingClosesAt: "2030-01-01T12:00:02.000Z" } });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("freezes private drafts at the same exact cutoff", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T11:59:59.000Z"));
    const { result, unmount } = renderHook(() => useEventWindow({ ...event, status: "DRAFT" }));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("honors server closure, draft edit authority, missing resources and cancellation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2029-01-01T00:00:00.000Z"));
    const { result, rerender, unmount } = renderHook(
      ({ row }: { row: EventResponse | undefined }) => useEventWindow(row),
      { initialProps: { row: undefined as EventResponse | undefined } },
    );
    expect(result.current).toBe(false);
    rerender({ row: { ...event, status: "DRAFT", canModify: true } });
    expect(result.current).toBe(true);
    rerender({ row: { ...event, status: "DRAFT", canModify: false } });
    expect(result.current).toBe(false);
    rerender({ row: { ...event, status: "CANCELLED" } });
    expect(result.current).toBe(false);
    rerender({ row: { ...event, closedAt: "2028-01-01T00:00:00.000Z" } });
    expect(result.current).toBe(false);
    rerender({ row: event });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(2147483647));
    expect(result.current).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
