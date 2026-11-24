import type {
  CommunityPageResponse,
  EventParticipantsResponse,
  EventProposalsResponse,
  GroupBan,
  GroupMembership,
  GroupPersonResponse,
  GroupRecordResponse,
} from "@board-game-organizer/schemas";
import { notificationItemId } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventRecordKeys,
  groupPeopleQuery,
  groupRecordKeys,
  notificationAttentionQuery,
  useGroupCreationDraft,
  useGroupPeople,
  useGroupRecordActions,
  useGroupRecords,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { eventProposalKeys } from "../../../../../../packages/shared/src/events/eventProposalCache";

const API = "https://group-hook-coverage.test";
const id = groupRecord.id;
const otherId = "66666666-6666-4666-8666-666666666666";
const membershipId = "77777777-7777-4777-8777-777777777777";
const at = "2030-06-01T10:00:00.000Z";
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const options = {
    apiUrl: API,
    userId: "owner",
    getToken: vi.fn(async () => "fresh-group-token"),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
function pages<T>(items: T[]): InfiniteData<CommunityPageResponse<T>> {
  return { pages: [{ items, nextCursor: null }], pageParams: [""] };
}
function membership(change: Partial<GroupMembership> = {}): GroupMembership {
  return {
    id: membershipId,
    groupId: id,
    userId: "owner",
    kind: "INVITATION",
    status: "ACCEPTED",
    role: "MEMBER",
    version: 1,
    createdAt: at,
    updatedAt: at,
    ...change,
  };
}
function person(userId: string): GroupPersonResponse {
  return {
    userId,
    name: userId,
    username: userId,
    avatarUrl: null,
    isAdmin: false,
    ban: null,
    membership: membership({ userId }),
  };
}
function deferred() {
  let finish: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(response: Response) {
      if (!finish) throw new Error("Expected controlled Group response");
      finish(response);
    },
  };
}
function request(input: RequestInfo | URL) {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  expect(url.origin).toBe(API);
  return url;
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it.each(["moderation", "mine"] as const)(
  "keeps review-only proposal caches isolated from the ordinary %s role receipt",
  async (scope) => {
    const { client, options, wrapper } = setup();
    const key = eventProposalKeys.page(options, {
      eventId: plannedEvent.id,
      groupId: id,
      kind: "date",
      mode: "review",
    });
    const privateReview: EventProposalsResponse = {
      eventId: plannedEvent.id,
      eventVersion: 1,
      groupId: id,
      mode: "review",
      items: [],
      nextCursor: null,
    };
    client.setQueryData(key, privateReview);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(request(input).searchParams.get("scope")).toBe(scope);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-group-token");
        return Response.json({ items: [{ ...groupRecord, role: "accepted" }], nextCursor: null });
      }),
    );
    const hook = renderHook(() => useGroupRecords(options, scope), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.items).toHaveLength(1);
    expect(client.getQueryData(key)).toBe(scope === "moderation" ? privateReview : undefined);
  },
);

it("exposes only the current actor's rejected creation draft and keeps its CID stable without automatic resubmission", async () => {
  const { client, options, wrapper } = setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "NAME_NOT_AVAILABLE" }, { status: 400 })),
  );
  const hook = renderHook(
    ({ draftId }: { draftId?: string }) => ({
      actions: useGroupRecordActions(options),
      draft: useGroupCreationDraft(options, draftId),
      foreign: useGroupCreationDraft({ ...options, userId: "other" }, draftId),
    }),
    { wrapper, initialProps: {} },
  );
  await act(() =>
    hook.result.current.actions.create
      .mutateAsync({
        type: "PRIVATE",
        name: "Unsubmitted group",
        invitedUserIds: [],
        clientDraft: { name: "Unsubmitted group", friends: [] },
      })
      .catch((error: Error) => expect(error.message).toContain("NAME_NOT_AVAILABLE")),
  );
  const source = client
    .getMutationCache()
    .find({ mutationKey: groupRecordKeys.mutation(options, "", "create") });
  if (!source) throw new Error("Expected the actual failed creation mutation");
  await hook.rerender({ draftId: String(source.mutationId) });
  expect(hook.result.current.draft).toMatchObject({
    status: "error",
    variables: { name: "Unsubmitted group", clientDraft: { name: "Unsubmitted group" } },
  });
  expect(hook.result.current.draft?.variables.clientRequestId).toMatch(/^[a-f\d-]{36}$/);
  expect(hook.result.current.foreign).toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});

