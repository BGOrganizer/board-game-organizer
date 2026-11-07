import {
  clearSessionQueryCache,
  eventRecordKeys,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  optionId,
  plannedEvent,
  plannedTable,
  tableId,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventDeleteAction } from "../EventDeleteAction";

const mocks = vi.hoisted(() => ({ options: {} as Record<string, unknown>, replace: vi.fn() }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => mocks.options }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  mocks.options = options;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const event = { ...plannedEvent, tableCount: 2 },
    otherEvent = { ...event, id: optionId, name: "Other Event" };
  const sibling = { ...plannedTable, id: optionId, name: "Sibling table" },
    otherTable = { ...plannedTable, eventId: optionId, id: eventId, name: "Other table" };
  const page = (items: object[]) => ({ pages: [{ items, nextCursor: null }], pageParams: [""] });
  const eventKey = eventRecordKeys.list(options),
    tableKey = eventRecordKeys.tables(options, null),
    foreignKey = eventRecordKeys.tables({ ...options, userId: "foreign" }, null);
  const eventPage = page([event, otherEvent]),
    tablePage = page([plannedTable, sibling, otherTable]);
  client.setQueryData(eventKey, eventPage);
  client.setQueryData(tableKey, tablePage);
  client.setQueryData(foreignKey, tablePage);
  client.setQueryData(eventRecordKeys.detail(options, eventId), event);
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), plannedTable);
  return {
    client,
    options,
    wrapper,
    event,
    otherEvent,
    otherTable,
    sibling,
    eventKey,
    tableKey,
    foreignKey,
    tablePage,
    eventPage,
  };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it.each(["event", "table"] as const)(
  "confirms %s deletion, returns immediately with HTTP held, and reconciles only owned records",
  async (kind) => {
    const s = setup();
    let finish: ((response: Response) => void) | undefined;
    let committed = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (url.includes("/tables?"))
        return Response.json({
          items: committed
            ? kind === "event"
              ? [s.otherTable]
              : [s.sibling, s.otherTable]
            : s.tablePage.pages[0].items,
          nextCursor: null,
        });
      if (url.includes(`/events/${eventId}`))
        return Response.json(committed ? { ...s.event, version: 2, tableCount: 1 } : s.event);
      return Response.json({
        items: committed
          ? kind === "event"
            ? [s.otherEvent]
            : [{ ...s.event, version: 2, tableCount: 1 }, s.otherEvent]
          : s.eventPage.pages[0].items,
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetch);
    const state = renderHook(
      () => ({
        events: useQuery({
          queryKey: s.eventKey,
          queryFn: async ({ signal }) => ({
            pages: [
              await (await fetch("https://api.test/api/events?scope=mine", { signal })).json(),
            ],
            pageParams: [""],
          }),
          staleTime: Infinity,
        }),
        tables: useQuery({
          queryKey: s.tableKey,
          queryFn: async ({ signal }) => ({
            pages: [
              await (await fetch("https://api.test/api/tables?period=future", { signal })).json(),
            ],
            pageParams: [""],
          }),
          staleTime: Infinity,
        }),
        actions: useEventRecordActions(s.options, eventId),
      }),
      { wrapper: s.wrapper },
    );
    const label = kind === "event" ? "Delete event" : "Delete table";
    renderWithI18n(
      s.wrapper({
        children: (
          <EventDeleteAction event={s.event} table={kind === "table" ? plannedTable : undefined} />
        ),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith(kind === "table" ? `/events/${eventId}` : "/events");
    await waitFor(() => expect(finish).toBeDefined());
    const rows = () => (s.client.getQueryData(s.tableKey) as typeof s.tablePage).pages[0].items;
    expect(rows().some((row) => "id" in row && row.id === tableId)).toBe(false);
    expect(rows()).toContainEqual(s.otherTable);
    if (kind === "table") expect(rows()).toContainEqual(s.sibling);
    else expect(rows()).not.toContainEqual(s.sibling);
    expect(s.client.getQueryData(s.foreignKey)).toEqual(s.tablePage);
    expect(s.options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
    const write = fetch.mock.calls.find(([, init]) => init?.method === "DELETE")!;
    expect(JSON.parse(String(write[1]?.body))).toEqual({ version: 1 });
    await act(async () => {
      committed = true;
      finish!(
        Response.json(
          kind === "table"
            ? { ...s.event, version: 2, tableCount: 1 }
            : { id: eventId, groupId: null },
        ),
      );
    });
    await waitFor(() =>
      expect(
        s.client
          .getMutationCache()
          .findAll()
          .some((mutation) => mutation.state.status === "success"),
      ).toBe(true),
    );
    expect(
      s.client.getQueryData(eventRecordKeys.table(s.options, eventId, tableId)),
    ).toBeUndefined();
    if (kind === "event")
      expect(s.client.getQueryData(eventRecordKeys.detail(s.options, eventId))).toBeUndefined();
    else
      expect(s.client.getQueryData(eventRecordKeys.detail(s.options, eventId))).toMatchObject({
        version: 2,
        tableCount: 1,
      });
    expect(rows().some((row) => "id" in row && row.id === tableId)).toBe(false);
    expect(s.options.feedback.onSuccess).not.toHaveBeenCalled();
    state.unmount();
  },
);
it.each(["event", "table"] as const)(
  "rolls back rejected %s deletion without changing unrelated records or repeating success feedback",
  async (kind) => {
    const s = setup();
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "DELETE"
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Response.json(
              url.includes("/tables?")
                ? s.tablePage.pages[0]
                : url.includes(`/events/${eventId}`)
                  ? s.event
                  : s.eventPage.pages[0],
            ),
      ),
    );
    const hook = renderHook(() => useEventRecordActions(s.options, eventId), {
      wrapper: s.wrapper,
    });
    let pending!: Promise<unknown>;
    act(() => {
      pending = (
        kind === "event"
          ? hook.result.current.remove.mutateAsync({ version: 1 })
          : hook.result.current.removeTable.mutateAsync({ version: 1, tableId })
      ).catch((error) => error);
    });
    await waitFor(() => expect(finish).toBeDefined());
    expect(s.client.getQueryData(s.tableKey)).not.toEqual(s.tablePage);
    await act(async () => {
      finish!(Response.json({ error: "EVENT_CHANGED" }, { status: 409 }));
      await pending;
    });
    expect(s.client.getQueryData(s.tableKey)).toEqual(s.tablePage);
    expect(s.client.getQueryData(s.eventKey)).toEqual(s.eventPage);
    expect(s.client.getQueryData(s.foreignKey)).toEqual(s.tablePage);
    expect(s.options.feedback.onError).toHaveBeenCalledTimes(1);
    expect(s.options.feedback.onSuccess).not.toHaveBeenCalled();
  },
);
it.each(["event", "table"] as const)(
  "rolls back %s deletion while a later unrelated Event's Table deletion stays projected",
  async (kind) => {
    const s = setup(),
      writes: Array<{ url: string; resolve: (response: Response) => void }> = [];
    s.client.setQueryData(eventRecordKeys.detail(s.options, optionId), s.otherEvent);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "DELETE"
          ? new Promise<Response>((resolve) => writes.push({ url, resolve }))
          : Response.json(s.event),
      ),
    );
    const hook = renderHook(
      () => ({
        first: useEventRecordActions(s.options, eventId),
        second: useEventRecordActions(s.options, optionId),
      }),
      { wrapper: s.wrapper },
    );
    let first!: Promise<unknown>, second!: Promise<unknown>;
    act(() => {
      first = (
        kind === "event"
          ? hook.result.current.first.remove.mutateAsync({ version: 1 })
          : hook.result.current.first.removeTable.mutateAsync({ version: 1, tableId })
      ).catch(() => undefined);
      second = hook.result.current.second.removeTable
        .mutateAsync({ version: 1, tableId: s.otherTable.id })
        .catch(() => undefined);
    });
    await waitFor(() => expect(writes).toHaveLength(2));
    const primary = writes.find((write) => write.url.includes(`/events/${eventId}`))!,
      other = writes.find((write) => write !== primary)!;
    await act(async () => {
      primary.resolve(Response.json({ error: "EVENT_CHANGED" }, { status: 409 }));
      await first;
    });
    const rows = (s.client.getQueryData(s.tableKey) as typeof s.tablePage).pages[0].items;
    expect(rows).toContainEqual(plannedTable);
    expect(rows).toContainEqual(s.sibling);
    expect(rows).not.toContainEqual(s.otherTable);
    expect(s.client.getQueryData(s.foreignKey)).toEqual(s.tablePage);
    s.client.clear();
    await act(async () => {
      other.resolve(Response.json({ ...s.otherEvent, version: 2, tableCount: 1 }));
      await second;
    });
  },
);

it.each(["event", "table"] as const)(
  "never automatically retries unknown %s deletion",
  async (kind) => {
    const s = setup();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? Response.json({ error: "UNKNOWN" }, { status: 503 })
        : Response.json(s.event),
    );
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useEventRecordActions(s.options, eventId), {
      wrapper: s.wrapper,
    });
    act(() => {
      if (kind === "event") hook.result.current.remove.mutate({ version: 1 });
      else hook.result.current.removeTable.mutate({ version: 1, tableId });
    });
    await waitFor(() => expect(s.options.feedback.onError).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
    expect(s.options.feedback.onSuccess).not.toHaveBeenCalled();
    renderWithI18n(
      s.wrapper({
        children: (
          <EventDeleteAction event={s.event} table={kind === "table" ? plannedTable : undefined} />
        ),
      }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: kind === "table" ? "Delete table" : "Delete event",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await waitFor(() => expect(screen.getByText("Verifying")).toBeTruthy());
  },
);
it.each(["event", "table"] as const)(
  "ignores late %s deletion receipts after a same-actor session replacement",
  async (kind) => {
    const s = setup();
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "DELETE"
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Response.json(s.event),
      ),
    );
    const hook = renderHook(() => useEventRecordActions(s.options, eventId), {
      wrapper: s.wrapper,
    });
    let pending!: Promise<unknown>;
    act(() => {
      pending = (
        kind === "event"
          ? hook.result.current.remove.mutateAsync({ version: 1 })
          : hook.result.current.removeTable.mutateAsync({ version: 1, tableId })
      ).catch(() => undefined);
    });
    await waitFor(() => expect(finish).toBeDefined());
    clearSessionQueryCache(s.client);
    const nextKey = eventRecordKeys.list(s.options);
    s.client.setQueryData(nextKey, s.eventPage);
    await act(async () => {
      finish!(
        Response.json(
          kind === "event"
            ? { id: eventId, groupId: null }
            : { ...s.event, version: 2, tableCount: 1 },
        ),
      );
      await pending;
    });
    expect(s.client.getQueryData(nextKey)).toEqual(s.eventPage);
    expect(s.client.getQueryState(nextKey)?.isInvalidated).toBe(false);
    expect(s.options.feedback.onError).not.toHaveBeenCalled();
    expect(s.options.feedback.onSuccess).not.toHaveBeenCalled();
  },
);
it.each(["event-id", "table-id", "table-version"] as const)(
  "requires matching authoritative deletion receipts: %s",
  async (reason) => {
    const s = setup();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? Response.json(
            reason === "event-id"
              ? { id: "foreign", groupId: null }
              : {
                  ...s.event,
                  id: reason === "table-id" ? "foreign" : eventId,
                  version: 3,
                  tableCount: 1,
                },
          )
        : Response.json(s.event),
    );
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useEventRecordActions(s.options, eventId), {
      wrapper: s.wrapper,
    });
    act(() => {
      if (reason === "event-id") hook.result.current.remove.mutate({ version: 1 });
      else hook.result.current.removeTable.mutate({ version: 1, tableId });
    });
    await waitFor(() => expect(s.options.feedback.onError).toHaveBeenCalled());
    expect(s.options.feedback.onError.mock.calls[0][0]).toMatchObject({
      message: "MUTATION_READ_UNVERIFIED",
    });
    expect(s.client.getQueryData(eventRecordKeys.detail(s.options, eventId))).toMatchObject({
      version: 1,
    });
    expect(s.client.getQueryData(s.foreignKey)).toEqual(s.tablePage);
    expect(s.options.feedback.onSuccess).not.toHaveBeenCalled();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  },
);

