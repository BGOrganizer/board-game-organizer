import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";
import { GET, POST } from "@/app/mcp/route";
import { authenticateMcp, BGO_READ_SCOPE, BGO_WRITE_SCOPE } from "../auth";

const { locationSearch, saveGroup, history, globalLeaderboard, createInvite } = vi.hoisted(() => ({
  locationSearch: vi.fn(),
  saveGroup: vi.fn(),
  history: vi.fn(),
  globalLeaderboard: vi.fn(),
  createInvite: vi.fn(),
}));
vi.mock("@/app/lib/db", () => ({
  getDb: async () => ({}),
  withTransaction: (run: (session: object, db: object) => Promise<unknown>) => run({}, {}),
}));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: async () => {} }));
vi.mock("@/app/api/invites/route", () => ({ POST: createInvite }));
vi.mock("@/app/lib/community/record-services", () => ({
  recordServices: () => ({
    globalLeaderboard,
    groups: { save: saveGroup },
    events: { personalTables: history },
  }),
}));
vi.mock("@/app/lib/games/record-game-covers", () => ({ enrichRecordGameCovers: async () => {} }));
vi.mock("@/app/lib/locations/geocoding", () => ({
  geocodeAddresses: locationSearch,
  GeocodingError: Error,
}));
vi.mock("../auth", async (load) => ({
  ...(await load<typeof import("../auth")>()),
  authenticateMcp: vi.fn(),
}));

const url = "https://api.example.test/mcp";

beforeEach(() => {
  vi.stubEnv("MCP_RESOURCE_URL", url);
  vi.stubEnv("MCP_CLERK_ISSUER", "https://id.example.test");
  vi.mocked(authenticateMcp).mockReset().mockResolvedValue(null);
  locationSearch.mockReset();
  saveGroup.mockReset();
  history.mockReset();
  globalLeaderboard.mockReset();
});

function request(method: string, params?: object, headers?: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

it("serves discovery, returns a protected-resource challenge and blocks a foreign Origin", async () => {
  const discovery = await POST(request("tools/list"));
  expect(discovery.status).toBe(200);
  expect(discovery.headers.get("cache-control")).toBe("private, no-store");
  const {
    result: { tools },
  } = await discovery.json();
  expect(tools).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "create_group" })]),
  );
  const call = await POST(
    request("tools/call", { name: "search_locations", arguments: { query: { query: "Bologna" } } }),
  );
  expect((await call.json()).result._meta["mcp/www_authenticate"][0]).toContain(
    `scope="${BGO_READ_SCOPE}"`,
  );
  expect(locationSearch).not.toHaveBeenCalled();
  expect(
    (await POST(request("tools/list", {}, { Origin: "https://other.example.test" }))).status,
  ).toBe(403);
});

it("returns HTTP 401 when a provided OAuth token cannot be authenticated", async () => {
  const result = await POST(request("tools/list", {}, { Authorization: "Bearer invalid" }));
  expect(result.status).toBe(401);
  expect(result.headers.get("www-authenticate")).toContain('error="invalid_token"');
});

it("advertises OAuth to unauthenticated GET probes without opening an event stream", async () => {
  const discovery = await GET(new Request(url));
  expect(discovery.status).toBe(401);
  expect(discovery.headers.get("www-authenticate")).toBe(
    `Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/mcp", scope="${BGO_READ_SCOPE}"`,
  );
  expect(authenticateMcp).not.toHaveBeenCalled();

  const forbidden = await GET(new Request(url, { headers: { Origin: "https://other.test" } }));
  expect(forbidden.status).toBe(403);
  const authorizedRequest = new Request(url, { headers: { Authorization: "Bearer scoped" } });
  const invalid = await GET(authorizedRequest);
  expect(invalid.status).toBe(401);
  expect(invalid.headers.get("www-authenticate")).toContain('error="invalid_token"');

  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  const supportedMethods = await GET(authorizedRequest);
  expect(supportedMethods.status).toBe(405);
  expect(supportedMethods.headers.get("allow")).toBe("POST");
});

it("uses the Development API origin for invite links and the gateway origin for OAuth", async () => {
  const apiOrigin = "https://api-preview.example.test";
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_WRITE_SCOPE] });
  createInvite.mockImplementationOnce((incoming: Request) =>
    Response.json({ link: `${new URL(incoming.url).origin}/invite/example` }, { status: 201 }),
  );
  const call = await POST(
    new Request(
      `${apiOrigin}/mcp`,
      request(
        "tools/call",
        { name: "create_invite", arguments: {} },
        { Authorization: "Bearer scoped", Origin: new URL(url).origin },
      ),
    ),
  );
  expect(call.status).toBe(200);
  expect(vi.mocked(authenticateMcp).mock.lastCall?.[1].resourceUrl).toBe(url);
  expect((await call.json()).result.structuredContent).toMatchObject({
    data: { link: `${apiOrigin}/invite/example` },
  });
});

