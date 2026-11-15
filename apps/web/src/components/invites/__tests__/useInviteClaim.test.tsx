// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionQueryCache } from "../../../../../../packages/shared/src/common/optimisticOperation";
import type { CommunityApiOptions } from "../../../../../../packages/shared/src/community/communityApi";
import { useInviteClaim } from "../../../../../../packages/shared/src/invites/hooks/useInviteClaim";

const groupId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const tableId = "00000000-0000-4000-8000-000000000003";
const identity = { id: "inviter", name: "Owner", username: "owner", avatarUrl: null };
const friend = { kind: "FRIEND", inviter: identity, expiresAt: "2030-01-01T00:00:00Z" };
const table = {
  ...friend,
  kind: "TABLE",
  group: { id: groupId },
  event: { id: eventId },
  table: { id: tableId },
};
const receipt = {
  success: true,
  inviter: { id: "inviter", name: "Owner", email: "owner@test.invalid", avatarUrl: null },
};
const tableReceipt = { ...receipt, table: { groupId, eventId, tableId, position: "WAITING" } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  review: unknown = friend,
  overrides: Partial<CommunityApiOptions> = {},
  token = "invite-token",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const options: CommunityApiOptions = {
    apiUrl: "https://api.example.test",
    userId: "owner",
    getToken: vi.fn().mockResolvedValue("fresh-token"),
    ...overrides,
  };
  const fetcher = vi
    .fn()
    .mockImplementation((_url: unknown, input: RequestInit) =>
      Promise.resolve(Response.json(input.method === "POST" ? receipt : review)),
    );
  vi.stubGlobal("fetch", fetcher);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useInviteClaim(options, token), { wrapper });
  return {
    ...hook,
    options,
    client,
    fetcher,
    reviewKey: ["invites", options.apiUrl, options.userId, "review", token],
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("useInviteClaim", () => {
  it("loads an owner-scoped fresh-token review, consumes once and reconciles only owned caches", async () => {
    const s = setup();
    await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
    expect(s.fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/invites/invite-token",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
      }),
    );
    const keys = [
      ["contacts", "friends", s.options.apiUrl, "owner"],
      ["contacts", "search:other", s.options.apiUrl, "owner"],
      ...[
        "groups",
        "events",
        "profile",
        "notifications",
        "notification-attention",
        "notification-changes",
      ].map((root) => [root, s.options.apiUrl, "owner"]),
    ];
    const foreign = [
      ["contacts", "friends", "other-api", "owner"],
      ["contacts", "friends", s.options.apiUrl, "other"],
      ["events", s.options.apiUrl, "other"],
      ["profile", "other-api", "owner"],
      ["unrelated", s.options.apiUrl, "owner"],
    ];
    for (const key of [...keys, ...foreign]) s.client.setQueryData(key, { unchanged: true });
    const promise = s.result.current.claim.mutateAsync({});
    await act(async () => {
      await promise;
    });
    await waitFor(() => expect(s.result.current.claim.isSuccess).toBe(true));
    for (const key of keys) expect(s.client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of foreign) expect(s.client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(s.client.getQueryState(s.reviewKey)?.isInvalidated).toBe(false);
    await s.client.invalidateQueries({ queryKey: s.reviewKey });
    expect(s.fetcher).toHaveBeenCalledTimes(2);
    expect(s.result.current.claim.data).toEqual(receipt);
    expect(s.options.getToken).toHaveBeenCalledTimes(2);
  });
  it("sends explicit Table consent and preferences and validates the matching authoritative queue receipt", async () => {
    const s = setup(table);
    await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
    s.fetcher.mockResolvedValue(Response.json(tableReceipt));
    const participation = { version: 1, gameVotes: { "1": "YES" as const } };
    await act(async () => {
      await s.result.current.claim.mutateAsync({ consent: true, participation });
    });
    expect(JSON.parse(String(s.fetcher.mock.calls[1][1].body))).toEqual({
      token: "invite-token",
      consent: true,
      participation,
    });
    await waitFor(() => expect(s.result.current.claim.data?.table).toEqual(tableReceipt.table));
  });
  it.each([
    { success: false, inviter: null },
    { success: true },
    { ...receipt, table: { ...tableReceipt.table, position: "UNKNOWN" } },
    receipt,
    { ...tableReceipt, table: { ...tableReceipt.table, groupId: eventId } },
    { ...tableReceipt, table: { ...tableReceipt.table, eventId: groupId } },
    { ...tableReceipt, table: { ...tableReceipt.table, tableId: groupId } },
  ])("rejects a malformed or mismatched Table receipt: %j", async (response) => {
    const s = setup(table);
    await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
    s.fetcher.mockResolvedValue(Response.json(response));
    await expect(s.result.current.claim.mutateAsync({ consent: true })).rejects.toThrow(
      "MUTATION_OUTCOME_UNKNOWN",
    );
    expect(s.result.current.claim.data).toBeUndefined();
  });
  it("preserves failed reads as errors and never claims without a review", async () => {
    const s = setup(undefined, { enabled: false });
    expect(s.result.current.review.isError).toBe(false);
    s.fetcher.mockResolvedValue(new Response("offline", { status: 503 }));
    await act(async () => {
      const result = await s.result.current.review.refetch();
      expect(result.status).toBe("error");
    });
    await waitFor(() => expect(s.result.current.review.isError).toBe(true));
    await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow("Unauthorized");
  });
  it.each([{ userId: null }, { enabled: false }, { apiUrl: "" }])(
    "does not load a disabled owner: %j",
    async (options) => {
      const s = setup(friend, options);
      await act(async () => {
        await Promise.resolve();
      });
      expect(s.fetcher).not.toHaveBeenCalled();
    },
  );
  it("requires review and explicit contextual consent without dispatching a write", async () => {
    const s = setup(table);
    await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
    await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow(
      "TABLE_INVITE_CONSENT_REQUIRED",
    );
    s.client.removeQueries({ queryKey: s.reviewKey });
    await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow("INVITE_REVIEW_REQUIRED");
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not load or consume an empty token", async () => {
    const s = setup(friend, {}, "");
    await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow("Unauthorized");
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("aborts an in-flight review on session purge", async () => {
    const request = deferred<Response>();
    const s = setup(friend, { enabled: false });
    s.options.enabled = true;
    s.fetcher.mockReturnValue(request.promise);
    s.rerender();
    await waitFor(() => expect(s.fetcher).toHaveBeenCalledOnce());
    const signal = s.fetcher.mock.calls[0][1].signal;
    clearSessionQueryCache(s.client);
    expect(signal?.aborted).toBe(true);
    s.options.enabled = false;
    s.rerender();
    request.resolve(Response.json(friend));
    await act(async () => {
      await request.promise;
    });
    expect(s.client.getQueryData(s.reviewKey)).toBeUndefined();
  });
  it("aborts a pending claim and ignores a late server success after session purge", async () => {
    const s = setup();
    await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
    const request = deferred<Response>();
    s.fetcher.mockReturnValue(request.promise);
    const promise = s.result.current.claim.mutateAsync({});
    await waitFor(() => expect(s.fetcher).toHaveBeenCalledTimes(2));
    const signal = s.fetcher.mock.calls[1][1].signal;
    clearSessionQueryCache(s.client);
    s.options.enabled = false;
    s.rerender();
    expect(signal?.aborted).toBe(true);
    request.resolve(Response.json(receipt));
    await expect(promise).rejects.toThrow("MUTATION_OWNER_CHANGED");
    expect(
      s.client
        .getQueryCache()
        .getAll()
        .every((q) => q.state.data === undefined),
    ).toBe(true);
  });
  it("does not send a claim if session purge occurs while obtaining a fresh token", async () => {
    const s = setup();
    await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
    const token = deferred<string | null>();
    s.options.getToken = () => token.promise;
    const promise = s.result.current.claim.mutateAsync({});
    await waitFor(() => expect(s.result.current.claim.isPending).toBe(true));
    clearSessionQueryCache(s.client);
    s.options.enabled = false;
    s.rerender();
    token.resolve("next-session-token");
    await expect(promise).rejects.toThrow();
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
});

it("keeps a reviewed invitation available after a lost claim response and retries its receipt without GET", async () => {
  const s = setup(table);
  await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
  s.fetcher.mockRejectedValueOnce(new Error("connection lost"));
  await expect(s.result.current.claim.mutateAsync({ consent: true })).rejects.toThrow(
    "connection lost",
  );
  await waitFor(() => expect(s.result.current.claim.isError).toBe(true));
  expect(s.result.current.review.data).toEqual(table);
  expect(s.fetcher).toHaveBeenCalledTimes(2);
  s.fetcher.mockImplementation((_url: unknown, input: RequestInit) =>
    Promise.resolve(
      input.method === "POST" ? Response.json(tableReceipt) : new Response(null, { status: 409 }),
    ),
  );
  await act(async () => {
    await s.result.current.claim.mutateAsync({ consent: true });
  });
  await waitFor(() => expect(s.result.current.claim.isSuccess).toBe(true));
  expect(s.result.current.claim.data?.table).toEqual(tableReceipt.table);
  expect(s.fetcher.mock.calls.map(([, input]) => input.method)).toEqual(["GET", "POST", "POST"]);
});

it("requires a fresh session for claim even when the review is cached", async () => {
  const s = setup();
  await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
  s.options.getToken = vi.fn().mockResolvedValue(null);
  await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow("Unauthorized");
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});

it("rejects a review disappearing before dispatch and never sends a write", async () => {
  const s = setup();
  await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
  vi.spyOn(s.client, "cancelQueries").mockImplementationOnce(async () => {
    s.client.removeQueries({ queryKey: s.reviewKey });
  });
  await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow("INVITE_REVIEW_REQUIRED");
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});

it("rejects a malformed cached review kind", async () => {
  const s = setup({ kind: "unknown" });
  await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
  await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow("INVITE_REVIEW_REQUIRED");
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});

it("does not reconcile a consumed receipt into a cleared account", async () => {
  const s = setup();
  await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
  const invalidate = vi.spyOn(s.client, "invalidateQueries");
  s.client.getMutationCache().config.onSuccess = () => {
    clearSessionQueryCache(s.client);
    s.options.enabled = false;
  };
  await act(async () => {
    await s.result.current.claim.mutateAsync({});
  });
  expect(invalidate).not.toHaveBeenCalled();
  expect(s.client.getQueryData(s.reviewKey)).toBeUndefined();
});

it("coalesces concurrent claim attempts to one HTTP write", async () => {
  const s = setup();
  await waitFor(() => expect(s.result.current.review.isSuccess).toBe(true));
  const request = deferred<Response>();
  s.fetcher.mockReturnValue(request.promise);
  const first = s.result.current.claim.mutateAsync({});
  await waitFor(() => expect(s.fetcher).toHaveBeenCalledTimes(2));
  await expect(s.result.current.claim.mutateAsync({})).rejects.toThrow("MUTATION_IN_PROGRESS");
  request.resolve(Response.json(receipt));
  await act(async () => {
    await first;
  });
  expect(s.fetcher).toHaveBeenCalledTimes(2);
});
