import { describe, expect, it, vi } from "vitest";
import { forwardDevelopmentMcp, MCP_METADATA_PATH, MCP_PATH } from "../developmentGateway";

const gateway = "https://mcp-dev.example.test";
const upstream = "https://api-development-pr-33-board-game-organizers-projects.vercel.app";
const bypass = "test bypass";

describe("the public Development MCP gateway", () => {
  it.each(["/", "/mcp/", "/mcp/anything", "/api/groups", "/invite/demo"])(
    "refuses to forward %s",
    async (path) => {
      const send = vi.fn();
      const result = await forwardDevelopmentMcp(
        new Request(gateway + path),
        upstream,
        bypass,
        send,
      );
      expect(result.status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("allows only the transport and metadata methods", async () => {
    const send = vi.fn();
    const result = await forwardDevelopmentMcp(
      new Request(gateway + MCP_PATH),
      upstream,
      bypass,
      send,
    );
    expect(result.status).toBe(405);
    expect(result.headers.get("allow")).toBe("POST");
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, bypass],
    [upstream, undefined],
    ["https://api.board-game-organizer.com", bypass],
    ["https://api-example-board-game-organizers-projects.vercel.app", bypass],
    [`${upstream}/api`, bypass],
  ])("fails closed with a missing or invalid upstream", async (target, credential) => {
    const send = vi.fn();
    const result = await forwardDevelopmentMcp(
      new Request(gateway + MCP_METADATA_PATH),
      target,
      credential,
      send,
    );
    expect(result.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it("forwards the MCP body, OAuth and protocol headers over a fixed route", async () => {
    const send = vi.fn(
      async () =>
        new Response("stream", {
          headers: {
            "Content-Type": "text/event-stream",
            "Set-Cookie": "hidden",
            Location: "/private",
          },
        }),
    );
    const request = new Request(`${gateway}${MCP_PATH}?x-vercel-protection-bypass=untrusted`, {
      method: "POST",
      body: '{"method":"tools/list"}',
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer synthetic",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-11-25",
        Origin: gateway,
        Cookie: "private",
        "X-Forwarded-Host": "attacker.example.test",
      },
    });
    const result = await forwardDevelopmentMcp(request, upstream, bypass, send);
    const [url, options] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${upstream}${MCP_PATH}?x-vercel-protection-bypass=test%20bypass`);
    expect(options).toMatchObject({ method: "POST", redirect: "error", signal: request.signal });
    expect(new TextDecoder().decode(options.body as ArrayBuffer)).toBe('{"method":"tools/list"}');
    expect(Object.fromEntries(new Headers(options.headers))).toEqual({
      accept: "application/json, text/event-stream",
      authorization: "Bearer synthetic",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-11-25",
      origin: gateway,
    });
    expect(Object.fromEntries(result.headers)).toEqual({
      "cache-control": "private, no-store",
      "content-type": "text/event-stream",
    });
    expect(await result.text()).toBe("stream");
  });

  it("preserves discovery CORS and the OAuth challenge", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer resource_metadata="${gateway}${MCP_METADATA_PATH}"`,
          },
        }),
      );
    const discovery = await forwardDevelopmentMcp(
      new Request(gateway + MCP_METADATA_PATH, { method: "OPTIONS" }),
      upstream,
      bypass,
      send,
    );
    expect(discovery.status).toBe(204);
    expect(discovery.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(send.mock.calls[0][1]?.body).toBeUndefined();
    vi.stubGlobal("fetch", send);
    try {
      const result = await forwardDevelopmentMcp(
        new Request(gateway + MCP_PATH, { method: "POST" }),
        upstream,
        bypass,
      );
      expect(result.status).toBe(401);
      expect(result.headers.get("www-authenticate")).toContain(`${gateway}${MCP_METADATA_PATH}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps upstream login pages and failed request details out of public responses", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("Vercel login", { headers: { "Content-Type": "text/html" } }),
      )
      .mockRejectedValueOnce(new Error(`Failed upstream request with ${bypass}`));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await forwardDevelopmentMcp(
        new Request(gateway + MCP_METADATA_PATH),
        upstream,
        bypass,
        send,
      );
      expect(result.status).toBe(502);
      expect(await result.text()).toBe("");
    }
  });
});
