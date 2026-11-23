import { withProtectionBypass } from "../../../packages/shared/src/common/api";

export const MCP_PATH = "/mcp";
export const MCP_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";

const allowedMethods = new Map([
  [MCP_PATH, ["POST"]],
  [MCP_METADATA_PATH, ["GET", "OPTIONS"]],
]);
const requestHeaders = [
  "accept",
  "authorization",
  "content-type",
  "mcp-protocol-version",
  "origin",
];
const responseHeaders = [
  "access-control-allow-methods",
  "access-control-allow-origin",
  "allow",
  "content-type",
  "www-authenticate",
];
const privateCache = { "Cache-Control": "private, no-store" };
const productionApi = "https://api.board-game-organizer.com";
const developmentApi =
  /^https:\/\/api-development-pr-[1-9]\d*-board-game-organizers-projects\.vercel\.app$/;

export type GatewayEnvironment = "development" | "production";
type GatewayConfiguration = {
  target: GatewayEnvironment;
  upstream: string | undefined;
  previewBypass: string | undefined;
};

function forwardHeaders(source: Headers, names: string[]): Headers {
  const headers = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

export async function forwardMcpGateway(
  request: Request,
  { target, upstream, previewBypass }: GatewayConfiguration,
  send = fetch,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const methods = allowedMethods.get(path);
  if (!methods) return new Response(null, { status: 404, headers: privateCache });
  if (!methods.includes(request.method)) {
    return new Response(null, {
      status: 405,
      headers: { ...privateCache, Allow: methods.join(", ") },
    });
  }
  if (
    !upstream ||
    (target === "production"
      ? upstream !== productionApi || previewBypass
      : !previewBypass || !developmentApi.test(upstream))
  ) {
    return new Response(null, { status: 503, headers: privateCache });
  }

  try {
    const destination = `${upstream}${path}`;
    const response = await send(
      previewBypass ? withProtectionBypass(destination, previewBypass) : destination,
      {
        method: request.method,
        headers: forwardHeaders(request.headers, requestHeaders),
        body: request.method === "POST" ? await request.arrayBuffer() : undefined,
        redirect: "manual",
        signal: request.signal,
      },
    );
    // Vercel Edge needs manual redirect mode for requests to a protected Preview.
    if (
      (response.status >= 300 && response.status < 400) ||
      response.headers.get("content-type")?.includes("text/html")
    ) {
      return new Response(null, { status: 502, headers: privateCache });
    }
    const headers = forwardHeaders(response.headers, responseHeaders);
    headers.set("cache-control", privateCache["Cache-Control"]);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response(null, { status: 502, headers: privateCache });
  }
}
