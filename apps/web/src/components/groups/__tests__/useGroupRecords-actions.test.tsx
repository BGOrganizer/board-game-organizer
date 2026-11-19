import {
  type CommunityPageResponse,
  decideGroupMembershipSchema,
  decideGroupReviewSchema,
  editGroupRecordSchema,
  type GroupBan,
  type GroupMembership,
  type GroupPersonResponse,
  type GroupRecord,
  type GroupRecordResponse,
  groupBanSchema,
  groupMembershipSchema,
  groupRecordSchema,
} from "@board-game-organizer/schemas";
import {
  type ContactUser,
  clearSessionQueryCache,
  groupCapabilities,
  groupInviteesPageQuery,
  groupRecordDetailQuery,
  groupRecordKeys,
  groupRecordsPageQuery,
  groupViewerRole,
  useGroupPeople,
  useGroupRecord,
  useGroupRecordActions,
  useGroupRecords,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const apiUrl = "https://group-actions.example.test";
const at = "2026-11-18T12:00:00.000Z";
const id = "11111111-1111-4111-8111-111111111111";
const logoId = "22222222-2222-4222-8222-222222222222";
const owner = "user_owner";
const guest = "user_guest";
const friendId = "user_friend";
type Options = Parameters<typeof useGroupRecordActions>[0];
const location = {
  id: logoId,
  name: "Verified venue",
  address: "Fixture address",
  latitude: 45,
  longitude: 9,
  timeZone: "Europe/Rome",
};
const record = (publicProposal = false): GroupRecord =>
  groupRecordSchema.parse({
    id,
    adminUserId: owner,
    type: publicProposal ? "PUBLIC" : "PRIVATE",
    approved: {
      name: "Approved club",
      logoAssetId: logoId,
      ...(publicProposal ? { location } : {}),
    },
    ...(publicProposal
      ? {
          proposal: { name: "Proposed club", logoAssetId: logoId, location },
          reviewStatus: "PENDING",
        }
      : {}),
    reservedNames: publicProposal ? ["approved club", "proposed club"] : [],
    version: 3,
    createdAt: at,
    updatedAt: at,
  });
function membership(
  userId = guest,
  role: GroupMembership["role"] = "MEMBER",
  status: GroupMembership["status"] = "ACCEPTED",
): GroupMembership {
  return groupMembershipSchema.parse({
    id:
      userId === guest
        ? logoId
        : userId === friendId
          ? "33333333-3333-4333-8333-333333333333"
          : "44444444-4444-4444-8444-444444444444",
    groupId: id,
    userId,
    kind: "INVITATION",
    status,
    role,
    version: 4,
    createdAt: at,
    updatedAt: at,
  });
}
function dto(
  value = record(),
  actor = owner,
  own: GroupMembership | null = null,
): GroupRecordResponse {
  const capabilities = groupCapabilities(value, actor, own, null, Date.parse(at));
  const role = groupViewerRole(value, actor, own);
  const revision =
    role === "admin" || role === "moderator" ? (value.proposal ?? value.approved) : value.approved;
  if (!revision) throw new Error("Fixture must have an authorized visible revision");
  const { proposal, reviewStatus, rejectionReason, reservedNames, ...safe } = value;
  return {
    ...safe,
    ...(role === "admin" || role === "moderator"
      ? { proposal, reviewStatus, rejectionReason, reservedNames }
      : { reservedNames: [] }),
    ...capabilities,
    name: revision.name,
    logoAssetId: revision.logoAssetId,
    location: revision.location,
    logo: "data:image/webp;base64,dXBsb2FkZWQ=",
    role,
    myMembership: own,
    pendingRequestCount: role === "admin" || role === "moderator" ? 0 : null,
    memberCount: 2,
    eventCount: capabilities.canViewEvents ? 1 : null,
  };
}
const person = (value = membership()): GroupPersonResponse => ({
  userId: value.userId,
  name: "Guest profile",
  username: "guest",
  avatarUrl: null,
  isAdmin: false,
  membership: value,
  ban: null,
});
const page = <T,>(items: T[]): InfiniteData<CommunityPageResponse<T>> => ({
  pages: [{ items, nextCursor: null }],
  pageParams: [""],
});
const clients: QueryClient[] = [];
function setup(initial = dto(), peopleActive = false, actor = owner) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  let token = 0;
  const options = {
    apiUrl,
    userId: actor,
    enabled: false,
    protectionBypass: "preview",
    getToken: vi.fn(async () => `token-${++token}`),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  const state = {
    group: initial,
    accepted: [person(membership(actor === guest ? friendId : guest))],
    pending: [] as GroupPersonResponse[],
    bans: [] as GroupPersonResponse[],
  };
  const keys = {
    detail: groupRecordKeys.detail(options, id),
    review: groupRecordKeys.detail(options, id, true),
    mine: groupRecordKeys.list(options, "mine"),
    accepted: groupRecordKeys.people(options, id, "accepted", ""),
    bans: groupRecordKeys.people(options, id, "bans", ""),
  };
  client.setQueryData(keys.detail, initial);
  client.setQueryData(keys.mine, page(initial.role === "none" ? [] : [initial]));
  client.setQueryData(keys.accepted, page(state.accepted));
  client.setQueryData(keys.bans, page(state.bans));
  const calls: Array<{ url: URL; method: string; input: unknown; authorization: string | null }> =
    [];
  const read = (url: URL) => {
    if (url.pathname === "/api/groups")
      return Response.json({
        items: state.group.role === "none" ? [] : [state.group],
        nextCursor: null,
      });
    if (url.pathname === `/api/groups/${id}` || url.pathname === `/api/groups/${id}/review`)
      return Response.json(state.group);
    if (url.pathname === `/api/groups/${id}/members`) {
      const mode = url.searchParams.get("mode");
      if (mode !== "accepted" && mode !== "pending" && mode !== "bans")
        throw new Error("Unexpected people stream");
      return Response.json({ items: state[mode], nextCursor: null });
    }
    throw new Error(`Unexpected Group read: ${url.pathname}`);
  };
  let respond = (url: URL, init: RequestInit): Response | Promise<Response> => {
    if (init.method === "GET") return read(url);
    throw new Error(`Unexpected Group write: ${init.method} ${url.pathname}`);
  };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (
      url.origin !== apiUrl ||
      ![
        "/api/groups",
        `/api/groups/${id}`,
        `/api/groups/${id}/review`,
        `/api/groups/${id}/members`,
        `/api/groups/${id}/membership`,
        `/api/groups/${id}/members/${guest}`,
        `/api/groups/${id}/bans`,
        `/api/groups/${id}/bans/${guest}`,
      ].includes(url.pathname)
    )
      throw new Error(`Unexpected fixture HTTP request: ${url.href}`);
    expect(url.searchParams.get("x-vercel-protection-bypass")).toBe("preview");
    const headers = new Headers(init.headers);
    expect(headers.has("x-vercel-protection-bypass")).toBe(false);
    expect(headers.get("authorization")).toMatch(/^Bearer token-\d+$/);
    calls.push({
      url,
      method: init.method ?? "GET",
      input: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      authorization: headers.get("authorization"),
    });
    return respond(url, init);
  });
  vi.stubGlobal("fetch", fetcher);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    (current: Options) => ({
      detail: useGroupRecord(current, id),
      review: useGroupRecord(current, id, true),
      groups: useGroupRecords(current),
      accepted: useGroupPeople({ ...current, enabled: peopleActive }, id),
      bans: useGroupPeople({ ...current, enabled: peopleActive }, id, "bans"),
      actions: useGroupRecordActions(current, id),
    }),
    { wrapper, initialProps: options },
  );
  return {
    client,
    options,
    state,
    keys,
    hook,
    calls,
    fetcher,
    read,
    respond: (next: typeof respond) => {
      respond = next;
    },
  };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it.each(["promote", "demote"] as const)(
  "projects %s only for the selected member and reconciles its version before reading authoritative permissions with fresh credentials",
  async (action) => {
    const f = setup();
    const before = membership(guest, action === "promote" ? "MEMBER" : "MODERATOR");
    const unrelated = {
      ...person(membership(friendId)),
      name: "Other profile",
      username: "other_friend",
    };
    f.state.group = { ...f.state.group, memberCount: 3 };
    act(() => {
      f.client.setQueryData(f.keys.detail, f.state.group);
      f.client.setQueryData(f.keys.mine, page([f.state.group]));
      f.client.setQueryData(f.keys.accepted, page([person(before), unrelated]));
    });
    const gate = Promise.withResolvers<Response>();
    f.respond((url, init) => (init.method === "PATCH" ? gate.promise : f.read(url)));
    let pending!: Promise<unknown>;
    act(() => {
      pending = f.hook.result.current.actions.membership.mutateAsync({
        id,
        userId: guest,
        input: { action, version: before.version },
      });
    });
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(decideGroupMembershipSchema.parse(f.calls[0].input)).toEqual({ action, version: 4 });
    expect(f.hook.result.current.accepted.items[0]).toMatchObject({
      membership: { role: action === "promote" ? "MODERATOR" : "MEMBER", version: 4 },
      name: "Guest profile",
    });
    expect(f.hook.result.current.actions.isPersonBusy(id, guest)).toBe(true);
    expect(f.hook.result.current.actions.isPersonBusy(id, friendId)).toBe(false);
    const receipt = groupMembershipSchema.parse({
      ...before,
      role: action === "promote" ? "MODERATOR" : "MEMBER",
      version: 5,
    });
    await act(async () => {
      gate.resolve(Response.json(receipt));
      await pending;
    });
    await waitFor(() => expect(f.hook.result.current.actions.membership.isSuccess).toBe(true));
    expect(f.hook.result.current.accepted.items[0].membership).toEqual(receipt);
    expect(f.hook.result.current.accepted.items[1]).toEqual(unrelated);
    expect(f.hook.result.current.detail.data).toEqual(f.state.group);
    expect(f.calls.map((call) => call.authorization)).toEqual(["Bearer token-1", "Bearer token-2"]);
    expect(f.calls[1].method).toBe("GET");
    expect(f.options.feedback.onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith(
      action === "promote" ? "promote_group_moderator" : "demote_group_moderator",
    );
    expect(f.options.feedback.onError).not.toHaveBeenCalled();
  },
);

it.each(["promote", "demote"] as const)(
  "rolls back a rejected %s without changing the member profile or another owner's cache",
  async (action) => {
    const f = setup();
    const before = membership(guest, action === "promote" ? "MEMBER" : "MODERATOR");
    const initial = page([person(before)]);
    f.client.setQueryData(f.keys.accepted, initial);
    const foreignKey = groupRecordKeys.people(
      { ...f.options, userId: "user_other" },
      id,
      "accepted",
      "",
    );
    f.client.setQueryData(foreignKey, initial);
    f.respond(() => Response.json({ error: "GROUP_MANAGER_PROTECTED" }, { status: 409 }));
    await act(async () => {
      await expect(
        f.hook.result.current.actions.membership.mutateAsync({
          id,
          userId: guest,
          input: { action, version: 4 },
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
    await waitFor(() => expect(f.hook.result.current.actions.membership.isError).toBe(true));
    expect(f.hook.result.current.accepted.items).toEqual([person(before)]);
    expect(f.client.getQueryData(foreignKey)).toBe(initial);
    expect(f.hook.result.current.actions.isPersonBusy(id, guest)).toBe(false);
    expect(f.calls).toHaveLength(1);
  },
);

it("preserves an uploaded logo during an optimistic rename and ignores an older update receipt after a newer real read", async () => {
  const f = setup();
  const gate = Promise.withResolvers<Response>();
  f.respond((url, init) => (init.method === "PATCH" ? gate.promise : f.read(url)));
  let pending!: Promise<unknown>;
  act(() => {
    pending = f.hook.result.current.actions.update.mutateAsync({
      id,
      input: { version: 3, name: "Renamed club", logoAssetId: logoId },
    });
  });
  await waitFor(() => expect(f.calls).toHaveLength(1));
  expect(editGroupRecordSchema.parse(f.calls[0].input)).toEqual({
    version: 3,
    name: "Renamed club",
    logoAssetId: logoId,
  });
  expect(f.hook.result.current.detail.data).toMatchObject({
    name: "Renamed club",
    logoAssetId: logoId,
    logo: f.state.group.logo,
    version: 3,
  });
  const newer = dto(
    groupRecordSchema.parse({
      ...record(),
      version: 5,
      approved: { ...record().approved, name: "Server newer club" },
    }),
  );
  f.state.group = newer;
  await act(async () => {
    await f.client.fetchQuery({ ...groupRecordDetailQuery(f.options, id), staleTime: 0 });
    await f.client.fetchInfiniteQuery({ ...groupRecordsPageQuery(f.options), staleTime: 0 });
  });
  await waitFor(() => expect(f.hook.result.current.detail.data?.version).toBe(5));
  const older = dto(
    groupRecordSchema.parse({
      ...record(),
      version: 4,
      approved: { ...record().approved, name: "Renamed club" },
    }),
  );
  await act(async () => {
    gate.resolve(Response.json(older));
    await pending;
  });
  await waitFor(() => expect(f.hook.result.current.actions.update.isSuccess).toBe(true));
  expect(f.hook.result.current.detail.data).toEqual(newer);
  expect(f.hook.result.current.groups.items).toEqual([newer]);
});

it.each(["approve", "reject"] as const)(
  "reconciles the %s review receipt only into its privileged cache",
  async (decision) => {
    const initial = dto(record(true));
    const f = setup(initial);
    f.client.setQueryData(f.keys.review, initial);
    const reviewed = record(true);
    const result = dto(
      groupRecordSchema.parse({
        ...reviewed,
        version: 4,
        ...(decision === "approve"
          ? {
              approved: reviewed.proposal,
              proposal: undefined,
              reviewStatus: undefined,
              reservedNames: ["proposed club"],
            }
          : { reviewStatus: "REJECTED", rejectionReason: "Verify the venue" }),
      }),
    );
    f.respond(() => Response.json(result));
    const input = decideGroupReviewSchema.parse(
      decision === "approve"
        ? { version: 3, decision }
        : { version: 3, decision, reason: "Verify the venue" },
    );
    await act(() => f.hook.result.current.actions.review.mutateAsync({ id, input }));
    await waitFor(() => expect(f.hook.result.current.actions.review.isSuccess).toBe(true));
    expect(f.calls[0].url.pathname).toBe(`/api/groups/${id}/review`);
    expect(f.calls[0].input).toEqual(input);
    expect(f.client.getQueryData(f.keys.review)).toEqual(result);
    expect(f.hook.result.current.detail.data).toEqual(initial);
    expect(f.hook.result.current.groups.items).toEqual([initial]);
  },
);

it("keeps a newer privileged revision when an earlier moderation receipt resolves", async () => {
  const f = setup(dto(record(true)));
  f.client.setQueryData(f.keys.review, f.state.group);
  const gate = Promise.withResolvers<Response>();
  f.respond((url, init) => (init.method === "PATCH" ? gate.promise : f.read(url)));
  let pending!: Promise<unknown>;
  act(() => {
    pending = f.hook.result.current.actions.review.mutateAsync({
      id,
      input: { version: 3, decision: "approve" },
    });
  });
  await waitFor(() => expect(f.calls).toHaveLength(1));
  f.state.group = dto(groupRecordSchema.parse({ ...record(true), version: 5 }));
  await act(async () => {
    await f.client.fetchQuery(groupRecordDetailQuery(f.options, id, true));
  });
  await act(async () => {
    gate.resolve(Response.json(dto(groupRecordSchema.parse({ ...record(true), version: 4 }))));
    await pending;
  });
  expect(f.client.getQueryData(f.keys.review)).toEqual(f.state.group);
  expect(f.hook.result.current.detail.data?.version).toBe(3);
});

it("revokes a denied moderation read without evicting independently authorized ordinary group data", async () => {
  const f = setup(dto(record(true)));
  f.client.setQueryData(f.keys.review, f.state.group);
  f.respond((url, init) =>
    init.method !== "GET" || url.pathname.endsWith("/review")
      ? Response.json({ error: "MODERATOR_REQUIRED" }, { status: 403 })
      : f.read(url),
  );
  await act(async () => {
    await expect(
      f.hook.result.current.actions.review.mutateAsync({
        id,
        input: { version: 3, decision: "approve" },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  await waitFor(() => expect(f.hook.result.current.actions.isBusy(id)).toBe(false));
  expect(f.client.getQueryData(f.keys.review)).toBeUndefined();
  expect(f.hook.result.current.detail.data).toEqual(f.state.group);
  expect(f.hook.result.current.groups.items).toEqual([f.state.group]);
  expect(
    f.calls.some((call) => call.method === "GET" && call.url.pathname.endsWith("/review")),
  ).toBe(true);
});

it("keeps a Public join request pending until a later explicit approval, using the canonical permissions response", async () => {
  const publicRecord = groupRecordSchema.parse({
    ...record(true),
    proposal: undefined,
    reviewStatus: undefined,
    reservedNames: ["approved club"],
  });
  const f = setup(dto(publicRecord, guest), false, guest);
  const request = groupMembershipSchema.parse({
    ...membership(guest),
    kind: "REQUEST",
    status: "PENDING",
    version: 1,
  });
  f.respond((url, init) => {
    if (init.method === "POST") {
      expect(url.pathname).toBe(`/api/groups/${id}/membership`);
      f.state.group = dto(publicRecord, guest, request);
      return Response.json(request);
    }
    return f.read(url);
  });
  await act(() => f.hook.result.current.actions.requestJoin.mutateAsync(id));
  await waitFor(() => expect(f.hook.result.current.actions.requestJoin.isSuccess).toBe(true));
  expect(f.hook.result.current.detail.data).toMatchObject({
    role: "requested",
    myMembership: request,
    canViewEvents: false,
    canViewRankings: false,
    canInvite: false,
  });
  expect(f.hook.result.current.groups.items).toEqual([]);
  expect(f.calls[0].input).toEqual({});
});

it("marks an invitee while pending and removes only that friend when the invitation receipt is acknowledged", async () => {
  const f = setup();
  const friend: ContactUser = {
    id: friendId,
    name: "Invited friend",
    username: "friend",
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: at },
    isFriend: true,
  };
  const other = { ...friend, id: "user_other_friend" };
  const inviteesKey = groupInviteesPageQuery(f.options, id).queryKey;
  f.client.setQueryData(inviteesKey, page([friend, other]));
  const gate = Promise.withResolvers<Response>();
  f.respond((url, init) => (init.method === "POST" ? gate.promise : f.read(url)));
  let pending!: Promise<unknown>;
  act(() => {
    pending = f.hook.result.current.actions.invite.mutateAsync({ id, userId: friendId });
  });
  await waitFor(() => expect(f.calls).toHaveLength(1));
  expect(
    f.client.getQueryData<
      InfiniteData<CommunityPageResponse<ContactUser & { optimisticInvited?: boolean }>>
    >(inviteesKey)?.pages[0].items,
  ).toEqual([{ ...friend, optimisticInvited: true }, other]);
  const invited = groupMembershipSchema.parse({
    ...membership(friendId),
    status: "PENDING",
    version: 1,
  });
  await act(async () => {
    gate.resolve(Response.json(invited));
    await pending;
  });
  expect(
    f.client.getQueryData<InfiniteData<CommunityPageResponse<ContactUser>>>(inviteesKey)?.pages[0]
      .items,
  ).toEqual([other]);
  expect(f.hook.result.current.detail.data?.memberCount).toBe(2);
  expect(f.calls[0].input).toEqual({ userId: friendId });
});

it.each(["ban", "revoke"] as const)(
  "reconciles a %s through real people refreshes without fabricating restored membership",
  async (action) => {
    const f = setup(dto(), true);
    const banned: GroupBan = groupBanSchema.parse({
      id: logoId,
      groupId: id,
      userId: guest,
      adminUserId: owner,
      until: null,
      createdAt: at,
      updatedAt: at,
    });
    const bannedPerson: GroupPersonResponse = { ...person(), membership: null, ban: banned };
    if (action === "revoke") {
      f.state.accepted = [];
      f.state.bans = [bannedPerson];
      f.client.setQueryData(f.keys.accepted, page([]));
      f.client.setQueryData(f.keys.bans, page(f.state.bans));
    }
    f.respond((url, init) => {
      if (init.method === "POST" || init.method === "DELETE") {
        f.state.accepted = [];
        f.state.bans = action === "ban" ? [bannedPerson] : [];
        f.state.group = { ...f.state.group, memberCount: 1 };
        return Response.json(
          action === "ban" ? banned : groupBanSchema.parse({ ...banned, revokedAt: at }),
        );
      }
      return f.read(url);
    });
    await act(async () => {
      if (action === "ban")
        await f.hook.result.current.actions.ban.mutateAsync({
          id,
          input: { userId: guest, until: null },
        });
      else await f.hook.result.current.actions.revoke.mutateAsync({ id, userId: guest });
    });
    await waitFor(() => expect(f.hook.result.current.actions[action].isSuccess).toBe(true));
    expect(f.hook.result.current.accepted.items).toEqual([]);
    expect(f.hook.result.current.bans.items).toEqual(f.state.bans);
    expect(f.hook.result.current.detail.data?.memberCount).toBe(1);
    expect(
      f.calls.some(
        (call) => call.method === "GET" && call.url.searchParams.get("mode") === "accepted",
      ),
    ).toBe(true);
    expect(
      f.calls.some((call) => call.method === "GET" && call.url.searchParams.get("mode") === "bans"),
    ).toBe(true);
  },
);

it("fences a pending update before its late token can recreate a purged session or alter the next account", async () => {
  const f = setup();
  const token = Promise.withResolvers<string>();
  const getToken = vi.fn(() => token.promise);
  f.hook.rerender({ ...f.options, getToken });
  let pending!: Promise<unknown>;
  act(() => {
    pending = f.hook.result.current.actions.update
      .mutateAsync({ id, input: { name: "Old account edit", version: 3 } })
      .catch((error) => error);
  });
  await waitFor(() => expect(getToken).toHaveBeenCalledTimes(1));
  const nextOwner = { ...f.options, userId: "user_next" };
  const nextGroup = dto(record(), nextOwner.userId, membership(nextOwner.userId));
  const nextKey = groupRecordKeys.detail(nextOwner, id);
  act(() => {
    clearSessionQueryCache(f.client);
    f.client.setQueryData(nextKey, nextGroup);
    f.hook.rerender(nextOwner);
  });
  await act(async () => {
    token.resolve("token-1");
    await pending;
  });
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.client.getQueryData(nextKey)).toEqual(nextGroup);
  expect(f.client.getQueryData(f.keys.detail)).toBeUndefined();
  expect(f.options.feedback.onError).not.toHaveBeenCalled();
});
