import { describe, expect, it, vi } from "vitest";
import manifest from "../../package.json" with { type: "json" };
import { handleMcp } from "../server";

function request(method: string, params?: object) {
  return new Request("http://localhost:4000/mcp", {
    method: "POST",
    headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
const tools = [
  {
    name: "list_items",
    description: "List items",
    inputSchema: { type: "object" as const },
    readOnly: true,
  },
  {
    name: "add_item",
    description: "Add an item",
    inputSchema: { type: "object" as const },
    readOnly: false,
    destructive: true,
    sensitive: true,
  },
];
function setup(viewerUserId?: string) {
  const options = {
    tools,
    viewerUserId,
    scopes: (tool: { readOnly: boolean }) => [tool.readOnly ? "bgo:read" : "bgo:write"],
    getChallenge: vi.fn<() => string | undefined>(),
    run: vi.fn<() => Promise<Response>>(),
    readWidget: vi.fn(async () => "<main>Board Game Organizer</main>"),
    resourceDomains: ["https://images.example.test"],
  };
  return {
    ...options,
    send: async (method: string, params?: object) => {
      const result = await handleMcp(request(method, params), options);
      expect(result.status).toBe(200);
      return result.json();
    },
  };
}

describe("Board Game Organizer MCP protocol", () => {
  it("initializes the server and lists tools with required scopes and App metadata", async () => {
    const { send } = setup();
    const initialized = await send("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(initialized.result.serverInfo).toMatchObject({
      name: "board-game-organizer",
      version: manifest.version,
    });
    const listing = await send("tools/list");
    expect(listing.result.tools).toMatchObject([
      {
        name: "list_items",
        annotations: { readOnlyHint: true, destructiveHint: false },
        _meta: {
          securitySchemes: [{ type: "oauth2", scopes: ["bgo:read"] }],
          ui: { resourceUri: "ui://board-game-organizer/response.html" },
        },
      },
      {
        name: "add_item",
        annotations: { readOnlyHint: false, destructiveHint: true },
        _meta: {
          securitySchemes: [{ type: "oauth2", scopes: ["bgo:write"] }],
          ui: { visibility: ["app"] },
        },
      },
    ]);
  });

  it("loads only the approved widget resource and serves its CSP metadata", async () => {
    const { send, readWidget } = setup();
    const {
      result: {
        resources: [resource],
      },
    } = await send("resources/list");
    expect(resource.mimeType).toBe("text/html;profile=mcp-app");
    const missing = await send("resources/read", { uri: "ui://foreign/response.html" });
    expect(missing.error).toMatchObject({
      code: -32602,
      message: expect.stringContaining("Unknown resource"),
    });
    expect(readWidget).not.toHaveBeenCalled();
    const loaded = await send("resources/read", { uri: resource.uri });
    expect(loaded.result.contents[0]).toMatchObject({
      text: "<main>Board Game Organizer</main>",
      _meta: { ui: { csp: { resourceDomains: ["https://images.example.test"] } } },
    });
  });

  it("refuses unknown tools and challenges OAuth without invoking BGO", async () => {
    const { getChallenge, run, send } = setup();
    getChallenge.mockReturnValue('Bearer scope="bgo:read"');
    const unknown = await send("tools/call", { name: "get_secret" });
    expect(unknown.error).toMatchObject({
      code: -32602,
      message: expect.stringContaining("Unknown tool"),
    });
    const challenged = await send("tools/call", { name: "list_items" });
    expect(challenged.result).toMatchObject({
      isError: true,
      _meta: { "mcp/www_authenticate": ['Bearer scope="bgo:read"'] },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("returns structured data, calls with a cancellation signal and handles empty receipts", async () => {
    const { run, send } = setup();
    run
      .mockResolvedValueOnce(Response.json([{ id: "one" }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await send("tools/call", { name: "list_items" })).result.structuredContent).toEqual({
      operation: "list_items",
      data: [{ id: "one" }],
    });
    expect(run).toHaveBeenLastCalledWith(tools[0], {}, expect.any(AbortSignal));
    expect(
      (await send("tools/call", { name: "add_item", arguments: { name: "New" } })).result
        .structuredContent,
    ).toEqual({ operation: "add_item", data: null });
    expect(run).toHaveBeenLastCalledWith(tools[1], { name: "New" }, expect.any(AbortSignal));
  });

  it.each([
    [400, { error: "INVALID_INPUT" }, "INVALID_INPUT"],
    [403, { error: "private input" }, "HTTP_403"],
    [403, { error: 43 }, "HTTP_403"],
    [400, null, "HTTP_400"],
    [400, "private input", "HTTP_400"],
    [400, { message: "private input" }, "HTTP_400"],
    [500, { error: "PRIVATE_BACKEND_DETAIL" }, "HTTP_500"],
  ])("handles HTTP %i without exposing arbitrary error details", async (status, data, error) => {
    const { run, send } = setup();
    run.mockResolvedValueOnce(Response.json(data, { status }));
    const { result } = await send("tools/call", { name: "add_item" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ operation: "add_item", status, error });
  });

  it("exposes the authenticated viewer only to the widget metadata", async () => {
    const { run, send } = setup("user_bgo");
    run.mockResolvedValue(Response.json({ records: [] }));
    const { result } = await send("tools/call", { name: "list_items" });
    expect(result.structuredContent).toEqual({ operation: "list_items", data: { records: [] } });
    expect(result._meta).toEqual({ viewerUserId: "user_bgo" });
  });

  it("handles failed requests without forwarding exceptions to the host", async () => {
    const { run, send } = setup();
    run.mockRejectedValueOnce(new Error("private backend detail"));
    const { result } = await send("tools/call", { name: "add_item" });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { error: "INTERNAL_ERROR", status: 500 },
    });
    expect(JSON.stringify(result)).not.toContain("private backend detail");
  });
});
