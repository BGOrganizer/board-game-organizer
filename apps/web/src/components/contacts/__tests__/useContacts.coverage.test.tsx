import type {
  BggCollectionResponse,
  GroupPersonResponse,
  ProfileView,
} from "@board-game-organizer/schemas";
import {
  bggCollectionQuery,
  clearSessionQueryCache,
  contactSuggestionsKey,
  globalLeaderboardKey,
  groupRecordKeys,
  profileViewKeys,
  relationshipListKey,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  type ContactUser,
  fetchRelationshipPageWithToken,
  fetchSuggestions,
  fetchSuggestionsWithToken,
  type RelationshipListType,
  reportPresence,
  useContactActions,
  useContacts,
} from "../../../../../../packages/shared/src/contacts/hooks/useContacts";

const API = "https://contacts-hook-coverage.test";
const groupId = "11111111-1111-4111-8111-111111111111";
const kinds: RelationshipListType[] = [
  "friends",
  "following",
  "followers",
  "pending",
  "sent",
  "blocked",
];
const target: ContactUser = {
  id: "guest",
  name: "Guest",
  username: "guest",
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  isFriend: true,
};
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const getToken = vi.fn(async () => "fresh-contact-token");
  const feedback = { onSuccess: vi.fn(), onError: vi.fn(), onOptimisticUpdate: vi.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, getToken, feedback, wrapper };
}
function suggestions(hasContacts = false) {
  return { pages: [{ users: [], hasContacts, nextCursor: null }], pageParams: [""] };
}
function seedLists(client: QueryClient, owner = "viewer") {
  for (const kind of kinds)
    client.setQueryData(relationshipListKey(API, owner, kind), {
      pages: [{ rows: [], nextCursor: null }],
      pageParams: [""],
    });
  client.setQueryData(contactSuggestionsKey(API, owner), suggestions());
}
function deferred() {
  let finish: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(response: Response) {
      if (!finish) throw new Error("Expected a controlled Contacts response");
      finish(response);
    },
  };
}
function urlOf(input: RequestInfo | URL) {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it.each(["block", "unblock"] as const)(
  "refreshes only the owned global rankings after %s",
  async (action) => {
    const { client, getToken, wrapper } = setup();
    const keys = ["viewer", "another-user"].map((userId) => [
      ...globalLeaderboardKey(API, userId),
      null,
      "players",
      1,
      "rating",
      "desc",
    ]);
    for (const key of keys)
      client.setQueryData(key, {
        pages: [{ players: [target], games: [], nextCursor: null }],
        pageParams: [0],
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    const hook = renderHook(() => useContactActions(API, null, getToken, undefined, "viewer"), {
      wrapper,
    });

    await act(async () => {
      await hook.result.current[action].mutateAsync({
        targetUserId: target.id,
        targetUser: target,
      });
    });

    if (action === "block") expect(client.getQueryData(keys[0])).toBeUndefined();
    else expect(client.getQueryState(keys[0])?.isInvalidated).toBe(true);
    expect(client.getQueryData(keys[1])).toMatchObject({ pages: [{ players: [target] }] });
    expect(client.getQueryState(keys[1])?.isInvalidated).toBe(false);
  },
);

it.each([undefined, true, false])(
  "normalizes the public suggestions adapter's optional hasContacts=%s without exposing a different credential",
  async (hasContacts) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      expect(url.pathname).toBe("/api/users/suggestions");
      expect(url.searchParams.get("x-vercel-protection-bypass")).toBe("fixture-bypass");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh");
      return Response.json({
        users: [target],
        ...(hasContacts === undefined ? {} : { hasContacts }),
      });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchSuggestions(API, "fresh", "fixture-bypass")).toEqual({
      users: [target],
      hasContacts: hasContacts ?? false,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it.each(["null", "rejected"] as const)(
  "falls back to the explicitly supplied legacy token when a fresh-token provider is %s",
  async (state) => {
    const getToken = vi.fn<() => Promise<string | null>>();
    if (state === "null") getToken.mockResolvedValue(null);
    else getToken.mockRejectedValue(new Error("SDK callback unavailable"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer snapshot-fallback");
        return Response.json({ users: [], hasContacts: false });
      }),
    );
    expect(await fetchSuggestionsWithToken(API, "snapshot-fallback", getToken)).toEqual({
      users: [],
      hasContacts: false,
    });
    expect(getToken).toHaveBeenCalledOnce();
  },
);

it("fails missing credentials before issuing a relationship request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    fetchRelationshipPageWithToken(API, null, async () => null, "friends"),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["suggestions", "presence"] as const)(
  "keeps the %s adapter's rejected HTTP response observable rather than returning empty success",
  async (adapter) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "refused" }, { status: 403 })),
    );
    await expect(
      adapter === "suggestions"
        ? fetchSuggestions(API, "snapshot")
        : reportPresence(API, "snapshot"),
    ).rejects.toThrow("HTTP 403");
  },
);