it("rejects a duplicate same-person intent after the first request is pending without sending it or disturbing independent readers", async () => {
  const { client, options, wrapper } = setup();
  const response = deferred();
  client.setQueryData(groupRecordKeys.detail(options, id), groupRecord);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST" ? response.promise : Response.json(groupRecord),
    ),
  );
  const hook = renderHook(() => useGroupRecordActions(options, id), { wrapper });
  let first: Promise<unknown> | undefined;
  act(() => {
    first = hook.result.current.invite.mutateAsync({ id, userId: "guest" });
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(hook.result.current.isPersonBusy(id, "guest")).toBe(true);
  expect(hook.result.current.isPersonBusy(id, "another-person")).toBe(false);
  await act(() =>
    hook.result.current.invite
      .mutateAsync({ id, userId: "guest" })
      .catch((error: Error) => expect(error.message).toBe("MUTATION_IN_PROGRESS")),
  );
  expect(fetch).toHaveBeenCalledOnce();
  await act(async () => {
    response.resolve(Response.json(membership({ userId: "guest", status: "PENDING" })));
    await first;
  });
  await waitFor(() => expect(hook.result.current.isBusy(id)).toBe(false));
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toEqual(groupRecord);
});

type Action =
  | "create"
  | "update"
  | "review"
  | "invite"
  | "membership"
  | "ban"
  | "revoke"
  | "remove";
const ban: GroupBan = {
  id: membershipId,
  groupId: id,
  userId: "guest",
  adminUserId: "owner",
  until: null,
  createdAt: at,
  updatedAt: at,
};
it.each<Action>(["create", "update", "review", "invite", "membership", "ban", "revoke", "remove"])(
  "never lets a late successful %s receipt restore old private state after a real session-cache purge",
  async (action) => {
    const { client, options, wrapper } = setup();
    const response = deferred();
    client.setQueryData(groupRecordKeys.detail(options, id), groupRecord);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response.promise),
    );
    const hook = renderHook(() => useGroupRecordActions(options, id), { wrapper });
    let task: Promise<unknown> | undefined;
    act(() => {
      const actions = hook.result.current;
      if (action === "create")
        task = actions.create.mutateAsync({
          type: "PRIVATE",
          name: "Private new group",
          invitedUserIds: [],
        });
      else if (action === "update")
        task = actions.update.mutateAsync({
          id,
          input: { version: 1, name: "Private renamed group" },
        });
      else if (action === "review")
        task = actions.review.mutateAsync({ id, input: { version: 1, decision: "approve" } });
      else if (action === "invite") task = actions.invite.mutateAsync({ id, userId: "guest" });
      else if (action === "membership")
        task = actions.membership.mutateAsync({
          id,
          userId: "guest",
          input: { version: 1, action: "promote" },
        });
      else if (action === "ban")
        task = actions.ban.mutateAsync({ id, input: { userId: "guest", until: null } });
      else if (action === "revoke") task = actions.revoke.mutateAsync({ id, userId: "guest" });
      else task = actions.remove.mutateAsync({ id, input: { version: 1, deleteEvents: true } });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(() => clearSessionQueryCache(client));
    const other = { ...options, userId: "new-owner" };
    const privateOther = { ...groupRecord, name: "Replacement account group" };
    client.setQueryData(groupRecordKeys.detail(other, id), privateOther);
    await act(async () => {
      response.resolve(
        Response.json(
          action === "remove"
            ? { id, eventIds: [] }
            : action === "ban" || action === "revoke"
              ? ban
              : action === "invite" || action === "membership"
                ? membership({ userId: "guest" })
                : { ...groupRecord, version: 2 },
        ),
      );
      await task;
    });
    expect(client.getQueryData(groupRecordKeys.detail(options, id))).toBeUndefined();
    expect(client.getQueryData(groupRecordKeys.detail(options, id, true))).toBeUndefined();
    expect(client.getQueryData(groupRecordKeys.detail(other, id))).toBe(privateOther);
    expect(fetch).toHaveBeenCalledOnce();
    expect(options.feedback.onSuccess).not.toHaveBeenCalled();
    expect(options.feedback.onError).not.toHaveBeenCalled();
  },
);

