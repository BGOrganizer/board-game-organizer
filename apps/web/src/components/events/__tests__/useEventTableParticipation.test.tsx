import type {
  EventBookingResponse,
  EventResponse,
  EventTableResponse,
  MatchDetailResponse,
} from "@board-game-organizer/schemas";
import { CommunityApiError, type CommunityApiOptions } from "@board-game-organizer/shared";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useEventTableParticipation } from "../../../../../../packages/shared/src/events/hooks/useEventTableParticipation";

type ContextState = {
  event: EventResponse;
  table: EventTableResponse;
  open: boolean;
  eventQuery: { isPending: boolean; error: unknown };
  tableQuery: { isPending: boolean; error: unknown };
};
type BookingsState = {
  items: EventBookingResponse[];
  error: unknown;
  isPending: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: ReturnType<typeof vi.fn>;
};
const state = vi.hoisted(() => ({
  context: {} as ContextState,
  bookings: {} as BookingsState,
  busy: false,
  request: vi.fn(),
  action: vi.fn(),
  options: vi.fn(),
}));
vi.mock("../../../../../../packages/shared/src/events/hooks/useEventTableContext", () => ({
  useEventTableContext: () => state.context,
}));
vi.mock("../../../../../../packages/shared/src/events/hooks/useEvents", () => ({
  useEventBookings: (options: unknown) => {
    state.options(options);
    return state.bookings;
  },
  useEventActions: () => ({
    busy: state.busy,
    request: { mutateAsync: state.request },
    booking: { mutateAsync: state.action },
  }),
}));
const o = { apiUrl: "https://api.test", userId: "me", getToken: vi.fn(async () => "fresh") };
const b = (patch: Partial<EventBookingResponse> = {}): EventBookingResponse => ({
  id: "booking",
  eventId: "event",
  tableId: "table",
  userId: "me",
  kind: "REQUEST",
  status: "PENDING",
  createdAt: "2030-01-01T00:00:00Z",
  updatedAt: "2030-01-01T00:00:00Z",
  username: "me_name",
  avatarUrl: null,
  ...patch,
});
const hook = (frozen?: MatchDetailResponse, options: CommunityApiOptions = o) =>
  renderHook(() => useEventTableParticipation(options, "event", "table", frozen));
