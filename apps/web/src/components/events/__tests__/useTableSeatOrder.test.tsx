import { eventRecordKeys, eventTableRoster, useTableSeatOrder } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventSeatOrderEditor } from "../EventSeatOrderEditor";

const snapshot = () => ({
  version: 1,
  allocationKey: "a".repeat(64),
  capacity: 2,
  seatedCount: 2,
  registrations: ["a", "b", "c"].map((user, index) => ({
    ...seat(user),
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    sequence: index,
    locked: false,
  })),
});
function setup(userId = "manager") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const o = {
    apiUrl: "https://api.test",
    userId,
    getToken: vi.fn().mockResolvedValueOnce("first").mockResolvedValue("fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { o, wrapper, client };
}
afterEach(() => vi.unstubAllGlobals());
it("keeps moves and locks local, protects boundaries, saves with a fresh token, and resets only unsaved work", async () => {
  const state = snapshot();
  const fetch = vi.fn().mockImplementation(
    async (_url: string, init: RequestInit) =>
      new Response(
        JSON.stringify(
          init.method === "PATCH"
            ? {
                ...state,
                version: 2,
                registrations: JSON.parse(String(init.body)).registrations.map(
                  (row: { id: string; locked: boolean }) => ({
                    ...state.registrations.find((item) => item.id === row.id),
                    ...row,
                  }),
                ),
              }
            : state,
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const f = setup();
  const { result } = renderHook(
    () => useTableSeatOrder(f.o, { ...plannedTable, canManage: true, eventVersion: 1 }),
    { wrapper: f.wrapper },
  );
  await act(() => result.current.start());
  expect(result.current.canMove(0, -1)).toBe(false);
  expect(result.current.canMove(2, 1)).toBe(false);
  act(() => result.current.lock(1));
  expect(result.current.canMove(1, 1)).toBe(false);
  act(() => result.current.lock(1));
  act(() => result.current.move(2, -1));
  expect(result.current.rows.map((row) => row.userId)).toEqual(["a", "c", "b"]);
  expect(fetch).toHaveBeenCalledOnce();
  await act(() => result.current.save());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetch.mock.calls[1][1].body)).allocationKey).toBe(state.allocationKey);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh");
  expect(f.o.feedback.onOptimisticUpdate).toHaveBeenCalledWith("reorder_table_seats");
  act(() => result.current.reset());
  expect(result.current.rows.map((row) => row.userId)).toEqual(["a", "c", "b"]);
  f.client.clear();
});
it("retains a stale draft for review and refuses to overwrite a changed roster", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(snapshot()))),
  );
  const f = setup();
  const { result, rerender } = renderHook(
    ({ version }) =>
      useTableSeatOrder(f.o, { ...plannedTable, canManage: true, eventVersion: version }),
    { wrapper: f.wrapper, initialProps: { version: 1 } },
  );
  await act(() => result.current.start());
  act(() => result.current.move(2, -1));
  rerender({ version: 2 });
  expect(result.current.stale).toBe(true);
  await act(() => result.current.save());
  expect(fetch).toHaveBeenCalledOnce();
  expect(result.current.rows[1].userId).toBe("c");
  f.client.clear();
});

it("fills a free seat from the first waiting player without moving a pending reservation or locked neighbor", async () => {
  const state = snapshot();
  state.capacity = 4;
  state.seatedCount = 2;
  state.registrations[1].status = "PENDING";
  state.registrations[0].locked = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(state)),
  );
  const f = setup();
  const { result } = renderHook(
    () => useTableSeatOrder(f.o, { ...plannedTable, canManage: true, eventVersion: 1 }),
    { wrapper: f.wrapper },
  );
  await act(() => result.current.start());
  expect(result.current.canMove(2, -1)).toBe(true);
  act(() => result.current.move(2, -1));
  expect(result.current.seatedCount).toBe(3);
  expect(result.current.rows.map((row) => row.userId)).toEqual(["a", "b", "c"]);
  act(() => result.current.lock(2));
  expect(result.current.rows[2].locked).toBe(true);
  act(() => result.current.reset());
  expect(result.current.seatedCount).toBe(2);
  expect(result.current.rows[2].locked).toBe(false);
  f.client.clear();
});

