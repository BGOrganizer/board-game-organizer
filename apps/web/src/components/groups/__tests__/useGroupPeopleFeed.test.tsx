import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  groupRecordKeys,
  useGroupPeopleFeed,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const group: GroupRecordResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "owner",
  type: "PRIVATE",
  approved: { name: "Game Club" },
  reservedNames: [],
  version: 1,
  name: "Game Club",
  logo: null,
  role: "admin",
  myMembership: null,
  createdAt: "2027-01-01T00:00:00Z",
  updatedAt: "2027-01-01T00:00:00Z",
  memberCount: 1,
  eventCount: 0,
  canViewMembers: true,
  canViewEvents: true,
  canViewRankings: true,
  canSocialInteract: true,
  canInvite: true,
  canEdit: true,
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
it("reveals cached accepted and pending sources progressively before exclusions, without refetching retained pages", async () => {
  const { client, options, wrapper } = setup();
  const person = (userId: string, mode: "accepted" | "pending" | "bans"): GroupPersonResponse => ({
    userId,
    name: userId,
    username: userId,
    avatarUrl: null,
    isAdmin: false,
    membership:
      mode === "bans"
        ? null
        : {
            id: group.id,
            groupId: group.id,
            userId,
            kind: "INVITATION",
            status: mode === "accepted" ? "ACCEPTED" : "PENDING",
            version: 1,
            createdAt: group.createdAt,
            updatedAt: group.updatedAt,
          },
    ban:
      mode === "bans"
        ? {
            id: group.id,
            groupId: group.id,
            userId,
            adminUserId: "owner",
            until: null,
            createdAt: group.createdAt,
            updatedAt: group.updatedAt,
          }
        : null,
  });
  for (const mode of ["accepted", "pending", "bans"] as const)
    client.setQueryData(groupRecordKeys.people(options, group.id, mode, ""), {
      pages: Array.from({ length: mode === "bans" ? 1 : 2 }, (_, page) => ({
        items: Array.from({ length: mode === "accepted" ? 20 : 1 }, (_, index) =>
          person(`${mode}-${page}-${index}`, mode),
        ),
        nextCursor: mode !== "bans" && !page ? "next" : null,
      })),
      pageParams: mode === "bans" ? [""] : ["", "next"],
    });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => useGroupPeopleFeed(options, group), { wrapper });
  expect(hook.result.current.items).toHaveLength(20);
  expect(hook.result.current.items.every((person) => person.userId.startsWith("accepted"))).toBe(
    true,
  );
  await act(async () => hook.result.current.fetchNextPage());
  await waitFor(() => expect(hook.result.current.items).toHaveLength(41));
  expect(hook.result.current.items.some((person) => person.ban)).toBe(false);
  await act(async () => hook.result.current.fetchNextPage());
  await waitFor(() => expect(hook.result.current.items).toHaveLength(43));
  expect(hook.result.current.items.at(-1)?.userId).toBe("bans-0-0");
  expect(hook.result.current.hasNextPage).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  hook.unmount();
  const reentry = renderHook(() => useGroupPeopleFeed(options, group), { wrapper });
  expect(reentry.result.current.items).toHaveLength(20);
  expect(reentry.result.current.hasNextPage).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps an acknowledged off-page invitation visible until canonical paging catches up, then drops a remotely removed invitation", async () => {
  const { client, options, wrapper } = setup();
  const membership = {
    id: "22222222-2222-4222-8222-222222222222",
    groupId: group.id,
    userId: "friend",
    kind: "INVITATION",
    status: "PENDING",
    version: 1,
    createdAt: "2030-06-01T10:00:00Z",
    updatedAt: "2030-06-01T10:00:00Z",
  };
  const friend = {
    userId: "friend",
    name: "Known friend",
    username: "friend",
    avatarUrl: null,
    isAdmin: false,
    ban: null,
    membership,
  };
  let pendingItems = [friend],
    release: ((response: Response) => void) | undefined;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST")
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    const q = new URL(url).searchParams,
      mode = q.get("mode");
    if (!mode) return Response.json({ ...group, version: 2 });
    if (mode === "accepted")
      return Response.json({ items: [], nextCursor: q.has("cursor") ? null : "next" });
    return Response.json({ items: mode === "pending" ? pendingItems : [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(
    () => ({
      feed: useGroupPeopleFeed(options, group),
      actions: useGroupRecordActions(options, group.id),
    }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.feed.hasNextPage).toBe(true));
  act(() =>
    hook.result.current.actions.invite.mutate({
      id: group.id,
      userId: "friend",
      person: { name: "Known friend", username: "friend", avatarUrl: null },
    }),
  );
  await waitFor(() => expect(release).toBeDefined());
  expect(hook.result.current.feed.items[0]).toMatchObject({
    userId: "friend",
    membership: null,
    optimisticInvited: true,
  });
  const respond = release;
  if (!respond) throw new Error("Missing invite receipt");
  await act(async () => respond(Response.json(membership)));
  await waitFor(() => expect(hook.result.current.actions.invite.isSuccess).toBe(true));
  expect(hook.result.current.feed.items).toMatchObject([
    { userId: "friend", membership: { id: membership.id, status: "PENDING" } },
  ]);
  expect(hook.result.current.feed.items[0].optimisticInvited).toBeUndefined();
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("mode") === "pending"),
  ).toBe(false);
  await act(async () => {
    await hook.result.current.feed.fetchNextPage();
  });
  await waitFor(() => expect(hook.result.current.feed.hasNextPage).toBe(false));
  expect(hook.result.current.feed.items.filter((row) => row.userId === "friend")).toHaveLength(1);
  pendingItems = [];
  act(() => hook.result.current.feed.refetch());
  await waitFor(() => expect(hook.result.current.feed.items).toEqual([]));
  hook.unmount();
  clearSessionQueryCache(client);
});
it.each([false, true])(
  "a later target mutation supersedes a staged invitation receipt, but definite rejection restores it: commit=%s",
  async (committed) => {
    const { client, options, wrapper } = setup();
    client.setQueryData(groupRecordKeys.people(options, group.id, "accepted", ""), {
      pages: [{ items: [], nextCursor: "next" }],
      pageParams: [""],
    });
    const variables = {
      id: group.id,
      userId: "friend",
      person: { name: "Friend name", username: "friend", avatarUrl: null },
    };
    const receipt = {
      id: "22222222-2222-4222-8222-222222222222",
      groupId: group.id,
      userId: "friend",
      kind: "INVITATION",
      status: "PENDING",
      version: 1,
      createdAt: "2030-06-01T10:00:00Z",
      updatedAt: "2030-06-01T10:00:00Z",
    };
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: groupRecordKeys.mutation(options, group.id, "invite"),
        mutationFn: async () => receipt,
      })
      .execute(variables);
    const hook = renderHook(() => useGroupPeopleFeed(options, group), { wrapper });
    expect(hook.result.current.items.map((row) => row.userId)).toEqual(["friend"]);
    await act(async () => {
      await client
        .getMutationCache()
        .build(client, {
          mutationKey: groupRecordKeys.mutation(options, group.id, "membership"),
          mutationFn: async () => {
            if (!committed) throw Object.assign(new Error("Rejected"), { status: 409 });
            return { ...receipt, status: "LEFT", version: 2 };
          },
        })
        .execute({ id: group.id, userId: "friend", input: { action: "remove", version: 1 } })
        .catch(() => undefined);
    });
    await waitFor(() =>
      expect(hook.result.current.items.map((row) => row.userId)).toEqual(
        committed ? [] : ["friend"],
      ),
    );
    hook.unmount();
    clearSessionQueryCache(client);
  },
);
it("never exposes cached rosters after access revocation, or cached pending/bans to invitees", async () => {
  const { client, options, wrapper } = setup(),
    fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const mode of ["accepted", "pending", "bans"] as const)
    client.setQueryData(groupRecordKeys.people(options, group.id, mode, ""), {
      pages: [
        {
          items: [
            {
              userId: mode,
              membership: { status: mode === "accepted" ? "ACCEPTED" : "PENDING" },
              ban: mode === "bans" ? { id: "ban" } : null,
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [""],
    });
  const hook = renderHook(({ value }) => useGroupPeopleFeed(options, value), {
    wrapper,
    initialProps: { value: group },
  });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(3));
  hook.rerender({ value: { ...group, role: "invited" } });
  expect(hook.result.current.items.map((row) => row.userId)).toEqual(["accepted"]);
  hook.rerender({ value: { ...group, canViewMembers: false } });
  expect(hook.result.current.items).toEqual([]);
  expect(hook.result.current.isPending).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it("finishes each source before loading pending invitations and exclusions, with observable failures and retry", async () => {
  const { options, wrapper } = setup();
  let fail = true;
  const fetch = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams,
      mode = params.get("mode");
    return mode === "pending" && fail
      ? new Response('{"error":"FAILED"}', { status: 503 })
      : new Response(
          JSON.stringify({
            items: [
              {
                userId: `${mode}${params.get("cursor") ?? ""}`,
                membership: { status: mode === "accepted" ? "ACCEPTED" : "PENDING" },
                ban: mode === "bans" ? { id: "ban" } : null,
              },
            ],
            nextCursor: mode === "accepted" && !params.has("cursor") ? "next" : null,
          }),
        );
  });
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => useGroupPeopleFeed(options, group), { wrapper });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  expect(fetch.mock.calls).toHaveLength(1);
  await act(async () => {
    await hook.result.current.fetchNextPage();
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.items).toHaveLength(2);
  fail = false;
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(4));
  expect(hook.result.current.hasNextPage).toBe(false);
});

it("applies the active group search to pending invites without inventing missing identity fields", async () => {
  const { client, options, wrapper } = setup();
  const selected = "historic-player";
  const writes: unknown[] = [];
  let finish: (response: Response) => void = () => {
    throw new Error("Expected a pending Group invitation");
  };
  const invitation = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (init?.method === "POST") {
        expect(url.pathname).toBe(`/api/groups/${group.id}/members`);
        writes.push(JSON.parse(String(init.body)));
        return invitation;
      }
      if (url.pathname.endsWith("/members"))
        return Response.json({ items: [], nextCursor: "later" });
      if (url.pathname === `/api/groups/${group.id}`) return Response.json(group);
      throw new Error(`Unexpected Group feed request: ${url.pathname}`);
    }),
  );
  const view = renderHook(
    ({ query }) => ({
      feed: useGroupPeopleFeed(options, group, query),
      actions: useGroupRecordActions(options, group.id),
    }),
    { wrapper, initialProps: { query: "historic" } },
  );
  await waitFor(() => expect(view.result.current.feed.hasNextPage).toBe(true));
  act(() => view.result.current.actions.invite.mutate({ id: group.id, userId: selected }));
  await waitFor(() => expect(writes).toEqual([{ userId: selected }]));
  expect(view.result.current.feed.items).toMatchObject([
    {
      userId: selected,
      name: null,
      username: null,
      avatarUrl: null,
      membership: null,
      optimisticInvited: true,
    },
  ]);
  view.rerender({ query: "different" });
  expect(view.result.current.feed.items).toEqual([]);
  view.rerender({ query: "historic" });
  expect(view.result.current.feed.items).toHaveLength(1);
  await act(() => finish(Response.json({ error: "Invite rejected" }, { status: 422 })));
  await waitFor(() => expect(view.result.current.actions.invite.isError).toBe(true));
  expect(view.result.current.feed.items).toEqual([]);
  expect(writes).toHaveLength(1);
  view.unmount();
  clearSessionQueryCache(client);
});
