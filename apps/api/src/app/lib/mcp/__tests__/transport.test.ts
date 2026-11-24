import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";
import { GET, POST } from "@/app/mcp/route";
import { authenticateMcp, BGO_READ_SCOPE, BGO_WRITE_SCOPE } from "../auth";
import { operations } from "../operations";

const {
  locationSearch,
  saveGroup,
  history,
  globalLeaderboard,
  createInvite,
  groupDetail,
  listGroups,
  eventDetail,
  tableDetail,
} = vi.hoisted(() => ({
  locationSearch: vi.fn(),
  saveGroup: vi.fn(),
  history: vi.fn(),
  globalLeaderboard: vi.fn(),
  createInvite: vi.fn(),
  groupDetail: vi.fn(),
  listGroups: vi.fn(),
  eventDetail: vi.fn(),
  tableDetail: vi.fn(),
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
    groups: { save: saveGroup, detail: groupDetail, list: listGroups },
    events: { personalTables: history, detail: eventDetail, tableDetail },
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
  listGroups.mockReset();
  groupDetail.mockReset();
  eventDetail.mockReset();
  tableDetail.mockReset();
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
    expect.arrayContaining(operations.map(({ name }) => expect.objectContaining({ name }))),
  );
  const metadata = (name: string) =>
    tools.find((tool: { name: string }) => tool.name === name)?._meta;
  expect(metadata("list_events").ui).toBeUndefined();
  expect(metadata("delete_event").ui).toBeUndefined();
  expect(metadata("show_bgo_records").ui.resourceUri).toMatch(/^ui:\/\//);
  expect(metadata("list_table_history").ui.resourceUri).toMatch(/^ui:\/\//);
  expect(metadata("sync_contacts").ui).toEqual({ visibility: ["app"] });
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

const groupId = "70f48c08-821b-4e1a-9ee6-9efa2e3afe19";
const eventId = "fd82f631-a33c-49db-adba-dc63526ecaf6";
const tableId = "46d59b46-969b-4b03-99a8-525d1e96d222";
const selection = {
  mode: "selection",
  records: [
    { kind: "event", id: eventId },
    { kind: "table", id: tableId, eventId },
    { kind: "group", id: groupId },
    { kind: "event", id: eventId },
  ],
};
async function renderRecords(args: object) {
  const response = await POST(
    request(
      "tools/call",
      { name: "show_bgo_records", arguments: args },
      { Authorization: "Bearer scoped" },
    ),
  );
  return (await response.json()).result;
}

it("renders mixed records in selection order under the caller's identity", async () => {
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  const event = { id: eventId, name: "Open night" };
  const table = { id: tableId, name: "Game night" };
  const group = { id: groupId, name: "Friday Club" };
  eventDetail.mockResolvedValueOnce(event);
  tableDetail.mockResolvedValueOnce(table);
  groupDetail.mockResolvedValueOnce(group);
  const result = await renderRecords(selection);
  expect(result.structuredContent).toEqual({
    operation: "show_bgo_records",
    data: { count: 3, hasMore: false },
  });
  expect(result._meta).toEqual({
    viewerUserId: "user_mcp",
    widgetView: {
      mode: "selection",
      rows: [
        { kind: "event", data: event },
        { kind: "table", data: table },
        { kind: "group", data: group },
      ],
    },
  });
  expect(eventDetail).toHaveBeenCalledExactlyOnceWith("user_mcp", eventId);
  expect(tableDetail).toHaveBeenCalledExactlyOnceWith("user_mcp", eventId, tableId);
  expect(groupDetail).toHaveBeenCalledExactlyOnceWith("user_mcp", groupId);
});

it("checks read scope, validates selection inputs and preserves a canonical access denial", async () => {
  vi.mocked(authenticateMcp).mockResolvedValueOnce({
    userId: "user_mcp",
    scopes: [BGO_WRITE_SCOPE],
  });
  await expect(renderRecords(selection)).resolves.toMatchObject({
    isError: true,
    _meta: { "mcp/www_authenticate": [expect.stringContaining(`scope="${BGO_READ_SCOPE}"`)] },
  });
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  await expect(
    renderRecords({ mode: "selection", records: [{ kind: "event", id: "../../unsafe" }] }),
  ).resolves.toMatchObject({ isError: true, structuredContent: { status: 400 } });
  expect(eventDetail).not.toHaveBeenCalled();
  eventDetail.mockResolvedValueOnce({ id: eventId, name: "Open night" });
  tableDetail.mockRejectedValueOnce(new CommunityError(403, "TABLE_FORBIDDEN"));
  const rejected = await renderRecords(selection);
  expect(rejected).toMatchObject({
    isError: true,
    structuredContent: { status: 403, error: "TABLE_FORBIDDEN" },
  });
  expect(rejected._meta).toBeUndefined();
  expect(groupDetail).not.toHaveBeenCalled();
});

it("hands the canonical page and original query to the browse widget", async () => {
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });
  const page = { items: [{ id: groupId, name: "Friday Club" }], nextCursor: "cursor" };
  listGroups.mockResolvedValueOnce(page);
  const query = { limit: "2", roles: "admin,accepted" };
  const result = await renderRecords({ mode: "browse", list: { source: "list_groups", query } });
  expect(listGroups).toHaveBeenCalledWith(
    "user_mcp",
    "mine",
    expect.objectContaining({ limit: 2, roles: ["admin", "accepted"] }),
  );
  expect(result.structuredContent).toEqual({
    operation: "show_bgo_records",
    data: { count: 1, hasMore: true },
  });
  expect(result._meta.widgetView).toEqual({
    mode: "browse",
    operation: "list_groups",
    input: { query },
    page,
  });
  listGroups.mockRejectedValueOnce(new CommunityError(403, "GROUP_FORBIDDEN"));
  await expect(
    renderRecords({ mode: "browse", list: { source: "list_groups", query } }),
  ).resolves.toMatchObject({ isError: true, structuredContent: { status: 403 } });
});

it.each([
  ["browse without a list", { mode: "browse" }],
  [
    "browse with record references",
    { ...selection, mode: "browse", list: { source: "list_groups" } },
  ],
  ["selection without records", { mode: "selection" }],
  ["selection with a browse list", { ...selection, list: { source: "list_groups" } }],
])("rejects %s before fetching any records", async (_description, args) => {
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: "user_mcp", scopes: [BGO_READ_SCOPE] });

  await expect(renderRecords(args)).resolves.toMatchObject({
    isError: true,
    structuredContent: { status: 400, error: "INVALID_INPUT" },
  });
  expect(listGroups).not.toHaveBeenCalled();
  expect(eventDetail).not.toHaveBeenCalled();
  expect(tableDetail).not.toHaveBeenCalled();
  expect(groupDetail).not.toHaveBeenCalled();
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
