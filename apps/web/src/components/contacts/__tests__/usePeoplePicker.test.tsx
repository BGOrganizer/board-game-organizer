import {
  groupInviteesPageQuery,
  tableInviteesPageQuery,
  useEventRecordActions,
  useGroupRecordActions,
  usePeoplePicker,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = {
    apiUrl: "https://api.test",
    userId: "viewer",
    getToken: vi.fn(async () => "fresh"),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { options, client, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
it.each([true, false])(
  "source-pages Table invitees and search without falling back to contacts or Group rosters (friendsOnly=%s)",
  async (friendsOnly) => {
    const { options, wrapper } = setup();
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            items: [{ id: new URL(url).searchParams.has("cursor") ? "second" : "first" }],
            nextCursor: new URL(url).searchParams.has("cursor") ? null : "first",
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(
      ({ query, tableId }) =>
        usePeoplePicker(options, query, friendsOnly, "unrelated-group", {
          eventId: "event",
          tableId,
        }),
      { wrapper, initialProps: { query: "", tableId: "table" } },
    );
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.needsSearch).toBe(false);
    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(hook.result.current.items.map((row) => row.id)).toEqual(["first", "second"]),
    );
    hook.rerender({ query: "board", tableId: "table" });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    hook.rerender({ query: "board", tableId: "other" });
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("/tables/other/invitations"))).toBe(
        true,
      ),
    );
    expect(
      fetch.mock.calls.every(
        ([url]) => url.includes("/events/event/tables/") && url.includes("/invitations"),
      ),
    ).toBe(true);
    expect(options.getToken).toHaveBeenCalledTimes(4);
    expect(tableInviteesPageQuery(options, "event", "table", "board").queryKey).not.toEqual(
      tableInviteesPageQuery({ ...options, userId: "other" }, "event", "table", "board").queryKey,
    );
  },
);
it("optimistically excludes Table invitees, rolls failure back and preserves other Tables/identities", async () => {
  const { options, client, wrapper } = setup(),
    target = { eventId: "event", tableId: "table" },
    key = tableInviteesPageQuery(options, target.eventId, target.tableId).queryKey;
  const other = tableInviteesPageQuery(options, "event", "other").queryKey,
    foreign = tableInviteesPageQuery({ ...options, userId: "foreign" }, "event", "table").queryKey;
  const data = {
    pages: [
      {
        items: [{ id: "friend", name: "Friend", username: null, email: null, avatarUrl: null }],
        nextCursor: null,
      },
    ],
    pageParams: [""],
  };
  for (const k of [key, other, foreign]) client.setQueryData(k, data);
  let finish: ((r: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify(data.pages[0]))),
    ),
  );
  const hook = renderHook(
    () => ({
      picker: usePeoplePicker(options, "", false, undefined, target),
      actions: useEventRecordActions(options, "event"),
    }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.picker.items).toHaveLength(1));
  let pending: Promise<unknown> | undefined;
  act(() => {
    pending = hook.result.current.actions.invite
      .mutateAsync({ tableId: "table", userId: "friend" })
      .catch((e) => e);
  });
  await waitFor(() => expect(hook.result.current.picker.items).toEqual([]));
  expect(client.getQueryData(other)).toEqual(data);
  expect(client.getQueryData(foreign)).toEqual(data);
  await waitFor(() => expect(finish).toBeDefined());
  if (!finish) throw Error("Missing request");
  const complete = finish;
  await act(async () => {
    complete(new Response('{"code":"REGISTRATION_ALREADY_ACTIVE"}', { status: 409 }));
    await pending;
  });
  await waitFor(() =>
    expect(hook.result.current.picker.items.map((row) => row.id)).toEqual(["friend"]),
  );
});
it("source-pages Group invitees and their search without requesting unrestricted friendship/search lists", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify({
          items: [{ id: new URL(url).searchParams.has("cursor") ? "second" : "first" }],
          nextCursor: new URL(url).searchParams.has("cursor") ? null : "first",
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(({ query }) => usePeoplePicker(options, query, true, "group"), {
    wrapper,
    initialProps: { query: "" },
  });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  await act(async () => {
    await hook.result.current.fetchNextPage();
  });
  await waitFor(() =>
    expect(hook.result.current.items.map((row) => row.id)).toEqual(["first", "second"]),
  );
  hook.rerender({ query: "board" });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  expect(fetch.mock.calls.every(([url]) => url.includes("/groups/group/invitees"))).toBe(true);
  expect(
    new URL(fetch.mock.calls.at(-1)?.[0] ?? "https://api.test").searchParams.get("query"),
  ).toBe("board");
  expect(options.getToken).toHaveBeenCalledTimes(3);
});
it("hides an optimistic invitation, restores failures and does not touch another actor's candidate cache", async () => {
  const { options, wrapper, client } = setup(),
    key = groupInviteesPageQuery(options, "group").queryKey,
    foreign = groupInviteesPageQuery({ ...options, userId: "other" }, "group").queryKey;
  const data = {
    pages: [
      {
        items: [
          {
            id: "friend",
            name: "Friend",
            email: null,
            avatarUrl: null,
            presence: { online: false, lastActiveAt: new Date(0).toISOString() },
          },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [""],
  };
  client.setQueryData(key, data);
  client.setQueryData(foreign, data);
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify(data.pages[0]))),
    ),
  );
  const hook = renderHook(
    () => ({
      picker: usePeoplePicker(options, "", true, "group"),
      actions: useGroupRecordActions(options),
    }),
    { wrapper },
  );
  let pending: Promise<unknown> | undefined;
  act(() => {
    pending = hook.result.current.actions.invite
      .mutateAsync({ id: "group", userId: "friend" })
      .catch((error) => error);
  });
  await waitFor(() => expect(hook.result.current.picker.items).toEqual([]));
  expect(client.getQueryData(foreign)).toEqual(data);
  await waitFor(() => expect(finish).toBeDefined());
  if (!finish) throw new Error("Missing invitation request");
  const respond = finish;
  await act(async () => {
    respond(new Response('{"error":"MEMBERSHIP_ALREADY_ACTIVE"}', { status: 409 }));
    await pending;
  });
  await waitFor(() =>
    expect(hook.result.current.picker.items.map((row) => row.id)).toEqual(["friend"]),
  );
});
it("waits for four characters for general users, while friends initially source-page existing relationships", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("users/search")
            ? { users: [{ id: "searched" }], nextCursor: null }
            : { rows: [{ profile: { id: "friend" } }, { profile: null }], nextCursor: null },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const general = renderHook(({ query }) => usePeoplePicker(options, query, false), {
    wrapper,
    initialProps: { query: "abc" },
  });
  expect(general.result.current.needsSearch).toBe(true);
  expect(general.result.current.isPending).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  const friends = renderHook(() => usePeoplePicker(options, "", true), { wrapper });
  await waitFor(() => expect(friends.result.current.items).toEqual([{ id: "friend" }]));
  general.rerender({ query: "board" });
  await waitFor(() => expect(general.result.current.items).toEqual([{ id: "searched" }]));
  expect(new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("friendsOnly")).toBe("false");
});
it("keeps friend search paginated at source and resolves a fresh token for every page", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify({
          users: [{ id: new URL(url).searchParams.has("cursor") ? "second" : "first" }],
          nextCursor: new URL(url).searchParams.has("cursor") ? null : "first",
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => usePeoplePicker(options, "board", true), { wrapper });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  await act(async () => {
    await hook.result.current.fetchNextPage();
  });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(2));
  expect(options.getToken).toHaveBeenCalledTimes(2);
  for (const [url] of fetch.mock.calls)
    expect(new URL(url).searchParams.get("friendsOnly")).toBe("true");
  expect(fetch.mock.calls.some(([url]) => url.includes("relationships"))).toBe(false);
});
it("retains observable failures, supports retry, and never requests disabled/private unauthenticated data", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(async () => new Response('{"error":"FAILED"}', { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  renderHook(() => usePeoplePicker({ ...options, enabled: false }, "board", true), { wrapper });
  renderHook(() => usePeoplePicker({ ...options, userId: null }, "board", false), { wrapper });
  expect(fetch).not.toHaveBeenCalled();
  const hook = renderHook(() => usePeoplePicker(options, "board", false), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.error?.message).toBe("FAILED");
  fetch.mockResolvedValue(new Response('{"users":[],"nextCursor":null}'));
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(false));
});