it("blocks a write unless the OAuth token has the write scope", async () => {
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  const call = await POST(
    request(
      "tools/call",
      { name: "create_group", arguments: { body: { name: "Game night", type: "PRIVATE" } } },
      { Authorization: "Bearer scoped" },
    ),
  );
  const { result } = await call.json();
  expect(result.isError).toBe(true);
  expect(result._meta["mcp/www_authenticate"][0]).toContain(`scope="${BGO_WRITE_SCOPE}"`);
  expect(result._meta["mcp/www_authenticate"][0]).toContain('error="insufficient_scope"');
});

it("runs the actual location API as the verified actor and returns BGO data", async () => {
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  const places = [{ id: "place-01", address: "Bologna, Italy" }];
  locationSearch.mockResolvedValue(places);
  const call = await POST(
    request(
      "tools/call",
      { name: "search_locations", arguments: { query: { query: "Bologna" } } },
      { Authorization: "Bearer scoped", Origin: new URL(url).origin },
    ),
  );
  const { result } = await call.json();
  expect(locationSearch).toHaveBeenCalledWith("Bologna");
  expect(result.structuredContent).toEqual({
    operation: "search_locations",
    data: { items: places },
  });
});

it("opens a group draft without invoking a write and validates its preset fields", async () => {
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  const call = (name: string) =>
    POST(
      request(
        "tools/call",
        { name: "prepare_group_creation", arguments: { name, type: "PRIVATE" } },
        { Authorization: "Bearer scoped" },
      ),
    );
  const { result } = await (await call("Game night")).json();
  expect(result.structuredContent).toEqual({
    operation: "prepare_group_creation",
    data: { name: "Game night", type: "PRIVATE" },
  });
  const invalid = await (await call("x")).json();
  expect(invalid.result).toMatchObject({
    isError: true,
    structuredContent: { status: 400, error: "INVALID_INPUT" },
  });
});

it("keeps the endpoint disabled until OAuth is configured", async () => {
  vi.stubEnv("MCP_RESOURCE_URL", "");
  expect((await POST(request("tools/list"))).status).toBe(404);
  expect((await GET(new Request(url))).status).toBe(404);
});

it("keeps the endpoint disabled on a run-scoped CI database", async () => {
  vi.stubEnv("MONGODB_DB_NAME", "bgo_ci_123_1");
  try {
    expect((await POST(request("tools/list"))).status).toBe(404);
  } finally {
    vi.stubEnv("MONGODB_DB_NAME", undefined);
  }
});

it("uses the canonical history and group handlers with their BGO actor and route validation", async () => {
  vi.mocked(authenticateMcp).mockResolvedValue({
    userId: "user_mcp",
    scopes: [BGO_READ_SCOPE, BGO_WRITE_SCOPE],
  });
  history.mockResolvedValueOnce({ items: [], nextCursor: null });
  const send = async (name: string, args: object) => {
    const response = await POST(
      request("tools/call", { name, arguments: args }, { Authorization: "Bearer scoped" }),
    );
    return (await response.json()).result;
  };
  const result = await send("list_table_history", { query: { limit: 5 } });
  expect(history).toHaveBeenCalledWith("user_mcp", expect.objectContaining({ limit: 5 }));
  expect(result.structuredContent).toEqual({
    operation: "list_table_history",
    data: { items: [], nextCursor: null },
  });
  const group = {
    id: "70f48c08-821b-4e1a-9ee6-9efa2e3afe19",
    name: "Dice Club",
    type: "PRIVATE",
    invitedUserIds: [],
  };
  saveGroup
    .mockResolvedValueOnce(group)
    .mockRejectedValueOnce(new CommunityError(403, "GROUP_FORBIDDEN"));
  const body = { name: group.name, type: group.type, invitedUserIds: [] };
  expect((await send("create_group", { body })).structuredContent).toEqual({
    operation: "create_group",
    data: group,
  });
  expect(saveGroup).toHaveBeenCalledWith("user_mcp", expect.objectContaining(body));
  expect(await send("create_group", { body })).toMatchObject({
    isError: true,
    structuredContent: { status: 403, error: "GROUP_FORBIDDEN" },
  });
});

it("routes global leaderboard sorting to the authorized BGO service", async () => {
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  const data = { games: [], players: [], nextCursor: null };
  globalLeaderboard.mockResolvedValueOnce(data);
  const query = { gameId: 14, sort: "gamesWon", direction: "asc", limit: 20, cursor: 25 };
  const result = await POST(
    request(
      "tools/call",
      { name: "list_global_leaderboard", arguments: { query } },
      { Authorization: "Bearer scoped" },
    ),
  );
  expect((await result.json()).result).toMatchObject({
    structuredContent: { operation: "list_global_leaderboard", data },
    _meta: { viewerUserId: "user_mcp" },
  });
  expect(globalLeaderboard).toHaveBeenCalledWith("user_mcp", query);
});