it("aborts the transient roster read and rejects late data when management access is lost", async () => {
  let finish = (_value: Response) => {};
  const fetcher = vi.fn(
    (_url: string, _init: RequestInit) =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const f = setup();
  const { result, rerender } = renderHook(
    ({ canManage }) => useTableSeatOrder(f.o, { ...plannedTable, eventVersion: 1, canManage }),
    { wrapper: f.wrapper, initialProps: { canManage: true } },
  );
  await act(async () => {
    void result.current.start();
  });
  expect(fetcher).toHaveBeenCalledOnce();
  const signal = fetcher.mock.calls[0][1].signal;
  rerender({ canManage: false });
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(Response.json(snapshot())));
  expect(result.current.rows).toEqual([]);
  expect(result.current.editing).toBe(false);
  f.client.clear();
});

it("retains a catalog-conflicted draft until a fresh review succeeds even if Event version is unchanged", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(snapshot()))
    .mockResolvedValueOnce(Response.json({ error: "EVENT_CHANGED" }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ error: "UNAVAILABLE" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ...snapshot(), allocationKey: "b".repeat(64) }));
  vi.stubGlobal("fetch", fetcher);
  const f = setup();
  const { result } = renderHook(
    () => useTableSeatOrder(f.o, { ...plannedTable, canManage: true, eventVersion: 1 }),
    { wrapper: f.wrapper },
  );
  await act(() => result.current.start());
  act(() => result.current.move(2, -1));
  await act(() => result.current.save());
  expect(result.current.stale).toBe(true);
  expect(result.current.rows.map((row) => row.userId)).toEqual(["a", "c", "b"]);
  await act(() => result.current.start());
  expect(result.current.stale).toBe(true);
  await act(() => result.current.save());
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(() => result.current.start());
  expect(result.current.stale).toBe(false);
  expect(result.current.rows.map((row) => row.userId)).toEqual(["a", "b", "c"]);
  f.client.clear();
});

it.each(["manager", "a"])(
  "reconciles the authoritative saved order before a failed roster refresh (%s)",
  async (actor) => {
    const state = snapshot();
    const saved = {
      ...state,
      version: 2,
      registrations: [state.registrations[0], state.registrations[2], state.registrations[1]].map(
        (row, sequence) => ({ ...row, sequence, version: 2 }),
      ),
    };
    const fetcher = vi
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) =>
        init.method === "PATCH" ? Response.json(saved) : Response.json(state),
      );
    vi.stubGlobal("fetch", fetcher);
    const f = setup(actor);
    const table = {
      ...plannedTable,
      canManage: true,
      eventVersion: 1,
      seatedCount: 2,
      waitingCount: 1,
    };
    const tableKey = eventRecordKeys.table(f.o, table.eventId, table.id);
    const seatsKey = [...eventRecordKeys.root(f.o), "seats", table.eventId, table.id, false, ""];
    f.client.setQueryData(tableKey, table);
    f.client.setQueryData(seatsKey, {
      pages: [{ items: state.registrations, nextCursor: null }],
      pageParams: [""],
    });
    const { result } = renderHook(() => useTableSeatOrder(f.o, table), { wrapper: f.wrapper });
    await act(() => result.current.start());
    act(() => result.current.move(2, -1));
    await act(() => result.current.save());
    fetcher.mockImplementation(async () =>
      Response.json({ error: "UNAVAILABLE" }, { status: 503 }),
    );
    await act(async () => {
      await expect(
        f.client.fetchQuery({
          queryKey: seatsKey,
          retry: false,
          queryFn: async () => {
            const response = await fetch("https://api.test/roster");
            if (!response.ok) throw new Error("unavailable");
            return response.json();
          },
        }),
      ).rejects.toThrow("unavailable");
    });
    const cached = f.client.getQueryData<{ pages: Array<{ items: typeof state.registrations }> }>(
      seatsKey,
    )!;
    const cachedTable = f.client.getQueryData<typeof table>(tableKey)!;
    expect(result.current.editing).toBe(false);
    expect(cachedTable.eventVersion).toBe(2);
    expect(cachedTable.occupiedSeatIndices).toEqual([0, 1]);
    expect(cached.pages[0].items.map((row) => row.seatIndex)).toEqual([0, null, 1]);
    if (actor === "a") expect(cachedTable.myRegistration?.seatIndex).toBe(0);
    expect(
      eventTableRoster(cachedTable, cached.pages[0].items, [], actor, 20).rows.flatMap((row) =>
        row.kind === "player" ? [row.user.userId] : [],
      ),
    ).toEqual(["a", "c", "b"]);
    f.client.clear();
  },
);

