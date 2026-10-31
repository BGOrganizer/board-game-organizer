import { createPlannedEventSchema, type PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  useEventRecordActions,
  useEventRecords,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";

const options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
const secondGroup = "55555555-5555-4555-8555-555555555555";
const realId = "66666666-6666-4666-8666-666666666666";
const input = (name: string, groupId: string | null) =>
  createPlannedEventSchema.parse({
    groupId,
    name,
    timeZone: plannedEvent.timeZone,
    startTime: plannedEvent.startTime,
    dates: plannedEvent.dates,
    locations: plannedEvent.locations,
    tables: [
      {
        name: "First table",
        minPlayers: 2,
        maxPlayers: 4,
        rankingEnabled: false,
        games: [{ gameId: 1, manualDurationMinutes: 60 }],
      },
    ],
  });
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
it("deletion cancels held/queued children and their provisional rows, without locking or cancelling another Group", async () => {
  const { client, wrapper } = setup();
  let release: ((response: Response) => void) | undefined;
  const writes: string[] = [],
    saved: PlannedEventResponse[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (init?.method === "DELETE") return Response.json({ id: groupRecord.id, eventIds: [] });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        writes.push(body.name);
        if (body.name === "Held first")
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        const { tables, ...fields } = body;
        const row = {
          ...plannedEvent,
          ...fields,
          id: realId,
          groupType: "PRIVATE",
          groupName: "Other club",
          tableCount: tables.length,
        };
        saved.push(row);
        return Response.json(row);
      }
      if (path.startsWith("/api/groups/"))
        return Response.json({ ...groupRecord, id: path.split("/").at(-1) });
      return Response.json({ items: saved, nextCursor: null });
    }),
  );
  const hook = renderHook(
    () => ({
      events: useEventRecordActions(options, ""),
      groups: useGroupRecordActions(options, groupRecord.id),
      list: useEventRecords(options),
    }),
    { wrapper },
  );
  act(() => {
    hook.result.current.events.create.mutate(input("Held first", groupRecord.id));
    hook.result.current.events.create.mutate(input("Queued deleted child", groupRecord.id));
    hook.result.current.events.create.mutate(input("Independent child", secondGroup));
  });
  await waitFor(() => expect(release).toBeDefined());
  expect(hook.result.current.list.items).toHaveLength(3);
  act(() =>
    hook.result.current.groups.remove.mutate({
      id: groupRecord.id,
      input: { version: 1, deleteEvents: true },
    }),
  );
  await waitFor(() => expect(hook.result.current.groups.remove.isSuccess).toBe(true));
  await waitFor(() =>
    expect(hook.result.current.list.items.every((row) => row.groupId !== groupRecord.id)).toBe(
      true,
    ),
  );
  const respond = release;
  if (!respond) throw new Error("Missing held creation");
  await act(async () => respond(Response.json({ error: "CANCELLED" }, { status: 409 })));
  await waitFor(() => expect(writes).toEqual(["Held first", "Independent child"]));
  await waitFor(() => expect(hook.result.current.events.create.isSuccess).toBe(true));
  expect(hook.result.current.list.items.map((row) => row.name)).toEqual(["Independent child"]);
  hook.unmount();
  clearSessionQueryCache(client);
});
it.each([403, 404])(
  "a fresh denied parent read cancels its queued creation before POST, not an unrelated held creation: %s",
  async (status) => {
    const { client, wrapper } = setup();
    let release: ((response: Response) => void) | undefined;
    const writes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          writes.push(body.name);
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        if (new URL(url).pathname.startsWith("/api/groups/"))
          return Response.json({ error: "DENIED" }, { status });
        return Response.json({ items: [], nextCursor: null });
      }),
    );
    const hook = renderHook(
      ({ readParent }) => ({
        events: useEventRecordActions(options, ""),
        parent: useGroupRecord({ ...options, enabled: readParent }, groupRecord.id),
        list: useEventRecords({ ...options, enabled: false }),
      }),
      { wrapper, initialProps: { readParent: false } },
    );
    act(() => {
      hook.result.current.events.create.mutate(input("Held standalone", null));
      hook.result.current.events.create.mutate(input("Denied queued child", groupRecord.id));
    });
    await waitFor(() => expect(release).toBeDefined());
    hook.rerender({ readParent: true });
    await waitFor(() => expect(hook.result.current.parent.isError).toBe(true));
    await waitFor(() =>
      expect(hook.result.current.list.items.map((row) => row.name)).toEqual(["Held standalone"]),
    );
    const respond = release;
    if (!respond) throw new Error("Missing held unrelated creation");
    await act(async () => respond(Response.json({ error: "REJECTED" }, { status: 409 })));
    await waitFor(() => expect(hook.result.current.events.create.isError).toBe(true));
    expect(writes).toEqual(["Held standalone"]);
    hook.unmount();
    clearSessionQueryCache(client);
  },
);
it.each([200, 403, 404, 503])(
  "a write denial alone does not revoke a parent; a later fresh parent denial retires the obsolete creation: %s",
  async (parentStatus) => {
    const { client, wrapper } = setup();
    let written = false,
      posts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          written = true;
          posts++;
          return Response.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
        }
        if (new URL(url).pathname.startsWith("/api/groups/"))
          return written && parentStatus !== 200
            ? Response.json({ error: "PARENT_UNAVAILABLE" }, { status: parentStatus })
            : Response.json(groupRecord);
        return Response.json({ items: [], nextCursor: null });
      }),
    );
    const hook = renderHook(
      () => ({
        events: useEventRecordActions(options, ""),
        list: useEventRecords({ ...options, enabled: false }),
      }),
      { wrapper },
    );
    act(() =>
      hook.result.current.events.create.mutate(input("Racing child creation", groupRecord.id)),
    );
    if (parentStatus === 403 || parentStatus === 404)
      await waitFor(() => expect(hook.result.current.events.create.isError).toBe(true));
    else {
      await waitFor(() =>
        expect(hook.result.current.list.items[0]?.optimistic?.phase).toBe("verifying"),
      );
      expect(hook.result.current.events.create.isPending).toBe(true);
    }
    expect(posts).toBe(1);
    expect(hook.result.current.list.items).toHaveLength(
      parentStatus === 403 || parentStatus === 404 ? 0 : 1,
    );
    hook.unmount();
    clearSessionQueryCache(client);
  },
);
it.each([403, 404, 200])(
  "checks parent authorization before dispatch, suppressing obsolete drafts without inventing authority: %s",
  async (status) => {
    const { client, wrapper } = setup();
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (new URL(url).pathname.startsWith("/api/groups/"))
        return Response.json(
          status === 200 ? { ...groupRecord, canEdit: false } : { error: "DENIED" },
          { status },
        );
      if (init?.method === "POST") throw new Error("Unauthorized child POST");
      return Response.json({ items: [], nextCursor: null });
    });
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(
      () => ({
        events: useEventRecordActions(options, ""),
        list: useEventRecords({ ...options, enabled: false }),
      }),
      { wrapper },
    );
    act(() => hook.result.current.events.create.mutate(input("Denied child", groupRecord.id)));
    await waitFor(() => expect(hook.result.current.events.create.isError).toBe(true));
    expect(hook.result.current.list.items).toEqual([]);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    hook.unmount();
    clearSessionQueryCache(client);
  },
);
