import { afterEach, expect, it, vi } from "vitest";
import { bggPickerQuery } from "../hooks/useBggPicker";

afterEach(() => vi.unstubAllGlobals());
it("scopes participant picker reads by actor/API/Event/Table and forwards fresh tokens/cancellation", async () => {
  const o = {
    apiUrl: "https://api.test",
    userId: "one",
    getToken: vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second"),
    query: " Game ",
    search: true,
    collection: false,
    proposalScope: { eventId: "event", tableId: "table" },
  };
  const options = bggPickerQuery(o),
    controller = new AbortController(),
    fetch = vi.fn(async () => Response.json({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetch);
  expect(options.staleTime).toBe(0);
  for (const change of [
    { userId: "two" },
    { apiUrl: "https://other.test" },
    { proposalScope: { eventId: "other", tableId: "table" } },
    { proposalScope: { eventId: "event", tableId: "other" } },
    { proposalScope: undefined },
  ])
    expect(bggPickerQuery({ ...o, ...change }).queryKey).not.toEqual(options.queryKey);
  for (let i = 0; i < 2; i++)
    await (options.queryFn as Function)({ pageParam: "", signal: controller.signal });
  const url = new URL(fetch.mock.calls[0][0] as string);
  expect(url.searchParams.get("proposalEventId")).toBe("event");
  expect(url.searchParams.get("proposalTableId")).toBe("table");
  expect(url.searchParams.get("query")).toBe("Game");
  expect(fetch.mock.calls[0][1]).toMatchObject({
    signal: controller.signal,
    headers: { Authorization: "Bearer first" },
  });
  expect(fetch.mock.calls[1][1]).toMatchObject({ headers: { Authorization: "Bearer second" } });
});