it.each([
  [2, "table"],
  [3, "table"],
  [2, "event"],
] as const)(
  "does not overwrite newer allocation with a delayed receipt at row version %s and %s epoch",
  async (freshVersion, epochSource) => {
    const state = snapshot();
    let finish = (_response: Response) => {};
    const fetcher = vi.fn().mockImplementation(async (_url: string, init: RequestInit) =>
      init.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Response.json(state),
    );
    vi.stubGlobal("fetch", fetcher);
    const f = setup();
    const table = { ...plannedTable, canManage: true, eventVersion: 1 };
    const tableKey = eventRecordKeys.table(f.o, table.eventId, table.id);
    const seatsKey = [...eventRecordKeys.root(f.o), "seats", table.eventId, table.id, false, ""];
    f.client.setQueryData(tableKey, table);
    f.client.setQueryData(seatsKey, {
      pages: [{ items: state.registrations, nextCursor: null }],
      pageParams: [""],
    });
    const { result } = renderHook(() => useTableSeatOrder(f.o, table), { wrapper: f.wrapper });
    await act(() => result.current.start());
    act(() => result.current.move(2, -1));
    await act(async () => {
      void result.current.save();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const fresh = state.registrations.map((row, index) => ({
      ...row,
      version: freshVersion,
      locked: freshVersion === 3 && index === 0,
      seatIndex: index === 0 ? 1 : index === 1 ? null : 0,
    }));
    await act(async () => {
      await f.client.fetchQuery({
        queryKey: tableKey,
        queryFn: async () => ({
          ...table,
          eventVersion: epochSource === "table" ? 3 : 1,
          waitingCount: 1,
        }),
      });
      await f.client.fetchQuery({
        queryKey: seatsKey,
        queryFn: async () => ({ pages: [{ items: fresh, nextCursor: null }], pageParams: [""] }),
      });
      if (epochSource === "event")
        await f.client.fetchQuery({
          queryKey: eventRecordKeys.detail(f.o, table.eventId),
          queryFn: async () => ({ ...plannedEvent, id: table.eventId, version: 3 }),
        });
      finish(
        Response.json({
          ...state,
          version: 2,
          registrations: [
            state.registrations[0],
            state.registrations[2],
            state.registrations[1],
          ].map((row, sequence) => ({ ...row, sequence, version: 2 })),
        }),
      );
    });
    expect(f.client.getQueryData<typeof table & { waitingCount: number }>(tableKey)).toMatchObject({
      eventVersion: epochSource === "table" ? 3 : 1,
      waitingCount: 1,
    });
    expect(
      f.client.getQueryData<{ pages: Array<{ items: typeof fresh }> }>(seatsKey)?.pages[0].items,
    ).toEqual(fresh);
    f.client.clear();
  },
);

it("keeps the two roster lists and updates avatar roles when crossing their boundary", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(snapshot())),
  );
  const f = setup();
  function Editor() {
    const model = useTableSeatOrder(f.o, { ...plannedTable, canManage: true, eventVersion: 1 });
    return (
      <>
        <button type="button" onClick={() => void model.start()}>
          Edit roster
        </button>
        <EventSeatOrderEditor model={model} />
      </>
    );
  }
  renderWithI18n(
    <f.wrapper>
      <Editor />
    </f.wrapper>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Edit roster"));
  });
  const seats = screen.getByRole("region", { name: "Seats list" });
  const waiting = screen.getByRole("region", { name: "Waiting list" });
  const lock = within(seats).getAllByRole("button", { name: "Lock player" })[0];
  expect(lock.parentElement?.style.top).not.toBe("");
  fireEvent.click(lock);
  expect(within(seats).getByRole("button", { name: "Unlock player" })).toBeTruthy();
  fireEvent.click(within(seats).getByRole("button", { name: "Unlock player" }));
  const before = within(waiting).getByRole("button", { name: "Move up" }).closest("li")!;
  expect(within(before).getByRole("button", { name: /Player on the waiting list/ })).toBeTruthy();
  fireEvent.click(within(before).getByRole("button", { name: "Move up" }));
  expect(within(seats).getAllByRole("button", { name: /Confirmed player/ })).toHaveLength(2);
  expect(within(waiting).getByRole("button", { name: /Player on the waiting list/ })).toBeTruthy();
  const promoted = within(seats).getAllByRole("listitem")[1];
  expect(promoted.textContent).toContain("c");
  expect(within(promoted).queryByRole("button", { name: /Player on the waiting list/ })).toBeNull();
  const help = screen.getByText(/Locked places stay fixed/);
  expect(help.compareDocumentPosition(seats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Discard unsaved order" }));
  expect(within(waiting).getAllByRole("listitem")[0].textContent).toContain("c");
  f.client.clear();
});

