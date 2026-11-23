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

function forwardHeaders(source: Headers, names: string[]): Headers {
  const headers = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

export async function forwardDevelopmentMcp(
  request: Request,
  upstream: string | undefined,
  previewBypass: string | undefined,
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
    !previewBypass ||
    !/^https:\/\/api-development-pr-[1-9]\d*-board-game-organizers-projects\.vercel\.app$/.test(
      upstream,
    )
  ) {
    return new Response(null, { status: 503, headers: privateCache });
  }

  try {
    const response = await send(withProtectionBypass(`${upstream}${path}`, previewBypass), {
      method: request.method,
      headers: forwardHeaders(request.headers, requestHeaders),
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "error",
      signal: request.signal,
    });
    if (response.headers.get("content-type")?.includes("text/html")) {
      return new Response(null, { status: 502, headers: privateCache });
    }
    const headers = forwardHeaders(response.headers, responseHeaders);
    headers.set("cache-control", privateCache["Cache-Control"]);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response(null, { status: 502, headers: privateCache });
  }
}
