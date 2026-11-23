import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";

export const BGO_READ_SCOPE = "bgo:read";
export const BGO_WRITE_SCOPE = "bgo:write";

const metadataPath = "/.well-known/oauth-protected-resource/mcp";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type McpConfiguration = {
  resourceUrl: string;
  issuer: string;
};

export type McpIdentity = {
  userId: string;
  scopes: readonly string[];
};

const accessTokenClaims = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  iss: z.string(),
  nbf: z.number().optional(),
  sub: z.string(),
});
const accessTokenScopes = z.array(z.string());

export function readMcpConfiguration(): McpConfiguration | undefined {
  const resourceUrl = process.env.MCP_RESOURCE_URL?.trim();
  const issuer = process.env.MCP_CLERK_ISSUER?.trim();
  if (!resourceUrl || !issuer) return;

  const resource = URL.parse(resourceUrl);
  const authority = URL.parse(issuer);
  if (
    !resource ||
    resourceUrl !== `${resource.origin}/mcp` ||
    (resource.protocol !== "https:" &&
      !(resource.protocol === "http:" && loopbackHosts.has(resource.hostname))) ||
    !authority ||
    authority.protocol !== "https:" ||
    issuer !== authority.origin
  ) {
    return;
  }

  return { resourceUrl, issuer };
}

export async function authenticateMcp(
  request: Request,
  config: McpConfiguration,
): Promise<McpIdentity | null> {
  const authorization = request.headers.get("authorization");
  const bearer = authorization && /^Bearer ([\w-]+\.([\w-]+)\.[\w-]+)$/i.exec(authorization);
  if (!bearer) return null;

  const client = await clerkClient();
  const state = await client.authenticateRequest(
    new Request(config.resourceUrl, { headers: { Authorization: `Bearer ${bearer[1]}` } }),
    { acceptsToken: "oauth_token", audience: config.resourceUrl },
  );
  if (!state.isAuthenticated) return null;
  const identity = state.toAuth();
  if (identity.tokenType !== "oauth_token" || !identity.userId) return null;
  const scopes = accessTokenScopes.safeParse(identity.scopes);
  if (!scopes.success) return null;

  // The installed Clerk version does not require aud to be present. Inspect only the verified JWT.
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(bearer[2], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const claims = accessTokenClaims.safeParse(payload);
  if (!claims.success) return null;

  const { aud, exp, iss, nbf, sub } = claims.data;
  const now = Date.now() / 1000;
  if (
    iss !== config.issuer ||
    sub !== identity.userId ||
    exp <= now ||
    (nbf !== undefined && nbf > now) ||
    !(typeof aud === "string" ? aud === config.resourceUrl : aud.includes(config.resourceUrl))
  ) {
    return null;
  }

  return { userId: identity.userId, scopes: scopes.data };
}

export function mcpAuthenticationChallenge(
  config: McpConfiguration,
  scope?: string,
  error?: "invalid_token" | "insufficient_scope",
): string {
  const metadata = new URL(metadataPath, config.resourceUrl).href;
  const parameters = [`resource_metadata=${JSON.stringify(metadata)}`];
  if (scope) parameters.push(`scope=${JSON.stringify(scope)}`);
  if (error) {
    const description =
      error === "invalid_token"
        ? "A valid OAuth access token is required"
        : "Additional access is required";
    parameters.push(`error="${error}"`, `error_description="${description}"`);
  }
  return `Bearer ${parameters.join(", ")}`;
}
