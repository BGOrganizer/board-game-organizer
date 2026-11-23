import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "../../../.well-known/oauth-protected-resource/mcp/route";
import {
  authenticateMcp,
  BGO_READ_SCOPE,
  BGO_WRITE_SCOPE,
  mcpAuthenticationChallenge,
  readMcpConfiguration,
} from "../auth";

const { authenticateRequest, clerkClient, toAuth } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  clerkClient: vi.fn(),
  toAuth: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ clerkClient }));

const config = {
  resourceUrl: "https://api.example.com/mcp",
  issuer: "https://clerk.example.com",
};
const now = 1_800_000_000;
const subject = "user_example";
const claims = { iss: config.issuer, aud: config.resourceUrl, exp: now + 60, sub: subject };

function requestFor(payload: Record<string, unknown> | string) {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  const jwt = `header.${Buffer.from(json).toString("base64url")}.signature`;
  return new Request(config.resourceUrl, {
    headers: { Authorization: `Bearer ${jwt}`, Cookie: "__session=ignored" },
  });
}

beforeEach(() => {
  vi.stubEnv("MCP_RESOURCE_URL", config.resourceUrl);
  vi.stubEnv("MCP_CLERK_ISSUER", config.issuer);
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
  clerkClient.mockResolvedValue({ authenticateRequest });
  authenticateRequest.mockResolvedValue({ isAuthenticated: true, toAuth });
  toAuth.mockReturnValue({
    tokenType: "oauth_token",
    userId: subject,
    scopes: [BGO_READ_SCOPE],
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("MCP protected resource metadata", () => {
  it("uses the configured canonical URLs and advertises both scopes", async () => {
    expect(readMcpConfiguration()).toEqual(config);
    const response = GET();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      resource: config.resourceUrl,
      resource_name: "Board Game Organizer",
      authorization_servers: [config.issuer],
      scopes_supported: [BGO_READ_SCOPE, BGO_WRITE_SCOPE],
      bearer_methods_supported: ["header"],
    });
    const preflight = OPTIONS();
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  });

  it.each([
    ["MCP_RESOURCE_URL", ""],
    ["MCP_CLERK_ISSUER", ""],
    ["MCP_RESOURCE_URL", "bogus"],
    ["MCP_RESOURCE_URL", "https://api.example.com/mcp/"],
    ["MCP_RESOURCE_URL", "https://api.example.com/mcp?token=wrong"],
    ["MCP_RESOURCE_URL", "http://api.example.com/mcp"],
    ["MCP_RESOURCE_URL", "ftp://localhost/mcp"],
    ["MCP_CLERK_ISSUER", "bogus"],
    ["MCP_CLERK_ISSUER", "http://clerk.example.com"],
    ["MCP_CLERK_ISSUER", "https://clerk.example.com/oauth"],
  ])("does not advertise invalid %s value %s", (name, value) => {
    vi.stubEnv(name, value);
    expect(readMcpConfiguration()).toBeUndefined();
    expect(GET().status).toBe(404);
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("supports the local resource on %s", (hostname) => {
    const resourceUrl = `http://${hostname}:4000/mcp`;
    vi.stubEnv("MCP_RESOURCE_URL", resourceUrl);
    expect(readMcpConfiguration()).toEqual({ ...config, resourceUrl });
  });

  it("publishes the canonical challenge with optional scope and OAuth errors", () => {
    const challenge =
      'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"';
    expect(mcpAuthenticationChallenge(config)).toBe(challenge);
    expect(mcpAuthenticationChallenge(config, BGO_WRITE_SCOPE, "insufficient_scope")).toBe(
      `${challenge}, scope="bgo:write", error="insufficient_scope", error_description="Additional access is required"`,
    );
    expect(mcpAuthenticationChallenge(config, undefined, "invalid_token")).toBe(
      `${challenge}, error="invalid_token", error_description="A valid OAuth access token is required"`,
    );
  });
});

describe("authenticateMcp", () => {
  it.each([{ audience: config.resourceUrl }, { audience: [config.resourceUrl, "other"] }])(
    "uses the Clerk-verified actor and scopes with audience %j",
    async ({ audience }) => {
      const request = requestFor({ ...claims, aud: audience, nbf: now });
      await expect(authenticateMcp(request, config)).resolves.toEqual({
        userId: subject,
        scopes: [BGO_READ_SCOPE],
      });
      expect(authenticateRequest).toHaveBeenCalledExactlyOnceWith(expect.any(Request), {
        acceptsToken: "oauth_token",
        audience: config.resourceUrl,
      });
      const [verifiedRequest] = authenticateRequest.mock.calls[0];
      expect(verifiedRequest.url).toBe(config.resourceUrl);
      expect(verifiedRequest.headers.get("authorization")).toBe(
        request.headers.get("authorization"),
      );
      expect(verifiedRequest.headers.get("cookie")).toBeNull();
    },
  );

  it.each([undefined, "Basic credentials", "Bearer oat_example"])(
    "rejects missing and non-JWT bearer credentials: %s",
    async (authorization) => {
      const headers = new Headers({ Cookie: "__session=ignored" });
      if (authorization) headers.set("Authorization", authorization);
      const request = new Request(config.resourceUrl, { headers });
      await expect(authenticateMcp(request, config)).resolves.toBeNull();
      expect(clerkClient).not.toHaveBeenCalled();
    },
  );

  it("does not trust a JWT Clerk could not authenticate", async () => {
    authenticateRequest.mockResolvedValue({ isAuthenticated: false });
    await expect(authenticateMcp(requestFor(claims), config)).resolves.toBeNull();
    expect(toAuth).not.toHaveBeenCalled();
  });

  it.each([
    { tokenType: "session_token", userId: subject },
    { tokenType: "oauth_token", userId: null },
    { tokenType: "oauth_token", userId: subject, scopes: "prefix-bgo:write-suffix" },
  ])("rejects malformed or non-OAuth identity results: %j", async (auth) => {
    toAuth.mockReturnValue(auth);
    await expect(authenticateMcp(requestFor(claims), config)).resolves.toBeNull();
  });

  it.each([
    { aud: undefined },
    { aud: "https://api.example.com" },
    { aud: ["https://api.example.com/mcp/"] },
    { iss: "https://wrong-clerk.example.com" },
    { exp: undefined },
    { exp: now },
    { nbf: now + 60 },
    { sub: "user_another_user" },
  ])("rejects bad verified claims: %j", async (changes) => {
    await expect(
      authenticateMcp(requestFor({ ...claims, ...changes }), config),
    ).resolves.toBeNull();
  });

  it("rejects an unreadable JWT payload", async () => {
    await expect(authenticateMcp(requestFor("invalid-json"), config)).resolves.toBeNull();
  });

  it("verifies a signed access token with the installed Clerk SDK without network access", async () => {
    const { createClerkClient } =
      await vi.importActual<typeof import("@clerk/nextjs/server")>("@clerk/nextjs/server");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    clerkClient.mockResolvedValue(
      createClerkClient({
        jwtKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
        publishableKey: `pk_test_${Buffer.from("example.clerk.accounts.dev$").toString("base64")}`,
        secretKey: "clerk-test-placeholder",
        telemetry: { disabled: true },
      }),
    );
    const encode = (object: object) => Buffer.from(JSON.stringify(object)).toString("base64url");
    const header = encode({ alg: "RS256", kid: "test", typ: "at+jwt" });
    const payload = { ...claims, iat: now - 1, scope: BGO_READ_SCOPE };
    const unsigned = `${header}.${encode(payload)}`;
    const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
    const createRequest = (jwt: string) =>
      new Request(config.resourceUrl, { headers: { authorization: `bearer ${jwt}` } });
    await expect(
      authenticateMcp(createRequest(`${unsigned}.${signature}`), config),
    ).resolves.toEqual({
      userId: subject,
      scopes: [BGO_READ_SCOPE],
    });
    const tampered = `${header}.${encode({ ...payload, scope: BGO_WRITE_SCOPE })}.${signature}`;
    await expect(authenticateMcp(createRequest(tampered), config)).resolves.toBeNull();
  });
});