it("uses the documented online presence default and returns the authoritative timestamp", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(urlOf(input).pathname).toBe("/api/users/presence");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ status: "online" });
      return Response.json({ success: true, lastActiveAt: "2030-06-01T11:00:00.000Z" });
    }),
  );
  expect(await reportPresence(API, "snapshot")).toEqual({
    success: true,
    lastActiveAt: "2030-06-01T11:00:00.000Z",
  });
});

it("keeps an unauthenticated empty hook disabled and reports no fabricated request context", () => {
  const { wrapper } = setup();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useContacts("", null), { wrapper });
  expect(hook.result.current.suggestions.data).toBeUndefined();
  expect(hook.result.current.friendRequestContext("unknown")).toBeUndefined();
  for (const ids of Object.values(hook.result.current.knownConnectionIds)) expect(ids.size).toBe(0);
  act(() => hook.result.current.runSearch("  Ada  "));
  expect(hook.result.current.search.fetchStatus).toBe("idle");
  expect(fetcher).not.toHaveBeenCalled();
});

it("permits fresh-token relationship reads while the legacy snapshot is absent without starting suggestions or discovery", async () => {
  const { getToken, wrapper } = setup();
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      expect(url.pathname).toBe("/api/relationships");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-contact-token");
      reads.push(url.searchParams.get("type") ?? "");
      return Response.json({ rows: [], nextCursor: null });
    }),
  );
  const hook = renderHook(() => useContacts(API, null, getToken, undefined, "viewer"), { wrapper });
  await waitFor(() =>
    expect(kinds.every((kind) => hook.result.current[kind].isSuccess)).toBe(true),
  );
  act(() => hook.result.current.runSearch("Guest"));
  expect(hook.result.current.suggestions.fetchStatus).toBe("idle");
  expect(hook.result.current.search.fetchStatus).toBe("idle");
  expect(reads.sort()).toEqual([...kinds].sort());
  expect(getToken).toHaveBeenCalledTimes(6);
});

it("refreshes the mounted real relationship and suggestion observers only through the explicit refresh callback", async () => {
  const { client, getToken, wrapper } = setup();
  seedLists(client);
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      requests.push(url.pathname);
      return Response.json(
        url.pathname === "/api/relationships"
          ? { rows: [], nextCursor: null }
          : { users: [target], hasContacts: true, nextCursor: null },
      );
    }),
  );
  const hook = renderHook(() => useContacts(API, "snapshot", getToken, undefined, "viewer"), {
    wrapper,
  });
  expect(requests).toEqual([]);
  expect(hook.result.current.suggestions.data?.hasContacts).toBe(false);
  await act(() => hook.result.current.refreshContacts());
  await waitFor(() => expect(hook.result.current.suggestions.data?.users).toEqual([target]));
  expect(requests.filter((path) => path === "/api/relationships")).toHaveLength(6);
  expect(requests.filter((path) => path === "/api/users/suggestions")).toHaveLength(1);
  expect(getToken).toHaveBeenCalledTimes(7);
});

