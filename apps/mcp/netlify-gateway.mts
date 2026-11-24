import { forwardMcpGateway } from "./src/developmentGateway";

export const config = { path: ["/mcp", "/.well-known/oauth-protected-resource/mcp"] };

export default function netlifyGateway(request: Request) {
  const target = process.env.BGO_NETLIFY_STAGE;
  if (target !== "development" && target !== "production") {
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  return forwardMcpGateway(request, {
    target,
    provider: "netlify",
    upstream: process.env.BGO_MCP_UPSTREAM_URL,
    previewBypass: undefined,
  });
}