it("preserves a pending anchor, swaps across it and saves an explicit empty place with an initially empty queue", async () => {
  const original = snapshot();
  const state = {
    ...original,
    capacity: 4,
    seatedCount: 3,
    registrations: original.registrations.map((row, index) => ({
      ...row,
      seatIndex: index,
      status: index === 1 ? "PENDING" : "ACCEPTED",
      locked: index === 1,
    })),
  };
  const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
    Response.json(
      init.method === "PATCH"
        ? {
            ...state,
            version: 2,
            seatedCount: 2,
            registrations: JSON.parse(String(init.body)).registrations.map(
              (r: { id: string; seatIndex: number | null }) => ({
                ...state.registrations.find((row) => row.id === r.id),
                ...r,
              }),
            ),
          }
        : state,
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const f = setup();
  const { result } = renderHook(
    () => useTableSeatOrder(f.o, { ...plannedTable, canManage: true, eventVersion: 1 }),
    { wrapper: f.wrapper },
  );
  await act(() => result.current.start());
  expect(result.current.canMove(0, 1)).toBe(true);
  act(() => result.current.move(0, 1));
  expect(result.current.rows.map((r) => [r.userId, r.seatIndex])).toEqual([
    ["c", 0],
    ["b", 1],
    ["a", 2],
  ]);
  act(() => result.current.sendToWaiting(0));
  expect(result.current.rows.map((r) => [r.userId, r.seatIndex])).toEqual([
    ["b", 1],
    ["a", 2],
    ["c", null],
  ]);
  expect(result.current.places.seated[0]).toMatchObject({ kind: "empty", first: 0, last: 0 });
  expect(result.current.seatedCount).toBe(2);
  act(() => result.current.lock(0));
  expect(result.current.rows[0]).toMatchObject({ status: "PENDING", locked: false, seatIndex: 1 });
  act(() => result.current.lock(0));
  await act(() => result.current.save());
  const input = JSON.parse(String(fetcher.mock.calls[1][1].body));
  expect(input.seatedCount).toBe(2);
  expect(input.registrations.map((r: { seatIndex: number | null }) => r.seatIndex)).toEqual([
    1,
    2,
    null,
  ]);
  expect(result.current.rows[0]).toMatchObject({ status: "PENDING", locked: true, seatIndex: 1 });
  expect(result.current.editing).toBe(false);
  f.client.clear();
});

it("accepts a fresh canonical review newer than the cached Table epoch after a conflict", async () => {
  const state = snapshot();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(state))
    .mockResolvedValueOnce(Response.json({ error: "EVENT_CHANGED" }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ ...state, version: 2, allocationKey: "b".repeat(64) }))
    .mockResolvedValueOnce(Response.json({ ...state, version: 3 }));
  vi.stubGlobal("fetch", fetcher);
  const f = setup();
  const { result } = renderHook(
    () => useTableSeatOrder(f.o, { ...plannedTable, canManage: true, eventVersion: 1 }),
    { wrapper: f.wrapper },
  );
  await act(() => result.current.start());
  await act(() => result.current.save());
  expect(result.current.stale).toBe(true);
  await act(() => result.current.start());
  expect(result.current.stale).toBe(false);
  await act(() => result.current.save());
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(JSON.parse(String(fetcher.mock.calls[3][1].body)).version).toBe(2);
  expect(result.current.editing).toBe(false);
  f.client.clear();
});
