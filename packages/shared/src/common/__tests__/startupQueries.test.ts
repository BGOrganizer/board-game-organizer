import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { eventRecordsQuery, recordTablesQuery } from "../../events/hooks/useEventRecords";
import { groupRecordsPageQuery } from "../../groups/hooks/useGroupRecords";

afterEach(() => vi.unstubAllGlobals());
it("warms only canonical first-page group/event/table identities with fresh credentials and cancellation", async () => {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response('{"items":[],"nextCursor":null}'),
  );
  vi.stubGlobal("fetch", fetch);
  const getToken = vi.fn(async () => "fresh-jwt"),
    o = { apiUrl: "https://api.example.test", userId: "user-1", getToken },
    client = new QueryClient(),
    queries = [eventRecordsQuery(o), recordTablesQuery(o), groupRecordsPageQuery(o)];
  await Promise.all(queries.map((query) => client.prefetchInfiniteQuery(query)));
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(getToken).toHaveBeenCalledTimes(3);
  for (const query of queries) {
    expect(query.queryKey).toContain("user-1");
    expect(client.getQueryData(query.queryKey)).toMatchObject({
      pages: [{ items: [], nextCursor: null }],
    });
  }
  for (const [url, init] of fetch.mock.calls) {
    expect(url).not.toMatch(/matches|organizations/);
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      "Bearer fresh-jwt",
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  client.clear();
});