it("does not send an old actor's rejected write feedback to the replacement session", async () => {
  const { client, options, wrapper } = setup();
  const response = deferred();
  client.setQueryData(groupRecordKeys.detail(options, id), groupRecord);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response.promise),
  );
  const hook = renderHook(() => useGroupRecordActions(options, id), { wrapper });
  let task: Promise<unknown> | undefined;
  act(() => {
    task = hook.result.current.update
      .mutateAsync({ id, input: { version: 1, name: "Rejected old edit" } })
      .catch((error: Error) => expect(error.message).toContain("DENIED"));
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(() => clearSessionQueryCache(client));
  await act(async () => {
    response.resolve(Response.json({ error: "DENIED" }, { status: 400 }));
    await task;
  });
  expect(options.feedback.onError).not.toHaveBeenCalled();
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toBeUndefined();
});

it.each(["PRIVATE", "PUBLIC"] as const)(
  "reconciles an explicit own decline without retaining %s member-only capabilities",
  async (type) => {
    const { client, options, wrapper } = setup();
    const initial: GroupRecordResponse = {
      ...groupRecord,
      type,
      adminUserId: "creator",
      role: "invited",
      myMembership: membership({ status: "PENDING" }),
      canEdit: false,
      canInvite: false,
    };
    const declined = membership({ status: "DECLINED", version: 2 });
    const current: GroupRecordResponse = {
      ...initial,
      role: "none",
      myMembership: declined,
      version: 2,
      canViewEvents: false,
      canViewRankings: false,
      canSocialInteract: false,
      canViewMembers: type === "PUBLIC",
    };
    client.setQueryData(groupRecordKeys.detail(options, id), initial);
    client.setQueryData(groupRecordKeys.list(options, "mine"), pages([initial]));
    const foreignKey = groupRecordKeys.detail({ ...options, userId: "another" }, id);
    client.setQueryData(foreignKey, initial);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = request(input);
        if (init?.method === "PATCH") return Response.json(declined);
        if (url.pathname === `/api/groups/${id}`)
          return type === "PRIVATE"
            ? Response.json({ error: "GROUP_MEMBER_REQUIRED" }, { status: 403 })
            : Response.json(current);
        throw new Error(`Unexpected decline read: ${url.pathname}`);
      }),
    );
    const hook = renderHook(() => useGroupRecordActions(options, id), { wrapper });
    await act(() =>
      hook.result.current.membership.mutateAsync({
        id,
        userId: "owner",
        input: { version: 1, action: "decline" },
      }),
    );
    if (type === "PRIVATE")
      expect(client.getQueryData(groupRecordKeys.detail(options, id))).toBeUndefined();
    else
      expect(client.getQueryData(groupRecordKeys.detail(options, id))).toMatchObject({
        version: 2,
        role: "none",
        canViewMembers: true,
        canViewEvents: false,
        canInvite: false,
      });
    expect(client.getQueryData(groupRecordKeys.list(options, "mine"))).toMatchObject({
      pages: [{ items: [] }],
    });
    expect(client.getQueryData(foreignKey)).toBe(initial);
  },
);

it("records a pending join request without inventing access and revokes only its owned member-only cache", async () => {
  const { client, options, wrapper } = setup();
  const initial: GroupRecordResponse = {
    ...groupRecord,
    type: "PUBLIC",
    adminUserId: "creator",
    role: "none",
    myMembership: null,
    canEdit: false,
    canInvite: false,
    canViewEvents: false,
  };
  const requested = membership({ kind: "REQUEST", status: "PENDING", version: 1 });
  const current: GroupRecordResponse = {
    ...initial,
    myMembership: requested,
    role: "requested",
    version: 2,
  };
  const peopleKey = groupRecordKeys.people(options, id, "accepted", "");
  const people = pages([person("unrelated")]);
  client.setQueryData(groupRecordKeys.detail(options, id), initial);
  client.setQueryData(peopleKey, people);
  const foreignPeopleKey = groupRecordKeys.people(
    { ...options, userId: "other" },
    id,
    "accepted",
    "",
  );
  client.setQueryData(foreignPeopleKey, people);
  client.setQueryData(groupRecordKeys.list(options, "mine"), pages([initial]));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      Response.json(init?.method === "POST" ? requested : current),
    ),
  );
  const hook = renderHook(() => useGroupRecordActions(options, id), { wrapper });
  await act(() => hook.result.current.requestJoin.mutateAsync(id));
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toMatchObject({
    role: "requested",
    canViewEvents: false,
    canInvite: false,
    myMembership: requested,
  });
  expect(client.getQueryData(peopleKey)).toBeUndefined();
  expect(client.getQueryData(foreignPeopleKey)).toBe(people);
});

