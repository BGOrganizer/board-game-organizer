import { describe, expect, it, vi } from "vitest";
import { forwardMcpGateway, MCP_METADATA_PATH, MCP_PATH } from "../developmentGateway";

const gateway = "https://mcp-dev.example.test";
const upstream = "https://api-development-pr-33-board-game-organizers-projects.vercel.app";
const bypass = "test bypass";
const development = { target: "development", upstream, previewBypass: bypass } as const;

describe("the public MCP gateway", () => {
  it.each(["/", "/mcp/", "/mcp/anything", "/api/groups", "/invite/demo"])(
    "refuses to forward %s",
    async (path) => {
      const send = vi.fn();
      const result = await forwardMcpGateway(new Request(gateway + path), development, send);
      expect(result.status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("allows only the transport and metadata methods", async () => {
    const send = vi.fn();
    const result = await forwardMcpGateway(
      new Request(gateway + MCP_PATH, { method: "DELETE" }),
      development,
      send,
    );
    expect(result.status).toBe(405);
    expect(result.headers.get("allow")).toBe("GET, POST");
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
    const result = await forwardMcpGateway(
      new Request(gateway + MCP_METADATA_PATH),
      { ...development, upstream: target, previewBypass: credential },
      send,
    );
    expect(result.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it("forwards Production discovery only to the production API without a bypass", async () => {
    const production = {
      target: "production",
      upstream: "https://api.board-game-organizer.com",
      previewBypass: undefined,
    } as const;
    const request = new Request(gateway + MCP_METADATA_PATH);
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}));
    expect((await forwardMcpGateway(request, production, send)).status).toBe(200);
    expect(send.mock.calls[0][0]).toBe(`https://api.board-game-organizer.com${MCP_METADATA_PATH}`);

    for (const invalid of [
      { ...production, upstream },
      { ...production, previewBypass: bypass },
    ]) {
      expect((await forwardMcpGateway(request, invalid, send)).status).toBe(503);
    }
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["development", "https://pr-34-1234-2--bgo-api-development.netlify.app"],
    ["production", "https://bgo-api-production.netlify.app"],
  ] as const)("forwards Netlify %s only to its own project's API", async (target, upstream) => {
    const config = { provider: "netlify", target, upstream, previewBypass: undefined } as const;
    const request = new Request(gateway + MCP_METADATA_PATH);
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    expect((await forwardMcpGateway(request, config, send)).status).toBe(200);
    expect(send.mock.lastCall?.[0]).toBe(upstream + MCP_METADATA_PATH);

    for (const invalid of [
      { ...config, upstream: undefined },
      { ...config, upstream: "https://not-ours.netlify.app" },
      {
        ...config,
        upstream:
          target === "production"
            ? "https://pr-34-1234-2--bgo-api-development.netlify.app"
            : "https://bgo-api-production.netlify.app",
      },
      { ...config, previewBypass: bypass },
    ]) {
      expect((await forwardMcpGateway(request, invalid, send)).status).toBe(503);
    }
    expect(send).toHaveBeenCalledTimes(1);
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
    const result = await forwardMcpGateway(request, development, send);
    const [url, options] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${upstream}${MCP_PATH}?x-vercel-protection-bypass=test%20bypass`);
    expect(options).toMatchObject({ method: "POST", redirect: "manual", signal: request.signal });
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
    const discovery = await forwardMcpGateway(
      new Request(gateway + MCP_METADATA_PATH, { method: "OPTIONS" }),
      development,
      send,
    );
    expect(discovery.status).toBe(204);
    expect(discovery.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(send.mock.calls[0][1]?.body).toBeUndefined();
    vi.stubGlobal("fetch", send);
    try {
      const result = await forwardMcpGateway(new Request(gateway + MCP_PATH), development);
      expect(result.status).toBe(401);
      expect(send.mock.lastCall?.[1]?.method).toBe("GET");
      expect(result.headers.get("www-authenticate")).toContain(`${gateway}${MCP_METADATA_PATH}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps upstream redirects, login pages and request errors out of public responses", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: "https://login.example.test" } }),
      )
      .mockResolvedValueOnce(
        new Response("Vercel login", { headers: { "Content-Type": "text/html" } }),
      )
      .mockRejectedValueOnce(new Error(`Failed upstream request with ${bypass}`));
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await forwardMcpGateway(
        new Request(gateway + MCP_METADATA_PATH),
        development,
        send,
      );
      expect(result.status).toBe(502);
      expect(result.headers.get("location")).toBeNull();
      expect(await result.text()).toBe("");
    }
  });
});