it.each([0, 2])(
  "commits silent contact synchronization with stored=%s to the owned snapshot without a user-action toast",
  async (stored) => {
    const { client, getToken, feedback, wrapper } = setup();
    const key = contactSuggestionsKey(API, "viewer");
    const foreignKey = contactSuggestionsKey(API, "other");
    const foreign = suggestions(true);
    client.setQueryData(key, suggestions());
    client.setQueryData(foreignKey, foreign);
    const response = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(urlOf(input).pathname).toBe("/api/contacts/sync");
        expect(JSON.parse(String(init?.body))).toEqual({ emails: [], phoneNumbers: [] });
        return response.promise;
      }),
    );
    const hook = renderHook(
      () => useContactActions(API, "snapshot", getToken, undefined, "viewer", feedback),
      { wrapper },
    );
    let task: Promise<unknown> | undefined;
    act(() => {
      task = hook.result.current.syncContacts.mutateAsync({
        emails: [],
        phoneNumbers: [],
        silent: true,
      });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(client.getQueryData(key)).toMatchObject({ pages: [{ hasContacts: true }] });
    expect(client.getQueryData(foreignKey)).toBe(foreign);
    await act(async () => {
      response.resolve(
        Response.json({
          stored,
          users: [],
          registeredIdentifiers: { emails: [], phoneNumbers: [] },
        }),
      );
      await task;
    });
    expect(client.getQueryData(key)).toMatchObject({ pages: [{ hasContacts: stored > 0 }] });
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    expect(feedback.onError).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "rolls back a definitively refused sync and honors silent=%s instead of fabricating an empty successful address book",
  async (silent) => {
    const { client, getToken, feedback, wrapper } = setup();
    const key = contactSuggestionsKey(API, "viewer");
    const before = suggestions();
    client.setQueryData(key, before);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "CONTACTS_REFUSED" }, { status: 400 })),
    );
    const hook = renderHook(
      () => useContactActions(API, "snapshot", getToken, undefined, "viewer", feedback),
      { wrapper },
    );
    await act(() =>
      hook.result.current.syncContacts
        .mutateAsync({ emails: [], phoneNumbers: [], silent })
        .catch((error: Error) => expect(error.message).toBe("HTTP 400")),
    );
    expect(client.getQueryData(key)).toEqual(before);
    await waitFor(() => expect(hook.result.current.syncContacts.isError).toBe(true));
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    if (silent) expect(feedback.onError).not.toHaveBeenCalled();
    else expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "sync_contacts");
  },
);

it.each(["success", "refused"] as const)(
  "ignores an old session's late %s synchronization result and feedback after cache purge",
  async (outcome) => {
    const { client, getToken, feedback, wrapper } = setup();
    const oldKey = contactSuggestionsKey(API, "viewer");
    client.setQueryData(oldKey, suggestions());
    const response = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response.promise),
    );
    const hook = renderHook(
      () => useContactActions(API, "snapshot", getToken, undefined, "viewer", feedback),
      { wrapper },
    );
    let task: Promise<unknown> | undefined;
    act(() => {
      task = hook.result.current.syncContacts
        .mutateAsync({ emails: [], phoneNumbers: [] })
        .catch((error: Error) => {
          if (outcome === "success") throw error;
          expect(error.message).toBe("HTTP 400");
        });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(() => clearSessionQueryCache(client));
    const replacementKey = contactSuggestionsKey(API, "replacement");
    const replacement = suggestions(false);
    client.setQueryData(replacementKey, replacement);
    await act(async () => {
      response.resolve(
        outcome === "success"
          ? Response.json({
              stored: 2,
              users: [],
              registeredIdentifiers: { emails: [], phoneNumbers: [] },
            })
          : Response.json({ error: "REFUSED" }, { status: 400 }),
      );
      await task;
    });
    expect(client.getQueryData(oldKey)).toBeUndefined();
    expect(client.getQueryData(replacementKey)).toBe(replacement);
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    expect(feedback.onError).not.toHaveBeenCalled();
  },
);