it("keeps a newer person membership and Group receipt when a delayed promote acknowledgement is followed by a failed member-page refresh", async () => {
  const { client, options, wrapper } = setup();
  const target = person("guest");
  const currentMember = membership({ userId: "guest", version: 4, role: "MODERATOR" });
  const newer = { ...target, membership: currentMember };
  const key = groupRecordKeys.people(options, id, "accepted", "");
  const response = deferred();
  client.setQueryData(groupRecordKeys.detail(options, id), groupRecord);
  client.setQueryData(key, pages([target, person("unrelated")]));
  let acknowledged = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = request(input);
      if (init?.method === "PATCH") return response.promise;
      if (url.pathname.endsWith("/members"))
        return acknowledged
          ? Response.json({ error: "Member page refused" }, { status: 400 })
          : Response.json({ items: [newer, person("unrelated")], nextCursor: null });
      return Response.json({ ...groupRecord, version: 2 });
    }),
  );
  const hook = renderHook(
    () => ({
      people: useGroupPeople(options, id, "accepted"),
      actions: useGroupRecordActions(options, id),
    }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.people.data).toBeDefined());
  let task: Promise<unknown> | undefined;
  act(() => {
    task = hook.result.current.actions.membership.mutateAsync({
      id,
      userId: "guest",
      input: { version: 1, action: "promote" },
    });
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(() =>
    client.fetchInfiniteQuery({ ...groupPeopleQuery(options, id, "accepted"), staleTime: 0 }),
  );
  acknowledged = true;
  await act(async () => {
    response.resolve(Response.json(membership({ userId: "guest", version: 2, role: "MODERATOR" })));
    await task;
  });
  expect(client.getQueryData(key)).toMatchObject({
    pages: [{ items: [{ membership: { version: 4 } }, { userId: "unrelated" }] }],
  });
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toMatchObject({ version: 2 });
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "refresh_saved_changes");
  expect(hook.result.current.actions.isBusy(id)).toBe(false);
});

it.each([true, false])(
  "projects a Group ban only through active participant epochs, preserving frozen attendance and rolling back refused writes, saved=%s",
  async (saved) => {
    const { client, options, wrapper } = setup();
    const target = {
      id: "guest",
      userId: "guest",
      name: "Guest",
      username: "guest",
      avatarUrl: null,
      position: "SEATED" as const,
      accepted: true,
      canRemove: true,
      canBanGroup: false,
    };
    const active: EventParticipantsResponse = {
      items: [target],
      nextCursor: null,
      groupId: id,
      eventVersion: 2,
      status: "PLANNING",
    };
    const frozen: EventParticipantsResponse = { ...active, status: "TERMINATED" };
    const activeKey = [
      ...eventRecordKeys.root(options),
      "participants",
      plannedEvent.id,
      "",
      "review",
      id,
    ];
    const frozenKey = [...eventRecordKeys.root(options), "participants", otherId, "", "review", id];
    client.setQueryData(activeKey, active);
    client.setQueryData(frozenKey, frozen);
    client.setQueryData(groupRecordKeys.detail(options, id), groupRecord);
    const roster = groupRecordKeys.people(options, id, "accepted", "");
    const unaffected = person("unrelated");
    client.setQueryData(roster, pages([person("guest"), unaffected]));
    const response = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST" ? response.promise : Response.json(groupRecord),
      ),
    );
    const hook = renderHook(() => useGroupRecordActions(options, id), { wrapper });
    let task: Promise<unknown> | undefined;
    act(() => {
      task = hook.result.current.ban
        .mutateAsync({ id, input: { userId: "guest", until: null } })
        .catch((error: Error) => {
          if (saved) throw error;
          expect(error.message).toContain("BAN_REFUSED");
        });
    });
    await waitFor(() => expect(hook.result.current.isPersonBusy(id, "guest")).toBe(true));
    expect(client.getQueryData(activeKey)).toMatchObject({ items: [] });
    expect(client.getQueryData(frozenKey)).toBe(frozen);
    expect(client.getQueryData(roster)).toMatchObject({
      pages: [{ items: [{ userId: "guest", membership: { status: "LEFT" } }, unaffected] }],
    });
    await act(async () => {
      response.resolve(
        saved ? Response.json(ban) : Response.json({ error: "BAN_REFUSED" }, { status: 400 }),
      );
      await task;
    });
    expect(client.getQueryData(activeKey)).toMatchObject({ items: saved ? [] : [target] });
    expect(client.getQueryData(frozenKey)).toBe(frozen);
    expect(hook.result.current.isBusy(id)).toBe(false);
  },
);

