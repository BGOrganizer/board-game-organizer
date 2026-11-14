import { afterEach, expect, it, vi } from "vitest";
import { CommunityApiError } from "../../community/communityApi";
import { bggPickerQuery, bggPickerUnavailable, useBggPicker } from "../hooks/useBggPicker";

const observer = vi.hoisted(() => vi.fn((options: unknown) => ({ options })));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useInfiniteQuery: observer,
}));

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

it("defines catalog fallback and independent selected collection sources without a Search toggle or rotating JWT cache identity", () => {
  const base = {
    apiUrl: "api",
    userId: "viewer",
    getToken: async () => "fresh-secret",
    query: "Game",
    collection: false,
  };
  expect(bggPickerQuery({ ...base, search: false }).enabled).toBe(true);
  expect(bggPickerQuery({ ...base, query: "Gam" }).enabled).toBe(false);
  expect(bggPickerQuery({ ...base, collection: true, snapshot: "snap", query: "" }).enabled).toBe(
    true,
  );
  expect(bggPickerQuery({ ...base, collection: true }).enabled).toBe(false);
  expect(bggPickerQuery({ ...base, userId: null }).enabled).toBe(false);
  const tableScope = { eventId: "event", tableId: "table", groupId: "group" };
  const options = bggPickerQuery({ ...base, participants: true, tableScope, query: "" });
  expect(options.enabled).toBe(true);
  expect(options.staleTime).toBe(0);
  expect(options.queryKey.slice(7)).toEqual([null, "sources-v2", true, tableScope]);
  expect(bggPickerQuery({ ...base, participants: true }).enabled).toBe(false);
  expect(bggPickerQuery(base).staleTime).toBe(300_000);
  expect(bggPickerQuery({ ...base, search: false }).queryKey).toEqual(
    bggPickerQuery({ ...base, search: true }).queryKey,
  );
  expect(JSON.stringify(options.queryKey)).not.toContain("fresh-secret");
  expect(options.getNextPageParam?.({ items: [], nextCursor: "next" }, [], "", [])).toBe("next");
  expect(options.getNextPageParam?.({ items: [], nextCursor: null }, [], "", [])).toBeUndefined();
  useBggPicker(base);
  expect(observer).toHaveBeenCalledWith(
    expect.objectContaining({ queryKey: bggPickerQuery(base).queryKey }),
  );
});

it("forwards only selected participant context, source flags and query-parameter bypass, keeping Group metadata local", async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ items: [], nextCursor: null }),
  );
  vi.stubGlobal("fetch", fetch);
  const base = {
    apiUrl: "https://api.test",
    userId: "viewer",
    getToken: async () => "fresh",
    query: "Game",
    collection: true,
    snapshot: "own",
    participants: true,
    tableScope: { eventId: "event", tableId: "table", groupId: "private-group" },
    protectionBypass: "test-bypass",
  };
  await (bggPickerQuery(base).queryFn as Function)({
    pageParam: "cursor",
    signal: new AbortController().signal,
  });
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.searchParams.get("search")).toBe("0");
  expect(url.searchParams.get("collection")).toBe("1");
  expect(url.searchParams.get("participants")).toBe("1");
  expect(url.searchParams.get("participantEventId")).toBe("event");
  expect(url.searchParams.get("participantTableId")).toBe("table");
  expect(url.searchParams.get("cursor")).toBe("cursor");
  expect(url.searchParams.get("x-vercel-protection-bypass")).toBe("test-bypass");
  expect(url.href).not.toContain("private-group");
  await (bggPickerQuery({ ...base, participants: false }).queryFn as Function)({
    pageParam: "",
    signal: new AbortController().signal,
  });
  expect(new URL(fetch.mock.calls[1][0]).searchParams.has("participantEventId")).toBe(false);
});

it.each([
  [undefined, false],
  [new Error("offline"), false],
  [{ status: 403 }, false],
  [new CommunityApiError(401, "UNAUTHORIZED"), true],
  [new CommunityApiError(403, "EVENT_ADMIN_REQUIRED"), true],
  [new CommunityApiError(404, "NOT_FOUND"), true],
  [new CommunityApiError(409, "BGG_PICKER_CHANGED"), true],
  [new CommunityApiError(409, "OTHER"), false],
  [new CommunityApiError(400, "BGG_PICKER_CHANGED"), false],
])(
  "hides known revoked/changed source data, not usable offline cached content: %s",
  (error, expected) => {
    expect(bggPickerUnavailable(error)).toBe(expected);
  },
);

it("retains typed authorization errors and never fetches with a missing/changed session or a late token after cancellation", async () => {
  const fetch = vi.fn(async () =>
    Response.json({ error: "EVENT_ADMIN_REQUIRED" }, { status: 403 }),
  );
  vi.stubGlobal("fetch", fetch);
  const base = {
    apiUrl: "https://api.test",
    userId: "viewer",
    getToken: async () => "fresh",
    query: "Game",
    collection: false,
  };
  await expect(
    (bggPickerQuery(base).queryFn as Function)({
      pageParam: "",
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ status: 403, code: "EVENT_ADMIN_REQUIRED" });
  fetch.mockClear();
  await expect(
    (bggPickerQuery({ ...base, getToken: async () => null }).queryFn as Function)({
      pageParam: "",
    }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    (bggPickerQuery({ ...base, userId: null }).queryFn as Function)({ pageParam: "" }),
  ).rejects.toMatchObject({ status: 401 });
  const controller = new AbortController();
  const cancelled = bggPickerQuery({
    ...base,
    getToken: async () => {
      controller.abort();
      return "late";
    },
  });
  await expect(
    (cancelled.queryFn as Function)({ pageParam: "", signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});