it("rejects duplicate synchronization before the second HTTP request while preserving the first pending outcome", async () => {
  const { client, getToken, feedback, wrapper } = setup();
  client.setQueryData(contactSuggestionsKey(API, "viewer"), suggestions());
  const response = deferred();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response.promise),
  );
  const hook = renderHook(
    () => useContactActions(API, "snapshot", getToken, undefined, "viewer", feedback),
    { wrapper },
  );
  let first: Promise<unknown> | undefined;
  act(() => {
    first = hook.result.current.syncContacts.mutateAsync({
      emails: [],
      phoneNumbers: [],
      silent: true,
    });
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(() =>
    hook.result.current.syncContacts
      .mutateAsync({ emails: [], phoneNumbers: [], silent: true })
      .catch((error: Error) => expect(error.message).toBe("MUTATION_IN_PROGRESS")),
  );
  expect(fetch).toHaveBeenCalledOnce();
  await act(async () => {
    response.resolve(
      Response.json({
        stored: 0,
        users: [],
        registeredIdentifiers: { emails: [], phoneNumbers: [] },
      }),
    );
    await first;
  });
  expect(client.getQueryData(contactSuggestionsKey(API, "viewer"))).toMatchObject({
    pages: [{ hasContacts: false }],
  });
  expect(feedback.onError).not.toHaveBeenCalled();
});

it.each([true, false])(
  "blocks only the selected profile/collection/social projections and preserves other API/account/legacy-own caches, saved=%s",
  async (saved) => {
    const { client, getToken, feedback, wrapper } = setup();
    const owner = { apiUrl: API, userId: "viewer", getToken };
    const profile: ProfileView = {
      id: target.id,
      name: target.name,
      username: target.username ?? null,
      avatarUrl: null,
      social: { friends: 1, followers: 0, following: 0 },
      player: { gamesPlayed: 0, gamesWon: 0, winRate: 0 },
    };
    const profileKey = profileViewKeys.view(owner, target.id);
    const foreignProfileKey = profileViewKeys.view({ ...owner, userId: "other" }, target.id);
    const source: BggCollectionResponse = {
      snapshot: "snapshot",
      counts: null,
      items: [],
      nextCursor: null,
    };
    const collection = { pages: [source], pageParams: [""] };
    const collectionKey = bggCollectionQuery({
      ...owner,
      snapshot: "snapshot",
      query: "",
      subjectId: target.id,
    }).queryKey;
    const unrelatedKey = bggCollectionQuery({
      ...owner,
      snapshot: "snapshot",
      query: "",
      subjectId: "unrelated",
    }).queryKey;
    const legacyOwnKey = bggCollectionQuery({
      ...owner,
      snapshot: "snapshot",
      query: "",
    }).queryKey.slice(0, 5);
    const foreignApiKey = bggCollectionQuery({
      ...owner,
      apiUrl: "https://other-api.test",
      snapshot: "snapshot",
      query: "",
      subjectId: target.id,
    }).queryKey;
    const peopleKey = groupRecordKeys.people(owner, groupId, "accepted", "");
    const person: GroupPersonResponse = {
      userId: target.id,
      name: target.name,
      username: target.username ?? null,
      avatarUrl: null,
      isAdmin: false,
      membership: null,
      ban: null,
      social: { isFriend: true, isFollowing: false, isFollower: false, blockedByMe: false },
    };
    const people = { pages: [{ items: [person], nextCursor: null }], pageParams: [""] };
    client.setQueryData(profileKey, profile);
    client.setQueryData(foreignProfileKey, profile);
    client.setQueryData(peopleKey, people);
    for (const key of [collectionKey, unrelatedKey, legacyOwnKey, foreignApiKey])
      client.setQueryData(key, collection);
    const response = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response.promise),
    );
    const hook = renderHook(
      () => useContactActions(API, "snapshot", getToken, undefined, "viewer", feedback),
      { wrapper },
    );
    let task: Promise<unknown> | undefined;
    act(() => {
      task = hook.result.current.block
        .mutateAsync({ targetUserId: target.id, targetUser: target })
        .catch((error: Error) => {
          if (saved) throw error;
          expect(error.message).toBe("HTTP 400");
        });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(client.getQueryData(profileKey)).toBeNull();
    expect(client.getQueryData(collectionKey)).toBeNull();
    expect(client.getQueryData(peopleKey)).toMatchObject({
      pages: [{ items: [{ social: { blockedByMe: true, isFriend: false } }] }],
    });
    for (const key of [unrelatedKey, legacyOwnKey, foreignApiKey])
      expect(client.getQueryData(key)).toBe(collection);
    expect(client.getQueryData(foreignProfileKey)).toBe(profile);
    await act(async () => {
      response.resolve(Response.json({ success: saved }, { status: saved ? 200 : 400 }));
      await task;
    });
    expect(client.getQueryData(profileKey)).toEqual(saved ? null : profile);
    expect(client.getQueryData(collectionKey)).toEqual(saved ? null : collection);
    expect(client.getQueryData(foreignProfileKey)).toBe(profile);
    expect(hook.result.current.isBusy(target.id)).toBe(false);
  },
);

