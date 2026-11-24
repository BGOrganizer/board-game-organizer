import {
  bggCollectionQuery,
  profileViewKeys,
  useBggCollection,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const options = {
  apiUrl: "https://collections.test",
  userId: "collector",
  snapshot: "saved-collection",
  query: "  railway  ",
  getToken: async () => "collection-token",
};
const emptyPage = { snapshot: options.snapshot, items: [], counts: null, nextCursor: null };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

it("retries temporary BGG collection failures and sends the viewer and published comparison filters", async () => {
  const { client } = setup();
  const request = vi
    .fn<(url: string, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ error: "TEMPORARY" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ error: "TEMPORARY" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json(emptyPage));
  vi.stubGlobal("fetch", request);
  const filters = {
    ...options,
    subjectId: "friend",
    types: "games" as const,
    wishlist: true,
    commonSnapshot: "viewer-snapshot",
  };
  expect(await client.fetchInfiniteQuery(bggCollectionQuery(filters))).toEqual({
    pages: [emptyPage],
    pageParams: [""],
  });
  expect(request).toHaveBeenCalledTimes(3);
  for (const [input, init] of request.mock.calls) {
    const url = new URL(input);
    expect(url.pathname).toBe("/api/bgg/collection");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      snapshot: options.snapshot,
      query: "railway",
      subjectId: "friend",
      commonSnapshot: "viewer-snapshot",
      types: "games",
      wishlist: "true",
    });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer collection-token");
  }
});

it.each([false, true])(
  "refreshes local metadata after the server rejects the pinned snapshot (own collection: %s)",
  async (personal) => {
    const { client, wrapper } = setup();
    const subjectId = personal ? undefined : "friend";
    const subject = subjectId ?? options.userId;
    const accountKey = ["bgg-account", options.apiUrl, options.userId];
    const profile = profileViewKeys.view(options, subject);
    const untouchedProfile = profileViewKeys.view(options, "another-profile");
    const foreignAccount = ["bgg-account", options.apiUrl, "other-owner"];
    for (const key of [accountKey, profile, untouchedProfile, foreignAccount])
      client.setQueryData(key, { available: true });
    const request = vi.fn(async (_url: string) =>
      personal
        ? Response.json({ error: "BGG_COLLECTION_NOT_FOUND" }, { status: 404 })
        : Response.json({ ...emptyPage, snapshot: "new-published-snapshot" }),
    );
    vi.stubGlobal("fetch", request);
    const { result } = renderHook(() => useBggCollection({ ...options, subjectId }), { wrapper });
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ status: personal ? 404 : 409 }),
    );
    expect(request).toHaveBeenCalledOnce();
    const params = new URL(request.mock.calls[0][0]).searchParams;
    expect(params.get("subjectId")).toBe(subjectId ?? null);
    expect(client.getQueryState(accountKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(profile)?.isInvalidated).toBe(true);
    expect(client.getQueryState(untouchedProfile)?.isInvalidated).toBe(false);
    expect(client.getQueryState(foreignAccount)?.isInvalidated).toBe(false);
  },
);
