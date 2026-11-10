import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationChangesQuery, notificationChangesRoot } from "../hooks/useNotificationChanges";

const id = "11111111-1111-4111-8111-111111111111";
const page = {
  asOf: "2026-01-01T00:00:00.000Z",
  changes: [],
  nextCursor: null,
  tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
};
const scope = { kind: "table" as const, id, tab: "participants" as const };
afterEach(() => vi.unstubAllGlobals());
describe("notificationChangesQuery transport", () => {
  it("scopes by stable owner, uses fresh tokens and passes cancellation without adding an Alert polling loop", async () => {
    const getToken = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const fetcher = vi.fn(async () => new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const options = { apiUrl: "https://api.invalid", userId: "user_a", getToken };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const factory = notificationChangesQuery(options, scope);
      expect(factory.queryKey).toEqual([
        "notification-changes",
        options.apiUrl,
        "user_a",
        "table",
        id,
        "participants",
        8,
      ]);
      expect(factory).not.toHaveProperty("refetchInterval");
      expect(notificationChangesRoot({ ...options, userId: "user_b" })).not.toEqual(
        notificationChangesRoot(options),
      );
      await client.fetchInfiniteQuery(factory);
      await client.invalidateQueries({ queryKey: factory.queryKey });
      await client.fetchInfiniteQuery(factory);
      expect(getToken).toHaveBeenCalledTimes(2);
      expect(
        fetcher.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1].headers),
      ).toEqual([
        expect.objectContaining({ Authorization: "Bearer first" }),
        expect.objectContaining({ Authorization: "Bearer second" }),
      ]);
      expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(
        AbortSignal,
      );
    } finally {
      client.clear();
    }
  });
  it("does not dispatch a stale-owner request after cancellation during token resolution", async () => {
    let resolve!: (token: string) => void;
    const getToken = () =>
      new Promise<string>((done) => {
        resolve = done;
      });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const factory = notificationChangesQuery(
      { apiUrl: "https://api.invalid", userId: "user_a", getToken },
      scope,
    );
    const request = client.fetchInfiniteQuery(factory).catch(() => undefined);
    await client.cancelQueries({ queryKey: factory.queryKey });
    resolve("late");
    await request;
    expect(fetcher).not.toHaveBeenCalled();
    client.clear();
  });
  it("keeps observable HTTP and invalid-contract failures instead of fabricating an empty feed", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const factory = notificationChangesQuery(
      { apiUrl: "https://api.invalid", userId: "user_a", getToken: async () => "token" },
      scope,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })),
    );
    await expect(client.fetchInfiniteQuery(factory)).rejects.toMatchObject({ status: 403 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ changes: [] }), { status: 200 })),
    );
    await expect(client.fetchInfiniteQuery(factory)).rejects.toThrow();
    client.clear();
  });
});