it("chooses the newest acknowledged creation only from eligible active name/type/admin views", async () => {
  const { client, options, wrapper } = setup();
  let committed = false;
  const saved: GroupRecordResponse = { ...groupRecord, name: "Alpha private group", version: 2 };
  const newer = { ...saved, version: 3 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = request(input);
      if (init?.method === "POST") {
        committed = true;
        return Response.json(saved);
      }
      const query = url.searchParams.get("query") ?? "";
      const type = url.searchParams.get("type");
      const roles = url.searchParams.get("roles") ?? "";
      return Response.json({
        items: !committed
          ? []
          : query === "Alpha" && type === "PRIVATE" && roles === "admin"
            ? [newer]
            : query || type || roles === "accepted"
              ? []
              : [{ ...groupRecord, id: otherId, name: "Existing unrelated group" }, saved],
        nextCursor: null,
      });
    }),
  );
  const hook = renderHook(
    () => ({
      eligible: useGroupRecords(options, "mine", "Alpha", ["admin"], "PRIVATE"),
      excludedName: useGroupRecords(options, "mine", "Unrelated", ["admin"], "PRIVATE"),
      excludedType: useGroupRecords(options, "mine", "Alpha", ["admin"], "PUBLIC"),
      excludedRole: useGroupRecords(options, "mine", "Alpha", ["accepted"], "PRIVATE"),
      actions: useGroupRecordActions(options),
    }),
    { wrapper },
  );
  await waitFor(() =>
    expect(
      hook.result.current.eligible.isSuccess &&
        hook.result.current.excludedName.isSuccess &&
        hook.result.current.excludedType.isSuccess &&
        hook.result.current.excludedRole.isSuccess,
    ).toBe(true),
  );
  await act(() =>
    hook.result.current.actions.create.mutateAsync({
      type: "PRIVATE",
      name: saved.name,
      invitedUserIds: [],
    }),
  );
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toMatchObject({
    version: 3,
    name: saved.name,
  });
  expect(hook.result.current.eligible.items).toMatchObject([{ id, version: 3 }]);
  expect(hook.result.current.excludedName.items).toEqual([]);
  expect(hook.result.current.excludedType.items).toEqual([]);
  expect(hook.result.current.excludedRole.items).toEqual([]);
});

it("projects an accepted invite while canonical group permissions are loading", async () => {
  const { client, options, wrapper } = setup();
  const detail = groupRecordKeys.detail(options, id);
  const other = groupRecordKeys.detail(options, otherId);
  const list = groupRecordKeys.list(options, "mine");
  const accepted = membership({ version: 2 });
  const initial: GroupRecordResponse = {
    ...groupRecord,
    adminUserId: "creator",
    role: "invited",
    myMembership: membership({ status: "PENDING" }),
    canEdit: false,
    canInvite: false,
  };
  const unrelated = { ...initial, id: otherId };
  const authorized: GroupRecordResponse = {
    ...initial,
    version: 3,
    role: "moderator",
    myMembership: membership({ version: 3, role: "MODERATOR" }),
    canEdit: true,
    canInvite: true,
  };
  const canonical = deferred();
  client.setQueryData(detail, initial);
  client.setQueryData(other, unrelated);
  client.setQueryData(list, pages([unrelated, initial]));
  const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = request(input);
    if (init?.method === "PATCH") return Response.json(accepted);
    expect(url.pathname).toBe(`/api/groups/${id}`);
    return canonical.promise;
  });
  vi.stubGlobal("fetch", send);
  const { result } = renderHook(() => useGroupRecordActions(options, id), { wrapper });
  act(() =>
    result.current.membership.mutate({
      id,
      userId: options.userId,
      input: { version: 1, action: "accept" },
    }),
  );
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(client.getQueryData(detail)).toMatchObject({
    role: "accepted",
    myMembership: accepted,
    canEdit: false,
  });
  expect(client.getQueryData(list)).toMatchObject({
    pages: [
      {
        items: [
          { id: otherId, role: "invited" },
          { id, role: "accepted" },
        ],
      },
    ],
  });
  expect(client.getQueryData(other)).toEqual(unrelated);
  await act(async () => canonical.resolve(Response.json(authorized)));
  await waitFor(() => expect(result.current.membership.isSuccess).toBe(true));
  expect(client.getQueryData(detail)).toEqual(authorized);
});