it.each([200, 400])(
  "does not report or invalidate a retired account's relationship receipt (HTTP %s)",
  async (status) => {
    const { client, getToken, feedback, wrapper } = setup();
    seedLists(client);
    const response = deferred();
    const send = vi.fn(async (_url: string, _init?: RequestInit) => response.promise);
    vi.stubGlobal("fetch", send);
    const { result } = renderHook(
      () => useContactActions(API, "previous-session", getToken, undefined, "viewer", feedback),
      { wrapper },
    );
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.follow.mutateAsync({ targetUserId: target.id, targetUser: target });
      void pending.catch(() => undefined);
    });
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const [url, request] = send.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/relationships");
    expect(new Headers(request?.headers).get("authorization")).toBe("Bearer fresh-contact-token");
    await act(async () => {
      clearSessionQueryCache(client);
      seedLists(client, "new-viewer");
      response.resolve(Response.json({ success: status === 200 }, { status }));
      await pending?.catch(() => undefined);
    });
    expect(client.getQueryData(contactSuggestionsKey(API, "viewer"))).toBeUndefined();
    expect(client.getQueryState(contactSuggestionsKey(API, "new-viewer"))?.isInvalidated).toBe(
      false,
    );
    expect(feedback.onError).not.toHaveBeenCalled();
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  },
);

it("uses the legacy caller's isolated contacts scope while sending the fresh token for synchronization", async () => {
  const { client, getToken, feedback, wrapper } = setup();
  const scope = "prior-sdk-token";
  const subject = contactSuggestionsKey(API, scope);
  seedLists(client, scope);
  seedLists(client, "another-viewer");
  const request = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({
      stored: 1,
      users: [],
      registeredIdentifiers: { emails: ["guest@example.test"], phoneNumbers: [] },
    }),
  );
  vi.stubGlobal("fetch", request);
  const { result } = renderHook(
    () => useContactActions(API, scope, getToken, undefined, undefined, feedback),
    { wrapper },
  );
  expect(result.current.isBusy(target.id)).toBe(false);
  await act(async () => {
    await result.current.syncContacts.mutateAsync({
      emails: ["guest@example.test"],
      phoneNumbers: [],
    });
  });
  const [[url, send]] = request.mock.calls;
  expect(new URL(url).pathname).toBe("/api/contacts/sync");
  expect(new Headers(send?.headers).get("authorization")).toBe("Bearer fresh-contact-token");
  expect(client.getQueryData(subject)).toMatchObject({ pages: [{ hasContacts: true }] });
  expect(client.getQueryData(contactSuggestionsKey(API, "another-viewer"))).toEqual(suggestions());
});