it.each(["viewer", "confirmed", "terminated", "foreign-table"] as const)(
  "never exposes deletion to %s",
  (reason) => {
    const s = setup();
    const event =
      reason === "viewer"
        ? { ...s.event, adminUserId: "someone-else" }
        : reason === "confirmed" || reason === "terminated"
          ? {
              ...s.event,
              status: reason === "confirmed" ? ("CONFIRMED" as const) : ("TERMINATED" as const),
            }
          : s.event;
    renderWithI18n(
      s.wrapper({
        children: (
          <EventDeleteAction
            event={event}
            table={reason === "foreign-table" ? { ...plannedTable, eventId: "foreign" } : undefined}
          />
        ),
      }),
    );
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  },
);
it("closes confirmation after canonical version/access changes instead of silently rebasing deletion", async () => {
  const s = setup();
  const view = renderWithI18n(s.wrapper({ children: <EventDeleteAction event={s.event} /> }));
  fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  view.rerender(s.wrapper({ children: <EventDeleteAction event={{ ...s.event, version: 2 }} /> }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
  view.rerender(
    s.wrapper({
      children: <EventDeleteAction event={{ ...s.event, version: 2, canEdit: false }} />,
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("disables stale/uneditable and last-Table deletion, but keeps whole-Event deletion available", () => {
  const s = setup();
  const view = renderWithI18n(
    s.wrapper({
      children: <EventDeleteAction event={{ ...s.event, tableCount: 1 }} table={plannedTable} />,
    }),
  );
  expect((screen.getByRole("button", { name: "Delete table" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(
    document.getElementById(
      screen.getByRole("button", { name: "Delete table" }).getAttribute("aria-describedby")!,
    )?.textContent,
  ).toContain("at least one table");
  view.rerender(
    s.wrapper({ children: <EventDeleteAction event={{ ...s.event, canEdit: false }} /> }),
  );
  expect((screen.getByRole("button", { name: "Delete event" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  view.rerender(s.wrapper({ children: <EventDeleteAction event={s.event} disabled /> }));
  expect((screen.getByRole("button", { name: "Delete event" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