it("keeps an acknowledged creation from leaking into a denied detail refresh", async () => {
  const { client, options, wrapper } = setup();
  const created = { ...groupRecord, version: 2 };
  const canonicalKey = groupRecordKeys.detail(options, created.id);
  const otherOwner = groupRecordKeys.detail({ ...options, userId: "other" }, created.id);
  client.setQueryData(otherOwner, groupRecord);
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = request(input);
    expect(url.pathname).toBe("/api/groups");
    if (init?.method === "POST") return Response.json(created);
    return Response.json({ error: "ACCESS_REVOKED" }, { status: 403 });
  });
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useGroupRecordActions(options), { wrapper });
  act(() =>
    result.current.create.mutate({ name: created.name, type: "PRIVATE", invitedUserIds: [] }),
  );
  await waitFor(() =>
    expect(options.feedback.onError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      "refresh_saved_changes",
    ),
  );
  expect(client.getQueryData(canonicalKey)).toBeUndefined();
  expect(client.getQueryData(otherOwner)).toBe(groupRecord);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("acknowledges a Group creation once while keeping a failed matching filtered refresh observable", async () => {
  const { client, options, wrapper } = setup();
  const saved = { ...groupRecord, name: "Alpha club", version: 2 };
  const filtered = "Alpha";
  const reads: (string | null)[] = [];
  const writes: unknown[] = [];
  let accepted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = request(input);
      if (init?.method === "POST") {
        expect(url.pathname).toBe("/api/groups");
        accepted = true;
        writes.push(JSON.parse(String(init.body)));
        return Response.json(saved);
      }
      if (url.pathname === `/api/groups/${id}`) return Response.json(saved);
      expect(url.pathname).toBe("/api/groups");
      const query = url.searchParams.get("query");
      reads.push(query);
      if (accepted && query === filtered)
        return Response.json({ error: "Filtered refresh unavailable" }, { status: 503 });
      return Response.json({ items: accepted ? [saved] : [], nextCursor: null });
    }),
  );
  const view = renderHook(
    () => ({
      visible: useGroupRecords(options, "mine", filtered, ["admin"], "PRIVATE"),
      actions: useGroupRecordActions(options),
    }),
    { wrapper },
  );
  await waitFor(() => expect(view.result.current.visible.isSuccess).toBe(true));
  act(() =>
    view.result.current.actions.create.mutate({
      type: "PRIVATE",
      name: saved.name,
      invitedUserIds: [],
    }),
  );
  await waitFor(() =>
    expect(options.feedback.onError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 503 }),
      "refresh_saved_changes",
    ),
  );
  expect(reads).toContain(null);
  expect(reads.filter((query) => query === filtered).length).toBeGreaterThan(1);
  expect(writes).toEqual([
    expect.objectContaining({ name: saved.name, clientRequestId: expect.any(String) }),
  ]);
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toMatchObject({
    name: saved.name,
    version: saved.version,
  });
});