beforeEach(() => {
  vi.clearAllMocks();
  state.busy = false;
  state.context = {
    event: { role: "admin" } as EventResponse,
    table: {
      status: "PLANNING",
      maxPlayers: 4,
      reservedCount: 0,
      canBook: true,
      myBooking: null,
    } as EventTableResponse,
    open: true,
    eventQuery: { isPending: false, error: null },
    tableQuery: { isPending: false, error: null },
  };
  state.bookings = {
    items: [],
    error: null,
    isPending: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(async () => undefined),
  };
  state.request.mockResolvedValue(b());
  state.action.mockResolvedValue(b({ status: "CONFIRMED" }));
});
it("requires confirmation, pins the real pending booking to the selected row and blocks duplicate requests", async () => {
  const view = hook();
  act(() => view.result.current.openJoin(3));
  expect(state.request).not.toHaveBeenCalled();
  expect(view.result.current.dialog).toEqual({ kind: "join", index: 3 });
  await act(async () => {
    await view.result.current.submit();
  });
  expect(state.request).toHaveBeenCalledWith({ eventId: "event", tableId: "table" });
  expect(view.result.current.dialog).toBeNull();
  state.context.table = {
    ...state.context.table,
    myBooking: b(),
    reservedCount: 1,
    canBook: false,
  };
  view.rerender();
  expect(view.result.current.seats[3].user?.userId).toBe("me");
  expect(view.result.current.seats[3].reserved).toBe(true);
  expect(view.result.current.canJoin).toBe(false);
  act(() => view.result.current.openJoin(2));
  expect(view.result.current.dialog).toBeNull();
});
it("retains a failed confirmation and rolls back only the local row hint", async () => {
  state.request.mockRejectedValueOnce(new Error("network"));
  const view = hook();
  act(() => view.result.current.openJoin(2));
  await act(async () => {
    await expect(view.result.current.submit()).rejects.toThrow("network");
  });
  expect(view.result.current.dialog?.kind).toBe("join");
  state.context.table.myBooking = b();
  view.rerender();
  expect(view.result.current.seats[0].user?.userId).toBe("me");
  expect(view.result.current.seats[2].user).toBeUndefined();
});
it("masks private pending bookings, keeps inactive bookings out and does not duplicate own records", () => {
  state.bookings.items = [b(), b({ id: "inactive", status: "DECLINED" })];
  state.context.table = {
    ...state.context.table,
    myBooking: b(),
    reservedCount: 3,
    canBook: false,
  };
  const view = hook();
  expect(view.result.current.live).toHaveLength(1);
  expect(view.result.current.seats.filter((s) => s.reserved)).toHaveLength(3);
  expect(view.result.current.seats[1].user).toBeUndefined();
  state.context.table.myBooking = b({ status: "CANCELLED" });
  state.bookings.items = [];
  view.rerender();
  expect(view.result.current.live).toEqual([]);
  state.context.event = { ...state.context.event, role: "visitor" } as EventResponse;
  state.bookings.items = [b({ userId: "secret", username: "Secret" })];
  state.context.table.myBooking = null;
  view.rerender();
  expect(view.result.current.live).toEqual([]);
  expect(state.options).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
});
it.each([401, 403, 404])("hides private rows and all actions after booking denial %s", (status) => {
  state.bookings.items = [b({ userId: "other", username: "Secret" })];
  state.bookings.error = new CommunityApiError(status, "DENIED");
  const view = hook();
  expect(view.result.current.live).toEqual([]);
  expect(view.result.current.open).toBe(false);
  expect(view.result.current.error).toBe(state.bookings.error);
});
it("preserves cached players on ordinary failure and reports all initial loading/error states", () => {
  const view = hook();
  state.bookings.error = new Error("network");
  state.bookings.items = [b()];
  view.rerender();
  expect(view.result.current.live).toHaveLength(1);
  expect(view.result.current.error).toBe(state.bookings.error);
  state.context.eventQuery.error = new Error("event");
  view.rerender();
  expect(view.result.current.error).toBe(state.context.eventQuery.error);
  state.context.eventQuery.error = null;
  state.context.tableQuery.error = new Error("table");
  view.rerender();
  expect(view.result.current.error).toBe(state.context.tableQuery.error);
  state.context.eventQuery.isPending = true;
  view.rerender();
  expect(view.result.current.loading).toBe(true);
  state.context.eventQuery.isPending = false;
  state.context.tableQuery.isPending = true;
  view.rerender();
  expect(view.result.current.loading).toBe(true);
  state.context.tableQuery.isPending = false;
  state.bookings.isPending = true;
  state.bookings.items = [];
  view.rerender();
  expect(view.result.current.loading).toBe(true);
  state.context.table.myBooking = b();
  view.rerender();
  expect(view.result.current.loading).toBe(false);
  Object.assign(state.context, { event: undefined, table: undefined });
  view.rerender();
  expect(view.result.current.seats).toEqual([]);
  expect(view.result.current.loading).toBe(false);
});
it.each(["approve", "reject"] as const)(
  "confirms an admin request with %s and no invitation or foreign action",
  async (action) => {
    state.bookings.items = [b({ userId: "other" })];
    state.context.table.reservedCount = 1;
    const view = hook();
    act(() => view.result.current.openBooking(state.bookings.items[0], "manage"));
    expect(view.result.current.dialog).toMatchObject({ mode: "manage" });
    await act(async () => {
      await view.result.current.submit("accept");
    });
    expect(state.action).not.toHaveBeenCalled();
    await act(async () => {
      await view.result.current.submit(action);
    });
    expect(state.action).toHaveBeenCalledWith({ id: "booking", eventId: "event", action });
  },
);
it.each(["accept", "decline"] as const)(
  "lets only the pending invitation recipient confirm %s",
  async (action) => {
    state.bookings.items = [b({ kind: "INVITATION" })];
    const view = hook();
    act(() => view.result.current.openBooking(state.bookings.items[0], "invitation"));
    await act(async () => {
      await view.result.current.submit("approve");
    });
    expect(state.action).not.toHaveBeenCalled();
    await act(async () => {
      await view.result.current.submit(action);
    });
    expect(state.action).toHaveBeenCalledWith({ id: "booking", eventId: "event", action });
    expect(view.result.current.canRespond(b({ userId: "other", kind: "INVITATION" }))).toBe(false);
    expect(view.result.current.canRespond(b({ status: "CONFIRMED", kind: "INVITATION" }))).toBe(
      false,
    );
    expect(view.result.current.canRespond(b())).toBe(false);
  },
);
it.each(["cancel", "remove"] as const)(
  "confirms %s, preserves failure, and cancels without mutation",
  async (action) => {
    state.bookings.items = [b()];
    const view = hook();
    act(() => view.result.current.openBooking(state.bookings.items[0], action));
    await act(async () => {
      await view.result.current.submit("reject");
    });
    expect(state.action).not.toHaveBeenCalled();
    state.action.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await expect(view.result.current.submit(action)).rejects.toThrow();
    });
    expect(view.result.current.dialog).toBeTruthy();
    act(() => view.result.current.dismiss());
    expect(view.result.current.dialog).toBeNull();
    act(() => view.result.current.openBooking(state.bookings.items[0], action));
    await act(async () => {
      await view.result.current.submit(action);
    });
    expect(state.action).toHaveBeenLastCalledWith({ id: "booking", eventId: "event", action });
  },
);
it("invalidates changed request snapshots and rechecks role, busy, clock, capacity and selection", async () => {
  state.bookings.items = [b()];
  const view = hook();
  await act(async () => {
    await view.result.current.submit();
  });
  act(() => view.result.current.openBooking(b(), "manage"));
  await act(async () => {
    await view.result.current.submit();
  });
  expect(state.action).not.toHaveBeenCalled();
  state.bookings.items = [b({ updatedAt: "2030-01-02T00:00:00Z" })];
  view.rerender();
  expect(view.result.current.dialog).toBeNull();
  await act(async () => {
    await view.result.current.submit("approve");
  });
  expect(state.action).not.toHaveBeenCalled();
  act(() => view.result.current.dismiss());
  state.context.event.role = "member";
  view.rerender();
  act(() => view.result.current.openBooking(b(), "manage"));
  act(() => view.result.current.openBooking(b(), "remove"));
  act(() => view.result.current.openBooking(b({ userId: "other" }), "cancel"));
  act(() => view.result.current.openBooking(b(), "invitation"));
  expect(view.result.current.dialog).toBeNull();
  state.context.event.role = "admin";
  view.rerender();
  expect(view.result.current.canManage(b({ status: "CONFIRMED" }))).toBe(false);
  expect(view.result.current.canManage(b({ kind: "INVITATION" }))).toBe(false);
  act(() => view.result.current.openJoin(0));
  expect(view.result.current.dialog).toBeNull();
  act(() => view.result.current.openJoin(99));
  expect(view.result.current.dialog).toBeNull();
  act(() => view.result.current.openJoin(3));
  state.busy = true;
  view.rerender();
  act(() => view.result.current.dismiss());
  expect(view.result.current.dialog).toBeTruthy();
  act(() => view.result.current.openBooking(b(), "manage"));
  await act(async () => {
    await view.result.current.submit();
  });
  expect(state.request).not.toHaveBeenCalled();
  state.busy = false;
  state.context.open = false;
  view.rerender();
  expect(view.result.current.dialog).toBeNull();
  await act(async () => {
    await view.result.current.submit();
  });
  expect(state.request).not.toHaveBeenCalled();
  state.context.open = true;
  state.context.table.canBook = false;
  view.rerender();
  await act(async () => {
    await view.result.current.submit();
  });
  expect(state.request).not.toHaveBeenCalled();
  state.context.table.canBook = true;
  state.context.table.reservedCount = 4;
  view.rerender();
  await act(async () => {
    await view.result.current.submit();
  });
  expect(state.request).not.toHaveBeenCalled();
});
it("pages seats and source bookings on demand, without loops while fetching or failed", async () => {
  state.context.table = { ...state.context.table, maxPlayers: 60, reservedCount: 50 };
  state.bookings.hasNextPage = true;
  const view = hook();
  expect(view.result.current.seats).toHaveLength(20);
  state.bookings.isFetchingNextPage = true;
  view.rerender();
  await act(async () => {
    await view.result.current.advance();
  });
  expect(state.bookings.fetchNextPage).not.toHaveBeenCalled();
  state.bookings.isFetchingNextPage = false;
  state.bookings.isFetchNextPageError = true;
  view.rerender();
  await act(async () => {
    await view.result.current.advance();
  });
  expect(state.bookings.fetchNextPage).not.toHaveBeenCalled();
  state.bookings.isFetchNextPageError = false;
  view.rerender();
  await act(async () => {
    await view.result.current.advance();
  });
  expect(state.bookings.fetchNextPage).toHaveBeenCalledOnce();
  expect(view.result.current.seats).toHaveLength(40);
  state.bookings.items = Array.from({ length: 60 }, (_, i) =>
    b({ id: String(i), userId: String(i) }),
  );
  view.rerender();
  await act(async () => {
    await view.result.current.advance();
  });
  expect(state.bookings.fetchNextPage).toHaveBeenCalledOnce();
  expect(view.result.current.seats).toHaveLength(60);
  state.bookings.hasNextPage = false;
  view.rerender();
  expect(view.result.current.hasMore).toBe(false);
  state.bookings.hasNextPage = true;
  Object.assign(state.context, { table: undefined });
  view.rerender();
  await act(async () => {
    await view.result.current.advance();
  });
  expect(view.result.current.hasMore).toBe(false);
});
it("uses the real response identity even if no initial local hint identity was available", async () => {
  const view = hook(undefined, { ...o, userId: null });
  act(() => view.result.current.openJoin(2));
  await act(async () => {
    await view.result.current.submit();
  });
  state.context.table.myBooking = b();
  view.rerender();
  expect(view.result.current.seats[2].user?.userId).toBe("me");
});
it("does not page inactive history after every reserved user is known", async () => {
  state.bookings.hasNextPage = true;
  state.bookings.items = [
    b(),
    ...Array.from({ length: 30 }, (_, i) => b({ id: `inactive-${i}`, status: "DECLINED" })),
  ];
  state.context.table.reservedCount = 1;
  const view = hook();
  expect(view.result.current.hasMore).toBe(false);
  await act(async () => {
    await view.result.current.advance();
  });
  expect(state.bookings.fetchNextPage).not.toHaveBeenCalled();
});
it("disables requested data and actions when the API context is disabled", () => {
  const view = hook(undefined, { ...o, enabled: false });
  expect(view.result.current.open).toBe(false);
  expect(view.result.current.canJoin).toBe(false);
  expect(state.options).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
});
it("uses the authoritative frozen roster even after membership departure; never adds the owner", async () => {
  const frozen = {
    match: { eventTable: {}, maxPlayers: 30 },
    administrator: { id: "owner" },
    invitedPlayers: [
      {
        id: "me",
        name: "Frozen player",
        email: "frozen@example.test",
        avatarUrl: null,
        invitation: { status: "ACCEPTED" },
      },
      { id: "pending", invitation: { status: "PENDING" } },
    ],
  } as MatchDetailResponse;
  state.context.event.role = "visitor";
  state.bookings.error = new Error("membership gone");
  const view = hook(frozen);
  expect(view.result.current.frozen).toBe(true);
  expect(view.result.current.visitor).toBe(false);
  expect(view.result.current.seats[0].user).toMatchObject({
    userId: "me",
    name: "Frozen player",
    secondary: "frozen@example.test",
  });
  expect(view.result.current.seats.filter((s) => s.reserved)).toHaveLength(1);
  expect(view.result.current.loading).toBe(false);
  expect(view.result.current.error).toBeNull();
  expect(view.result.current.canJoin).toBe(false);
  await act(async () => {
    await view.result.current.advance();
  });
  expect(view.result.current.seats).toHaveLength(30);
  expect(state.bookings.fetchNextPage).not.toHaveBeenCalled();
});
