import type {
  GroupMembership,
  GroupPersonResponse,
  GroupRecordResponse,
} from "@board-game-organizer/schemas";
import {
  groupMembershipFeedback,
  groupRecordKeys,
  useGroupPeople,
  useGroupRecord,
  useGroupRecordActions,
  useGroupRecords,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const id = "11111111-1111-4111-8111-111111111111",
  otherId = "22222222-2222-4222-8222-222222222222";
const at = "2027-01-01T00:00:00Z";
const group = {
  id,
  type: "PRIVATE",
  adminUserId: "owner",
  approved: { name: "Board Club" },
  reservedNames: [],
  version: 1,
  createdAt: at,
  updatedAt: at,
  name: "Board Club",
  logo: null,
  role: "admin",
  myMembership: null,
  memberCount: 1,
  eventCount: 0,
  canEdit: true,
  canViewMembers: true,
  canViewEvents: true,
  canViewRankings: true,
  canSocialInteract: true,
  canInvite: true,
  canRequest: false,
  canLeave: false,
  canReview: false,
} as GroupRecordResponse;
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
function page(items: unknown[], nextCursor: string | null = null) {
  return { pages: [{ items, nextCursor }], pageParams: [""] };
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("unified group Query ownership", () => {
  it("pages searches at source, fetches fresh credentials each time, and never keys by rotating JWT", async () => {
    const { options, wrapper } = setup();
    options.getToken.mockResolvedValueOnce("first-token").mockResolvedValueOnce("second-token");
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            items: [{ ...group, id: fetch.mock.calls.length === 1 ? id : otherId }],
            nextCursor: fetch.mock.calls.length === 1 ? "next" : null,
          }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useGroupRecords(options, "public", "club"), { wrapper });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    await act(() => hook.result.current.fetchNextPage());
    await waitFor(() => expect(hook.result.current.items).toHaveLength(2));
    expect(options.getToken).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("query"))).toEqual(
      ["club", "club"],
    );
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("cursor")).toBe("next");
    expect(fetch.mock.calls.map(([, init]) => (init as RequestInit).headers)).toEqual([
      expect.objectContaining({ Authorization: "Bearer first-token" }),
      expect.objectContaining({ Authorization: "Bearer second-token" }),
    ]);
    expect(JSON.stringify(groupRecordKeys.list(options, "public", "club"))).not.toContain("token");
  });
  it("does not search short public queries or request unauthenticated data", () => {
    const { options, wrapper } = setup(),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderHook(() => useGroupRecords(options, "public", "abc"), { wrapper });
    renderHook(() => useGroupRecords({ ...options, userId: null }), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("seeds complete ordinary details from ordinary lists, never from privileged moderation proposals", async () => {
    const { options, client, wrapper } = setup();
    client.setQueryData(groupRecordKeys.list(options, "mine"), page([group]));
    const fetch = vi.fn(async () => new Response(JSON.stringify(group)));
    vi.stubGlobal("fetch", fetch);
    const cached = renderHook(() => useGroupRecord(options, id), { wrapper });
    expect(cached.result.current.data?.name).toBe("Board Club");
    expect(fetch).not.toHaveBeenCalled();
    client.setQueryData(
      groupRecordKeys.list(options, "moderation"),
      page([{ ...group, id: otherId, name: "PRIVATE PROPOSAL" }]),
    );
    const ordinary = renderHook(() => useGroupRecord(options, otherId), { wrapper });
    expect(ordinary.result.current.data).toBeUndefined();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const review = renderHook(() => useGroupRecord(options, id, true), { wrapper });
    expect(review.result.current.data).toBeUndefined();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
  it("rolls back only owned optimistic fields, preserving simultaneous edits and foreign caches", async () => {
    const { options, client, wrapper } = setup();
    const key = groupRecordKeys.list(options, "mine");
    client.setQueryData(key, page([group, { ...group, id: otherId, name: "Second club" }]));
    const foreign = groupRecordKeys.detail({ ...options, userId: "different-user" }, id);
    client.setQueryData(foreign, { ...group, name: "Other viewer" });
    const response = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response.promise),
    );
    const hook = renderHook(() => useGroupRecordActions(options), { wrapper });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = hook.result.current.update
        .mutateAsync({ id, input: { name: "Optimistic club", version: 1 } })
        .catch((error) => error);
    });
    await waitFor(() =>
      expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("update_group"),
    );
    expect((client.getQueryData(key) as ReturnType<typeof page>).pages[0].items[0]).toMatchObject({
      name: "Optimistic club",
    });
    client.setQueryData(
      key,
      page([
        { ...group, name: "Optimistic club", memberCount: 9 },
        { ...group, id: otherId, name: "Second club changed" },
      ]),
    );
    await act(async () => {
      response.resolve(new Response('{"error":"GROUP_CHANGED"}', { status: 409 }));
      await mutation;
    });
    expect((client.getQueryData(key) as ReturnType<typeof page>).pages[0].items).toEqual([
      expect.objectContaining({ name: "Board Club", memberCount: 9 }),
      expect.objectContaining({ name: "Second club changed" }),
    ]);
    expect(client.getQueryData(foreign)).toMatchObject({ name: "Other viewer" });
    expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "update_group");
  });
  it("removes a member optimistically without losing unrelated profile changes on rollback", async () => {
    const { options, client, wrapper } = setup();
    const membership: GroupMembership = {
      id: otherId,
      groupId: id,
      userId: "guest",
      kind: "INVITATION",
      status: "ACCEPTED",
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    const person: GroupPersonResponse = {
      userId: "guest",
      name: "Guest",
      username: "guest",
      avatarUrl: null,
      isAdmin: false,
      membership,
      ban: null,
    };
    const key = groupRecordKeys.people(options, id, "accepted", "");
    client.setQueryData(key, page([person]));
    const response = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response.promise),
    );
    const actions = renderHook(() => useGroupRecordActions(options), { wrapper });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = actions.result.current.membership
        .mutateAsync({ id, userId: "guest", input: { version: 1, action: "remove" } })
        .catch((error) => error);
    });
    await waitFor(() =>
      expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("remove_group_member"),
    );
    expect((client.getQueryData(key) as ReturnType<typeof page>).pages[0].items[0]).toMatchObject({
      membership: { status: "LEFT" },
    });
    const optimistic = (client.getQueryData(key) as ReturnType<typeof page>).pages[0]
      .items[0] as GroupPersonResponse;
    client.setQueryData(key, page([{ ...optimistic, name: "Updated profile" }]));
    await act(async () => {
      response.resolve(new Response('{"error":"MEMBERSHIP_CHANGED"}', { status: 409 }));
      await mutation;
    });
    expect((client.getQueryData(key) as ReturnType<typeof page>).pages[0].items[0]).toMatchObject({
      name: "Updated profile",
      membership: { status: "ACCEPTED" },
    });
  });
  it("never invents membership permissions on acceptance and isolates review responses", async () => {
    const { options, client, wrapper } = setup();
    const pending = {
      ...group,
      role: "invited",
      canViewEvents: false,
      canViewRankings: false,
    } as GroupRecordResponse;
    client.setQueryData(groupRecordKeys.detail(options, id), pending);
    const response = deferred();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useGroupRecordActions(options), { wrapper });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = hook.result.current.membership.mutateAsync({
        id,
        userId: options.userId,
        input: { version: 1, action: "accept" },
      });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(client.getQueryData(groupRecordKeys.detail(options, id))).toMatchObject({
      canViewEvents: false,
      canViewRankings: false,
    });
    await act(async () => {
      response.resolve(new Response('{"status":"ACCEPTED"}'));
      await mutation;
    });
    fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ...group, name: "Moderator-only rejected proposal" })),
    );
    await act(() =>
      hook.result.current.review.mutateAsync({
        id,
        input: { version: 1, decision: "reject", reason: "Needs another verified location" },
      }),
    );
    expect(client.getQueryData(groupRecordKeys.detail(options, id))).toEqual(pending);
    expect(client.getQueryData(groupRecordKeys.detail(options, id, true))).toMatchObject({
      name: "Moderator-only rejected proposal",
    });
  });
  it("filters membership projections but never converts network failure into an empty-list success", async () => {
    const { options, client, wrapper } = setup();
    const person = { userId: "guest", membership: { status: "LEFT" }, isAdmin: false };
    client.setQueryData(
      groupRecordKeys.people(options, id, "accepted", ""),
      page([person, { userId: "owner", isAdmin: true, membership: null }]),
    );
    const hook = renderHook(() => useGroupPeople(options, id), { wrapper });
    expect(hook.result.current.items.map((row) => row.userId)).toEqual(["owner"]);
    const fetch = vi.fn(async () => new Response('{"error":"UNAVAILABLE"}', { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const failed = renderHook(() => useGroupRecords(options), { wrapper });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    expect(failed.result.current.error?.message).toBe("UNAVAILABLE");
    expect(groupMembershipFeedback("accept")).toBe("accept_group_invitation");
    expect(groupMembershipFeedback("approve")).toBe("approve_group_join");
  });
});
