import type { OrganizationResponse } from "@board-game-organizer/schemas";
import {
  organizationKeys,
  patchOrganizationData,
  useOrganization,
  useOrganizationActions,
  useOrganizationList,
  useOrganizationMembers,
  useOrganizationReview,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const row = {
  id: "org",
  name: "Board Club",
  role: "admin",
  location: { address: "Old address" },
  logoAssetId: "logo",
  version: 1,
} as OrganizationResponse;
function setup(feedback = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const options = {
    apiUrl: "https://api.test",
    userId: "admin",
    getToken: vi.fn(async () => "fresh"),
    feedback: feedback ? { onOptimisticUpdate: vi.fn(), onError: vi.fn() } : undefined,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("organization query ownership", () => {
  it("paginates at source and resolves a fresh token for each page", async () => {
    const { options, wrapper } = setup();
    const fetch = vi.fn(
      async (_url: string) =>
        new Response(
          JSON.stringify(
            fetch.mock.calls.length === 1
              ? { items: [row], nextCursor: "cursor" }
              : { items: [{ ...row, id: "other" }], nextCursor: null },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useOrganizationList(options), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() =>
      expect(result.current.items.map((item) => item.id)).toEqual(["org", "other"]),
    );
    expect(fetch.mock.calls[1][0]).toContain("cursor=cursor");
    expect(options.getToken).toHaveBeenCalledTimes(2);
  });
  it("requires 4 characters for public discovery and honors disabled sessions", async () => {
    const { options, wrapper } = setup();
    const fetch = vi.fn(async (_url: string) => new Response('{"items":[],"nextCursor":null}'));
    vi.stubGlobal("fetch", fetch);
    const { result, rerender } = renderHook(
      ({ query, enabled }) => useOrganizationList({ ...options, enabled }, "public", query),
      { wrapper, initialProps: { query: "abc", enabled: true } },
    );
    expect(fetch).not.toHaveBeenCalled();
    rerender({ query: "club", enabled: false });
    expect(fetch).not.toHaveBeenCalled();
    rerender({ query: "club", enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch.mock.calls[0][0]).toContain("scope=public&limit=20&query=club");
  });
  it("seeds only owning complete cached mine rows and never foreign API/user entries", async () => {
    const { options, client, wrapper } = setup();
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(row)));
    vi.stubGlobal("fetch", fetch);
    client.setQueryData(organizationKeys.list({ ...options, userId: "foreign" }, "mine", ""), {
      pages: [{ items: [{ ...row, name: "Private foreign proposal" }], nextCursor: null }],
      pageParams: [""],
    });
    const first = renderHook(() => useOrganization(options, row.id), { wrapper });
    await waitFor(() => expect(first.result.current.data?.name).toBe("Board Club"));
    expect(fetch).toHaveBeenCalledOnce();
    first.unmount();
    client.removeQueries({ queryKey: organizationKeys.detail(options, row.id) });
    client.setQueryData(organizationKeys.list(options, "mine", ""), {
      pages: [{ items: [row], nextCursor: null }],
      pageParams: [""],
    });
    const second = renderHook(() => useOrganization(options, row.id), { wrapper });
    expect(second.result.current.data?.name).toBe("Board Club");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("loads private moderator detail through its separately authorized endpoint", async () => {
    const { options, wrapper } = setup();
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(row)));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useOrganizationReview(options, row.id), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch.mock.calls[0][0]).toBe("https://api.test/api/organizations/org/review");
  });
  it("pages membership modes and permits disabled private panes", async () => {
    const { options, wrapper } = setup();
    const fetch = vi.fn(async (_url: string) => new Response('{"items":[],"nextCursor":null}'));
    vi.stubGlobal("fetch", fetch);
    const { result, rerender } = renderHook(
      ({ enabled }) => useOrganizationMembers({ ...options, enabled }, row.id, "excluded", "alex"),
      { wrapper, initialProps: { enabled: false } },
    );
    expect(fetch).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.test/api/organizations/org/members?mode=excluded&limit=20&query=alex",
    );
  });
});
describe("organization writes and rollback", () => {
  it("patches supported cache shapes immutably and preserves unknown cache payloads", () => {
    const patch = (item: OrganizationResponse) => ({ ...item, name: "Changed" });
    for (const value of [null, undefined, "text", [], {}, { pages: "invalid" }])
      expect(patchOrganizationData(value, patch)).toBe(value);
    expect(patchOrganizationData(row, () => null)).toBe(row);
    expect(
      patchOrganizationData(
        { pages: [{ items: [row], nextCursor: null }], pageParams: [""] },
        () => null,
      ),
    ).toEqual({ pages: [{ items: [], nextCursor: null }], pageParams: [""] });
  });
  it("leaves unrelated rows intact and invalidates only owning match identities", async () => {
    const { options, client, wrapper } = setup(false);
    const otherRow = { ...row, id: "other", role: "accepted" };
    client.setQueryData(organizationKeys.detail(options, "other"), otherRow);
    client.setQueryData(organizationKeys.list(options, "mine", ""), {
      pages: [{ items: [row, otherRow], nextCursor: null }],
      pageParams: [""],
    });
    const matches = ["matches", "detail", "match", options.apiUrl, options.userId];
    const foreignMatches = ["matches", "detail", "match", options.apiUrl, "other"];
    const otherApi = ["matches", "detail", "match", "https://foreign.test", options.userId];
    for (const key of [matches, foreignMatches, otherApi])
      client.setQueryData(key, { name: "Cached" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ...row, version: 2 }))),
    );
    const { result } = renderHook(() => useOrganizationActions(options), { wrapper });
    await act(() =>
      result.current.update.mutateAsync({
        id: row.id,
        input: { name: "Updated", location: row.location, logoAssetId: "logo", version: 1 },
      }),
    );
    await act(() => result.current.requestJoin.mutateAsync("other"));
    await act(() =>
      result.current.membership.mutateAsync({ id: row.id, userId: "other", action: "remove" }),
    );
    expect(client.getQueryData(organizationKeys.detail(options, "other"))).toEqual(otherRow);
    expect(client.getQueryState(matches)?.isInvalidated).toBe(true);
    expect(client.getQueryState(foreignMatches)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherApi)?.isInvalidated).toBe(false);
  });
  it("handles cancellation failure before snapshots without fabricating feedback", async () => {
    const { options, client, wrapper } = setup();
    vi.spyOn(client, "cancelQueries").mockRejectedValueOnce(new Error("Cancellation failed"));
    const { result } = renderHook(() => useOrganizationActions(options), { wrapper });
    await act(async () => {
      await expect(
        result.current.create.mutateAsync({
          name: "New org",
          location: row.location,
          logoAssetId: "logo",
        }),
      ).rejects.toThrow("Cancellation failed");
    });
    expect(options.feedback?.onError).not.toHaveBeenCalled();
  });
  it("rolls back each non-update mutation failure with optional feedback", async () => {
    const { options, client, wrapper } = setup(false);
    client.setQueryData(organizationKeys.detail(options, row.id), row);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"Denied"}', { status: 403 })),
    );
    const { result } = renderHook(() => useOrganizationActions(options), { wrapper });
    await act(async () => {
      await expect(
        result.current.create.mutateAsync({
          name: "New org",
          location: row.location,
          logoAssetId: "logo",
        }),
      ).rejects.toThrow("Denied");
      await expect(
        result.current.review.mutateAsync({
          id: row.id,
          input: { decision: "approve", version: 1 },
        }),
      ).rejects.toThrow("Denied");
      await expect(result.current.requestJoin.mutateAsync(row.id)).rejects.toThrow("Denied");
      await expect(
        result.current.invite.mutateAsync({ id: row.id, userId: "other" }),
      ).rejects.toThrow("Denied");
      await expect(
        result.current.membership.mutateAsync({ id: row.id, userId: "admin", action: "cancel" }),
      ).rejects.toThrow("Denied");
    });
    expect(client.getQueryData(organizationKeys.detail(options, row.id))).toEqual(row);
  });
  it("cancels owning reads first, rolls back failure and leaves foreign caches untouched", async () => {
    const { options, client, wrapper } = setup();
    const detailKey = organizationKeys.detail(options, row.id);
    const listKey = organizationKeys.list(options, "mine", "");
    client.setQueryData(detailKey, row);
    client.setQueryData(listKey, { pages: [{ items: [row], nextCursor: null }], pageParams: [""] });
    const foreign = organizationKeys.detail({ ...options, userId: "other" }, row.id);
    client.setQueryData(foreign, row);
    const cancel = vi.spyOn(client, "cancelQueries");
    let reject: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            reject = resolve;
          }),
      ),
    );
    const { result } = renderHook(() => useOrganizationActions(options), { wrapper });
    let promise: Promise<unknown>;
    act(() => {
      promise = result.current.update
        .mutateAsync({
          id: row.id,
          input: {
            name: "New proposal",
            logoAssetId: "new-logo",
            location: row.location,
            version: 1,
          },
        })
        .catch((error) => error);
    });
    await waitFor(() =>
      expect(options.feedback?.onOptimisticUpdate).toHaveBeenCalledWith("update_organization"),
    );
    expect(cancel).toHaveBeenCalledWith({ queryKey: organizationKeys.root(options) });
    expect(client.getQueryData<OrganizationResponse>(detailKey)?.name).toBe("New proposal");
    expect(client.getQueryData(foreign)).toBe(row);
    await act(async () => {
      reject(new Response('{"error":"ORGANIZATION_CHANGED"}', { status: 409 }));
      await promise;
    });
    expect(client.getQueryData(detailKey)).toEqual(row);
    expect(options.feedback?.onError).toHaveBeenCalledWith(
      expect.any(Error),
      "update_organization",
    );
  });
  it("reconciles server ids and versions without inventing creation or approval records", async () => {
    const { options, client, wrapper } = setup(false);
    const listKey = organizationKeys.list(options, "mine", "");
    client.setQueryData(listKey, { pages: [{ items: [row], nextCursor: null }], pageParams: [""] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ...row, name: "Server name", version: 2 }))),
    );
    const { result } = renderHook(() => useOrganizationActions(options), { wrapper });
    await act(() =>
      result.current.create.mutateAsync({
        name: "Requested name",
        logoAssetId: "logo",
        location: row.location,
      }),
    );
    expect(
      client.getQueryData<OrganizationResponse>(organizationKeys.detail(options, row.id))?.version,
    ).toBe(2);
    expect(
      (
        client.getQueryData(listKey) as { pages: { items: OrganizationResponse[] }[] }
      ).pages[0].items.map((item) => item.id),
    ).toEqual(["org"]);
    const privateProposal = { ...row, role: "none", proposal: { name: "Confidential" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(privateProposal))),
    );
    await act(() =>
      result.current.review.mutateAsync({
        id: row.id,
        input: { decision: "reject", version: 2, reason: "Missing details" },
      }),
    );
    expect(
      client.getQueryData<OrganizationResponse>(organizationKeys.detail(options, row.id))?.name,
    ).toBe("Server name");
  });
  it.each(["accept", "decline", "approve", "reject", "cancel", "remove", "ban", "revoke"] as const)(
    "sends exact membership action %s without forging server acceptance",
    async (action) => {
      const { options, client, wrapper } = setup();
      const invited = { ...row, role: "invited" } as OrganizationResponse;
      client.setQueryData(organizationKeys.detail(options, row.id), invited);
      const fetch = vi.fn(
        async (_url: string, _init?: RequestInit) => new Response('{"id":"membership"}'),
      );
      vi.stubGlobal("fetch", fetch);
      const { result } = renderHook(() => useOrganizationActions(options), { wrapper });
      await act(() =>
        result.current.membership.mutateAsync({ id: row.id, userId: "admin", action }),
      );
      expect(fetch.mock.calls[0][1]).toMatchObject({
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      expect(
        client.getQueryData<OrganizationResponse>(organizationKeys.detail(options, row.id))?.role,
      ).toBe(action === "decline" || action === "cancel" ? "none" : "invited");
    },
  );
  it("requests membership and invites by authoritative user identity", async () => {
    const { options, client, wrapper } = setup();
    client.setQueryData(organizationKeys.detail(options, row.id), { ...row, role: "none" });
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('{"id":"membership"}'),
    );
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useOrganizationActions(options), { wrapper });
    await act(() => result.current.requestJoin.mutateAsync(row.id));
    expect(
      client.getQueryData<OrganizationResponse>(organizationKeys.detail(options, row.id))?.role,
    ).toBe("requested");
    await act(() => result.current.invite.mutateAsync({ id: row.id, userId: "friend" }));
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", body: '{"userId":"friend"}' });
  });
});