it("ignores an already acknowledged Group creation refresh when the session closes during readback", async () => {
  const { client, options, wrapper } = setup();
  const saved = { ...groupRecord, version: 2 };
  let signal: AbortSignal | undefined | null;
  const send = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(request(input).pathname).toBe("/api/groups");
    if (init?.method === "POST") return Response.json(saved);
    signal = init?.signal;
    return new Promise<Response>((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  vi.stubGlobal("fetch", send);
  const view = renderHook(() => useGroupRecordActions(options), { wrapper });
  act(() =>
    view.result.current.create.mutate({ type: "PRIVATE", name: saved.name, invitedUserIds: [] }),
  );
  await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toMatchObject({
    version: saved.version,
  });
  view.unmount();
  await act(() => clearSessionQueryCache(client));
  expect(signal?.aborted).toBe(true);
  expect(client.getQueryData(groupRecordKeys.detail(options, id))).toBeUndefined();
  expect(options.feedback.onError).not.toHaveBeenCalled();
  expect(send.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("acknowledges a cached group invitation only for the actor's explicit acceptance and pins the read cutoff", async () => {
  const { client, options, wrapper } = setup();
  const detail = groupRecordKeys.detail(options, id);
  const pending = membership({ status: "PENDING" });
  const accepted = membership({ status: "ACCEPTED", version: 2 });
  const invite = {
    ...groupRecord,
    adminUserId: "creator",
    role: "invited" as const,
    myMembership: pending,
    canInvite: false,
    canEdit: false,
    canViewEvents: false,
    canViewRankings: false,
  };
  const live = {
    ...invite,
    role: "accepted" as const,
    myMembership: accepted,
    version: 2,
    canViewEvents: true,
  };
  const target = { kind: "item", id: notificationItemId(id, "invitation") } as const;
  const summary = {
    tables: 0,
    events: 0,
    groups: 1,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  };
  const through = "2026-11-22T18:00:00.000Z";
  const item = { target, count: 1, direct: 1, events: 0 };
  const attention = notificationAttentionQuery(options, [target]).queryKey;
  client.setQueryData(detail, invite);
  client.setQueryData(attention, {
    asOf: through,
    unreadCount: 1,
    summary,
    targets: [
      {
        ...item,
        groupId: id,
        sections: summary.sections,
        readEffect: { unread: 1, summary, targets: [item] },
      },
    ],
  });
  const write = deferred();
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = request(input);
      if (init?.method === "PATCH") {
        expect(url.pathname).toBe(`/api/groups/${id}/members/${options.userId}`);
        writes.push(JSON.parse(String(init.body)));
        return write.promise;
      }
      expect(url.pathname).toBe(`/api/groups/${id}`);
      return Response.json(live);
    }),
  );
  const view = renderHook(() => useGroupRecordActions(options, id), { wrapper });
  expect(client.getQueryData(attention)).toMatchObject({ unreadCount: 1 });
  expect(writes).toEqual([]);
  act(() =>
    view.result.current.membership.mutate({
      id,
      userId: options.userId,
      input: { action: "accept", version: 1 },
    }),
  );
  await waitFor(() =>
    expect(writes).toEqual([{ action: "accept", version: 1, attentionThrough: through }]),
  );
  expect(client.getQueryData(attention)).toMatchObject({ unreadCount: 0 });
  expect(client.getQueryData(detail)).toMatchObject({ role: "invited" });
  await act(() => write.resolve(Response.json(accepted)));
  await waitFor(() => expect(view.result.current.membership.isSuccess).toBe(true));
  expect(client.getQueryData(detail)).toMatchObject({ role: "accepted", canViewEvents: true });
  expect(writes).toHaveLength(1);
});

it("does not restore accepted group permissions after the member signs out during readback", async () => {
  const { client, options, wrapper } = setup();
  const key = groupRecordKeys.detail(options, id);
  const pending = membership({ status: "PENDING" });
  const accepted = membership({ status: "ACCEPTED", version: 2 });
  client.setQueryData(key, {
    ...groupRecord,
    adminUserId: "creator",
    role: "invited",
    myMembership: pending,
  });
  let signal: AbortSignal | null | undefined;
  const readback = deferred();
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = request(input);
    if (init?.method === "PATCH") {
      expect(url.pathname).toBe(`/api/groups/${id}/members/${options.userId}`);
      return Response.json(accepted);
    }
    expect(url.pathname).toBe(`/api/groups/${id}`);
    signal = init?.signal;
    return readback.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const view = renderHook(() => useGroupRecordActions(options, id), { wrapper });
  act(() =>
    view.result.current.membership.mutate({
      id,
      userId: options.userId,
      input: { action: "accept", version: 1 },
    }),
  );
  await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
  expect(client.getQueryData(key)).toMatchObject({ role: "accepted", myMembership: accepted });
  view.unmount();
  await act(() => clearSessionQueryCache(client));
  expect(signal?.aborted).toBe(true);
  const otherOwner = groupRecordKeys.detail({ ...options, userId: "different-viewer" }, id);
  const replacement = { ...groupRecord, name: "Group from the new session" };
  client.setQueryData(otherOwner, replacement);
  await act(() =>
    readback.resolve(
      Response.json({ ...groupRecord, version: 2, myMembership: accepted, role: "accepted" }),
    ),
  );
  expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryData(otherOwner)).toBe(replacement);
  expect(options.feedback.onError).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
});
